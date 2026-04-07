import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendLeadAssignedNotification } from '@/lib/email'

export const dynamic = 'force-dynamic'

const CRM_URL = process.env.NEXT_PUBLIC_APP_URL || ''

export async function POST(req: NextRequest) {
  const { leadId, rankingId } = await req.json()

  if (!leadId || !rankingId) {
    return NextResponse.json({ error: 'leadId y rankingId son requeridos' }, { status: 400 })
  }

  // 1. Get the target ranking entry
  const targetRanking = await prisma.ranking_routing.findUnique({
    where: { id: rankingId },
    include: {
      bd_asesores: {
        select: { id_asesor: true, nombre_asesor: true, disponibilidad: true, leads_en_cola: true, capacidad_maxima: true },
      },
    },
  })

  if (!targetRanking || targetRanking.id_lead !== leadId) {
    return NextResponse.json({ error: 'Ranking no encontrado para este lead' }, { status: 404 })
  }

  if (targetRanking.asignado) {
    return NextResponse.json({ error: 'Esta posición ya fue asignada' }, { status: 400 })
  }

  const nuevoAsesorId = targetRanking.id_asesor

  // 2. Get the current assigned matching
  const matchingActual = await prisma.matching.findFirst({
    where: { id_lead: leadId, asignado: true },
    select: { id_matching: true, id_asesor: true },
  })

  if (!matchingActual) {
    return NextResponse.json({ error: 'No hay asignación activa para este lead' }, { status: 400 })
  }

  const asesorAnteriorId = matchingActual.id_asesor

  if (asesorAnteriorId === nuevoAsesorId) {
    return NextResponse.json({ error: 'El lead ya está asignado a este asesor' }, { status: 400 })
  }

  // 3. Check if there's a matching record for the new asesor
  const matchingNuevo = await prisma.matching.findFirst({
    where: { id_lead: leadId, id_asesor: nuevoAsesorId },
    select: { id_matching: true },
  })

  const now = new Date()

  // 4. Execute reassignment in transaction
  const operations = [
    // Unassign current matching
    prisma.matching.update({
      where: { id_matching: matchingActual.id_matching },
      data: { asignado: false },
    }),

    // Mark ranking position as assigned
    prisma.ranking_routing.update({
      where: { id: rankingId },
      data: { asignado: true },
    }),

    // Update lead with new asesor
    prisma.bd_leads.update({
      where: { id_lead: leadId },
      data: { ultimo_asesor_asignado: nuevoAsesorId },
    }),

    // Decrement queue of previous asesor
    prisma.bd_asesores.update({
      where: { id_asesor: asesorAnteriorId },
      data: { leads_en_cola: { decrement: 1 } },
    }),

    // Increment queue of new asesor
    prisma.bd_asesores.update({
      where: { id_asesor: nuevoAsesorId },
      data: { leads_en_cola: { increment: 1 } },
    }),

    // Record in assignment history
    prisma.hist_asignaciones.create({
      data: {
        id_lead: leadId,
        id_asesor: nuevoAsesorId,
        estado_gestion: 'en_espera',
        reasignado: true,
        id_asesor_anterior: asesorAnteriorId,
        motivo_reasignacion: 'Reasignación manual',
      },
    }),
  ]

  // Assign or create matching for the new asesor
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

  // 5. Send email notification to new asesor
  try {
    const usuario = await prisma.crm_usuarios.findFirst({
      where: { id_asesor: nuevoAsesorId, activo: true },
      select: { email: true, nombre: true },
    })

    if (usuario?.email) {
      const lead = await prisma.bd_leads.findUnique({
        where: { id_lead: leadId },
        select: { nombre: true, apellido: true, producto: true, scoring: true, numero: true },
      })

      await sendLeadAssignedNotification({
        to: usuario.email,
        advisorName: usuario.nombre,
        leadName: `${lead?.nombre || ''} ${lead?.apellido || ''}`.trim() || 'Lead',
        producto: lead?.producto || '',
        scoring: Math.round(Number(lead?.scoring || 0) * 100),
        telefono: lead?.numero || '',
        esReasignacion: true,
        crmUrl: CRM_URL || undefined,
      })
    }
  } catch {
    // Email failure doesn't block the reassignment
  }

  return NextResponse.json({
    ok: true,
    nuevoAsesor: targetRanking.bd_asesores.nombre_asesor,
  })
}
