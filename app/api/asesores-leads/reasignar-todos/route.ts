import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendLeadAssignedNotification } from '@/lib/email'

export const dynamic = 'force-dynamic'

const CRM_URL = process.env.NEXT_PUBLIC_APP_URL || ''

type Mode = 'ranking' | 'manual'

interface Notificacion {
  email: string
  nombre: string
  lead: { nombre: string; producto: string; scoring: number; telefono: string }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const idAsesor: string | undefined = body.idAsesor
  const mode: Mode = body.mode
  const targetAsesorId: string | undefined = body.targetAsesorId

  if (!idAsesor) {
    return NextResponse.json({ error: 'idAsesor es requerido' }, { status: 400 })
  }
  if (mode !== 'ranking' && mode !== 'manual') {
    return NextResponse.json({ error: 'mode debe ser "ranking" o "manual"' }, { status: 400 })
  }
  if (mode === 'manual' && !targetAsesorId) {
    return NextResponse.json({ error: 'targetAsesorId es requerido para mode "manual"' }, { status: 400 })
  }
  if (mode === 'manual' && targetAsesorId === idAsesor) {
    return NextResponse.json({ error: 'No se puede reasignar al mismo asesor' }, { status: 400 })
  }

  // 1. Get all currently assigned matchings for this asesor
  const matchings = await prisma.matching.findMany({
    where: { id_asesor: idAsesor, asignado: true },
    select: { id_matching: true, id_lead: true },
  })

  if (matchings.length === 0) {
    return NextResponse.json({
      ok: true,
      totalLeads: 0,
      reasignados: 0,
      errores: ['El asesor no tiene leads asignados'],
    })
  }

  const now = new Date()
  let reasignados = 0
  const errores: string[] = []
  const notificaciones: Notificacion[] = []

  for (const match of matchings) {
    try {
      const leadId = match.id_lead
      let nuevoAsesorId: string
      let rankingIdToMark: number | null = null

      if (mode === 'ranking') {
        // Find current position of this asesor in ranking
        const posicionActual = await prisma.ranking_routing.findFirst({
          where: { id_lead: leadId, id_asesor: idAsesor },
          select: { posicion: true },
        })

        if (!posicionActual) {
          errores.push(`Lead ${leadId}: asesor no encontrado en ranking_routing`)
          continue
        }

        // Find next available
        const siguientes = await prisma.ranking_routing.findMany({
          where: {
            id_lead: leadId,
            posicion: { gt: posicionActual.posicion },
            asignado: false,
          },
          include: {
            bd_asesores: {
              select: {
                id_asesor: true,
                leads_en_cola: true,
                capacidad_maxima: true,
                disponibilidad: true,
              },
            },
          },
          orderBy: { posicion: 'asc' },
        })

        const siguiente = siguientes.find(
          (r) =>
            r.bd_asesores.disponibilidad === 'disponible' &&
            (r.bd_asesores.leads_en_cola ?? 0) < r.bd_asesores.capacidad_maxima
        )

        if (!siguiente) {
          errores.push(`Lead ${leadId}: no hay siguiente asesor disponible en ranking`)
          continue
        }

        nuevoAsesorId = siguiente.id_asesor
        rankingIdToMark = siguiente.id
      } else {
        // mode === 'manual'
        nuevoAsesorId = targetAsesorId!

        // Find ranking position of the target asesor for this lead (should exist)
        const posicionTarget = await prisma.ranking_routing.findFirst({
          where: { id_lead: leadId, id_asesor: nuevoAsesorId },
          select: { id: true, asignado: true },
        })

        if (posicionTarget && !posicionTarget.asignado) {
          rankingIdToMark = posicionTarget.id
        }
        // If target is not in ranking or already marked, we still proceed with matching update
        // (manual override bypasses ranking consistency)
      }

      // Check if matching exists for new asesor
      const matchingNuevo = await prisma.matching.findFirst({
        where: { id_lead: leadId, id_asesor: nuevoAsesorId },
        select: { id_matching: true },
      })

      // Build transaction operations
      const operations = [
        prisma.matching.update({
          where: { id_matching: match.id_matching },
          data: { asignado: false },
        }),
        prisma.bd_leads.update({
          where: { id_lead: leadId },
          data: { ultimo_asesor_asignado: nuevoAsesorId },
        }),
        prisma.bd_asesores.update({
          where: { id_asesor: idAsesor },
          data: { leads_en_cola: { decrement: 1 } },
        }),
        prisma.bd_asesores.update({
          where: { id_asesor: nuevoAsesorId },
          data: { leads_en_cola: { increment: 1 } },
        }),
        prisma.hist_asignaciones.create({
          data: {
            id_lead: leadId,
            id_asesor: nuevoAsesorId,
            estado_gestion: 'en_espera',
            reasignado: true,
            id_asesor_anterior: idAsesor,
            motivo_reasignacion:
              mode === 'ranking'
                ? 'Reasignación manual por ranking'
                : 'Reasignación manual a asesor específico',
          },
        }),
      ]

      if (rankingIdToMark !== null) {
        operations.push(
          prisma.ranking_routing.update({
            where: { id: rankingIdToMark },
            data: { asignado: true },
          })
        )
      }

      if (matchingNuevo) {
        operations.push(
          prisma.matching.update({
            where: { id_matching: matchingNuevo.id_matching },
            data: { asignado: true, fecha_asignacion: now, notificado_asesor: false },
          })
        )
      } else {
        operations.push(
          prisma.matching.create({
            data: {
              id_lead: leadId,
              id_asesor: nuevoAsesorId,
              asignado: true,
              fecha_asignacion: now,
              notificado_asesor: false,
            },
          })
        )
      }

      await prisma.$transaction(operations)
      reasignados++

      // Queue email notification
      const usuario = await prisma.crm_usuarios.findFirst({
        where: { id_asesor: nuevoAsesorId, activo: true },
        select: { email: true, nombre: true },
      })

      if (usuario?.email) {
        const lead = await prisma.bd_leads.findUnique({
          where: { id_lead: leadId },
          select: { nombre: true, apellido: true, producto: true, scoring: true, numero: true },
        })

        notificaciones.push({
          email: usuario.email,
          nombre: usuario.nombre,
          lead: {
            nombre: `${lead?.nombre || ''} ${lead?.apellido || ''}`.trim() || 'Lead',
            producto: lead?.producto || '',
            scoring: Math.round(Number(lead?.scoring || 0) * 100),
            telefono: lead?.numero || '',
          },
        })
      }
    } catch (err) {
      errores.push(`Lead ${match.id_lead}: ${(err as Error).message}`)
    }
  }

  // Send emails (don't block on failure)
  for (const n of notificaciones) {
    try {
      await sendLeadAssignedNotification({
        to: n.email,
        advisorName: n.nombre,
        leadName: n.lead.nombre,
        producto: n.lead.producto,
        scoring: n.lead.scoring,
        telefono: n.lead.telefono,
        esReasignacion: true,
        crmUrl: CRM_URL || undefined,
      })
    } catch {
      // Silent email failure
    }
  }

  return NextResponse.json({
    ok: true,
    totalLeads: matchings.length,
    reasignados,
    errores: errores.length > 0 ? errores : undefined,
  })
}
