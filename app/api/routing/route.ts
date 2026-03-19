import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const leadId = searchParams.get('leadId')

  const where: Record<string, unknown> = {}
  if (leadId) where.id_lead = leadId

  const matchings = await prisma.matching.findMany({
    where,
    include: {
      bd_leads: {
        select: { id_lead: true, dni: true, nombre: true, apellido: true, producto: true, scoring: true, estado_de_lead: true },
      },
      bd_asesores: {
        select: { id_asesor: true, nombre_asesor: true, cod_asesor: true, especialidad: true, disponibilidad: true, leads_en_cola: true },
      },
    },
    orderBy: [{ fecha_evaluacion: 'desc' }],
    take: 500,
  })

  // Agrupar por asesor
  const asesoresMap = new Map<string, {
    asesor: {
      id: string
      nombre: string
      cod: string
      especialidad: string
      disponibilidad: string
      leadsEnCola: number
    }
    leads: Array<{
      id: string
      dni: string
      name: string
      producto: string
      scoring: number
      estado: string
      scoreTotal: number
      scoreK: number
      scoreC: number
      scoreV: number
      scoreP: number
      asignado: boolean
      fechaEvaluacion: string
    }>
  }>()

  for (const m of matchings) {
    const asesorKey = m.id_asesor
    if (!asesoresMap.has(asesorKey)) {
      asesoresMap.set(asesorKey, {
        asesor: {
          id: m.bd_asesores.id_asesor,
          nombre: m.bd_asesores.nombre_asesor || '',
          cod: m.bd_asesores.cod_asesor || '',
          especialidad: m.bd_asesores.especialidad || '',
          disponibilidad: m.bd_asesores.disponibilidad || '',
          leadsEnCola: m.bd_asesores.leads_en_cola || 0,
        },
        leads: [],
      })
    }

    asesoresMap.get(asesorKey)!.leads.push({
      id: m.bd_leads.id_lead,
      dni: m.bd_leads.dni || '',
      name: `${m.bd_leads.nombre || ''} ${m.bd_leads.apellido || ''}`.trim(),
      producto: m.bd_leads.producto || '',
      scoring: Math.round(Number(m.bd_leads.scoring || 0) * 100),
      estado: m.bd_leads.estado_de_lead || '',
      scoreTotal: Math.round(Number(m.score_total || 0) * 100),
      scoreK: Math.round(Number(m.score_k || 0) * 100),
      scoreC: Math.round(Number(m.score_c || 0) * 100),
      scoreV: Math.round(Number(m.score_v || 0) * 100),
      scoreP: Math.round(Number(m.score_p || 0) * 100),
      asignado: m.asignado ?? false,
      fechaEvaluacion: m.fecha_evaluacion.toISOString(),
    })
  }

  // Ordenar leads de cada asesor por score_total descendente
  // y actualizar leadsEnCola con el conteo real de matching
  for (const entry of asesoresMap.values()) {
    entry.leads.sort((a, b) => b.scoreTotal - a.scoreTotal)
    entry.asesor.leadsEnCola = entry.leads.length
  }

  return NextResponse.json(Array.from(asesoresMap.values()))
}
