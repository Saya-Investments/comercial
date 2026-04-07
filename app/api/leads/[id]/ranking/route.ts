import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params

  // Get current assigned matching for this lead
  const matchingActual = await prisma.matching.findFirst({
    where: { id_lead: leadId, asignado: true },
    select: { id_asesor: true },
  })

  // Get ranking_routing for this lead ordered by position
  const ranking = await prisma.ranking_routing.findMany({
    where: { id_lead: leadId },
    include: {
      bd_asesores: {
        select: {
          id_asesor: true,
          nombre_asesor: true,
          cod_asesor: true,
          disponibilidad: true,
          leads_en_cola: true,
          capacidad_maxima: true,
        },
      },
    },
    orderBy: { posicion: 'asc' },
  })

  const mapped = ranking.map((r) => ({
    id: r.id,
    posicion: r.posicion,
    idAsesor: r.id_asesor,
    nombreAsesor: r.bd_asesores.nombre_asesor || r.bd_asesores.cod_asesor || 'Sin nombre',
    scoreTotal: r.score_total ? Number(r.score_total) : null,
    asignado: r.asignado,
    esActual: matchingActual?.id_asesor === r.id_asesor,
    disponibilidad: r.bd_asesores.disponibilidad || 'no disponible',
    leadsEnCola: r.bd_asesores.leads_en_cola ?? 0,
    capacidadMaxima: r.bd_asesores.capacidad_maxima,
  }))

  return NextResponse.json(mapped)
}
