import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { sendLeadAssignedNotification } from '@/lib/email'

export const dynamic = 'force-dynamic'

const CRM_URL = process.env.NEXT_PUBLIC_APP_URL || ''

type Mode = 'ranking' | 'manual'

// Niveles de cuota (Regla 1 — split en cuotas_semanales)
type Nivel = 'high' | 'medium' | 'low'

function clasificarNivel(score: number): Nivel {
  if (score >= 0.70) return 'high'
  if (score >= 0.40) return 'medium'
  return 'low'
}

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
  const leadId: string | undefined = body.leadId

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

  // 1. Get currently assigned matchings for this asesor (optionally filtered by leadId)
  const matchings = await prisma.matching.findMany({
    where: {
      id_asesor: idAsesor,
      asignado: true,
      ...(leadId ? { id_lead: leadId } : {}),
    },
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
                disponibilidad: true,
              },
            },
          },
          orderBy: { posicion: 'asc' },
        })

        const siguiente = siguientes.find(
          (r) => r.bd_asesores.disponibilidad === 'disponible'
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

      // Cargar score actual del lead y el nivel persistido en el matching original
      // para la dec/inc de cuotas (Regla 1).
      // - nivelAnterior: el nivel con el que se incrementó el contador del asesor original.
      //   Se lee de match.nivel_al_asignar; fallback al score actual si esta NULL.
      // - nivelNuevo: el nivel del lead AHORA, usado para incrementar el contador del nuevo asesor.
      const matchOriginal = await prisma.matching.findUnique({
        where: { id_matching: match.id_matching },
        select: { nivel_al_asignar: true },
      })
      const leadScoring = await prisma.bd_leads.findUnique({
        where: { id_lead: leadId },
        select: { scoring: true },
      })
      const scoreLeadActual = Number(leadScoring?.scoring ?? 0)
      const nivelNuevo = clasificarNivel(scoreLeadActual)
      const nivelAnterior: Nivel =
        (matchOriginal?.nivel_al_asignar as Nivel | null) ?? nivelNuevo

      const colRecib = `recibidos_${nivelNuevo}`
      const colRecibAnterior = `recibidos_${nivelAnterior}`

      // Ejecutar reasignacion en transaccion (callback form para usar $executeRaw)
      await prisma.$transaction(async (tx) => {
        await tx.matching.update({
          where: { id_matching: match.id_matching },
          data: { asignado: false },
        })

        await tx.bd_leads.update({
          where: { id_lead: leadId },
          data: { ultimo_asesor_asignado: nuevoAsesorId },
        })

        await tx.bd_asesores.update({
          where: { id_asesor: idAsesor },
          data: { leads_en_cola: { decrement: 1 } },
        })

        await tx.bd_asesores.update({
          where: { id_asesor: nuevoAsesorId },
          data: { leads_en_cola: { increment: 1 } },
        })

        // Regla 1 — Decrementar recibidos_<nivelAnterior> del asesor anterior.
        // nivelAnterior viene de matching.nivel_al_asignar (o fallback al score actual).
        await tx.$executeRaw`
          UPDATE comercial.cuotas_semanales
          SET ${Prisma.raw(colRecibAnterior)} = GREATEST(${Prisma.raw(colRecibAnterior)} - 1, 0)
          WHERE id_asesor = ${idAsesor}::uuid
            AND semana_inicio = date_trunc('week', CURRENT_DATE)::date
        `

        // Regla 1 — Incrementar recibidos_<nivelNuevo> del nuevo asesor.
        // nivelNuevo es el nivel del lead al momento de la reasignacion.
        await tx.$executeRaw`
          UPDATE comercial.cuotas_semanales
          SET ${Prisma.raw(colRecib)} = ${Prisma.raw(colRecib)} + 1
          WHERE id_asesor = ${nuevoAsesorId}::uuid
            AND semana_inicio = date_trunc('week', CURRENT_DATE)::date
        `

        await tx.hist_asignaciones.create({
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
        })

        if (rankingIdToMark !== null) {
          await tx.ranking_routing.update({
            where: { id: rankingIdToMark },
            data: { asignado: true },
          })
        }

        if (matchingNuevo) {
          await tx.matching.update({
            where: { id_matching: matchingNuevo.id_matching },
            data: {
              asignado: true,
              fecha_asignacion: now,
              notificado_asesor: false,
              nivel_al_asignar: nivelNuevo,
            },
          })
        } else {
          await tx.matching.create({
            data: {
              id_lead: leadId,
              id_asesor: nuevoAsesorId,
              asignado: true,
              fecha_asignacion: now,
              notificado_asesor: false,
              nivel_al_asignar: nivelNuevo,
            },
          })
        }
      })

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
