import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Orden lógico del funnel de gestión
const FUNNEL_STAGES = [
  'No_contesta',
  'Contactado',
  'Interesado',
  'Seguimiento',
  'Llamada_agendada',
  'Cita_agendada',
  'Venta_cerrada',
  'No_interesado',
] as const

const STAGE_LABELS: Record<string, string> = {
  No_contesta: 'No contesta',
  Contactado: 'Contactado',
  Interesado: 'Interesado',
  Seguimiento: 'Seguimiento',
  Llamada_agendada: 'Llamada agendada',
  Cita_agendada: 'Cita agendada',
  Venta_cerrada: 'Venta cerrada',
  No_interesado: 'No interesado',
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const idAsesor = searchParams.get('id_asesor')
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')

  // Build where clause
  const where: Record<string, unknown> = {}

  if (desde || hasta) {
    where.fecha_creacion = {}
    if (desde) (where.fecha_creacion as Record<string, unknown>).gte = new Date(desde)
    if (hasta) (where.fecha_creacion as Record<string, unknown>).lte = new Date(hasta + 'T23:59:59.999Z')
  }

  if (idAsesor) {
    // Get usuario IDs linked to this asesor
    const usuarios = await prisma.crm_usuarios.findMany({
      where: { id_asesor: idAsesor },
      select: { id_usuario: true },
    })
    where.id_usuario = { in: usuarios.map((u) => u.id_usuario) }
  }

  // Get the latest estado_asesor per lead (most advanced stage reached)
  // We use crm_acciones_comerciales which has the estado_asesor field
  const acciones = await prisma.crm_acciones_comerciales.findMany({
    where,
    select: {
      id_lead: true,
      estado_asesor: true,
      id_usuario: true,
      fecha_creacion: true,
    },
    orderBy: { fecha_creacion: 'desc' },
  })

  // For the funnel: count distinct leads that reached each stage
  // A lead that reached "Venta_cerrada" also passed through earlier stages
  const stageOrder = FUNNEL_STAGES.filter((s) => s !== 'No_interesado')
  const dropoutStage = 'No_interesado'

  // Group by lead -> find the max stage reached
  const leadMaxStage = new Map<string, string>()
  for (const a of acciones) {
    const current = leadMaxStage.get(a.id_lead)
    if (!current) {
      leadMaxStage.set(a.id_lead, a.estado_asesor)
    } else {
      // Keep the most advanced stage
      const currentIdx = stageOrder.indexOf(current as typeof stageOrder[number])
      const newIdx = stageOrder.indexOf(a.estado_asesor as typeof stageOrder[number])
      if (newIdx > currentIdx && newIdx >= 0) {
        leadMaxStage.set(a.id_lead, a.estado_asesor)
      }
      // If the lead was marked No_interesado at any point, keep it as dropout
      if (a.estado_asesor === dropoutStage && current !== 'Venta_cerrada') {
        leadMaxStage.set(a.id_lead, dropoutStage)
      }
    }
  }

  // Count leads per stage (exact: cuántos leads están en cada etapa)
  const exactCounts: Record<string, number> = {}
  for (const stage of FUNNEL_STAGES) exactCounts[stage] = 0

  for (const [, stage] of leadMaxStage) {
    exactCounts[stage] = (exactCounts[stage] || 0) + 1
  }

  const totalLeads = leadMaxStage.size

  // Acumulado tipo embudo: si un lead llegó a etapa X, también pasó por todas las anteriores
  const cumulativeCounts: Record<string, number> = {}
  let accumulated = 0
  for (const stage of [...stageOrder].reverse()) {
    accumulated += exactCounts[stage] || 0
    cumulativeCounts[stage] = accumulated
  }

  // Build funnel data: count = acumulado (para el embudo), exact = solo en esa etapa
  const funnel = stageOrder.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    count: cumulativeCounts[stage] || 0,
    exact: exactCounts[stage] || 0,
  }))

  // Conversion rates entre etapas consecutivas (basado en acumulado)
  const conversions = []
  for (let i = 0; i < funnel.length - 1; i++) {
    const from = funnel[i]
    const to = funnel[i + 1]
    conversions.push({
      from: from.label,
      to: to.label,
      rate: from.count > 0 ? Math.round((to.count / from.count) * 10000) / 100 : 0,
    })
  }

  // Per-advisor breakdown (when no filter)
  let porAsesor: Array<{
    id_asesor: string
    nombre: string
    stages: Record<string, number>
    total: number
  }> = []

  if (!idAsesor) {
    // Get all advisors with their usuario mappings
    const asesores = await prisma.bd_asesores.findMany({
      select: {
        id_asesor: true,
        nombre_asesor: true,
        crm_usuarios: { select: { id_usuario: true } },
      },
      orderBy: { nombre_asesor: 'asc' },
    })

    const usuarioToAsesor = new Map<string, { id: string; nombre: string }>()
    for (const a of asesores) {
      for (const u of a.crm_usuarios) {
        usuarioToAsesor.set(u.id_usuario, {
          id: a.id_asesor,
          nombre: a.nombre_asesor || 'Sin nombre',
        })
      }
    }

    // Group acciones by asesor
    const asesorLeadStages = new Map<string, { nombre: string; leadStages: Map<string, string> }>()

    for (const a of acciones) {
      const asesor = usuarioToAsesor.get(a.id_usuario)
      if (!asesor) continue

      if (!asesorLeadStages.has(asesor.id)) {
        asesorLeadStages.set(asesor.id, { nombre: asesor.nombre, leadStages: new Map() })
      }
      const entry = asesorLeadStages.get(asesor.id)!
      const current = entry.leadStages.get(a.id_lead)
      if (!current) {
        entry.leadStages.set(a.id_lead, a.estado_asesor)
      } else {
        const currentIdx = stageOrder.indexOf(current as typeof stageOrder[number])
        const newIdx = stageOrder.indexOf(a.estado_asesor as typeof stageOrder[number])
        if (newIdx > currentIdx && newIdx >= 0) {
          entry.leadStages.set(a.id_lead, a.estado_asesor)
        }
      }
    }

    porAsesor = Array.from(asesorLeadStages.entries()).map(([id, data]) => {
      const stages: Record<string, number> = {}
      for (const stage of FUNNEL_STAGES) stages[stage] = 0
      for (const [, stage] of data.leadStages) {
        stages[stage] = (stages[stage] || 0) + 1
      }
      return {
        id_asesor: id,
        nombre: data.nombre,
        stages,
        total: data.leadStages.size,
      }
    })
  }

  return NextResponse.json({
    totalLeads,
    funnel,
    conversions,
    dropout: {
      label: STAGE_LABELS[dropoutStage],
      count: exactCounts[dropoutStage] || 0,
    },
    porAsesor,
  })
}
