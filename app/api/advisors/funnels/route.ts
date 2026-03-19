import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  // ─── Funnel del Bot: estado_de_lead ───
  const estadoLeadCounts = await prisma.bd_leads.groupBy({
    by: ['estado_de_lead'],
    _count: { id_lead: true },
  })

  const estadoMap: Record<string, number> = {}
  for (const row of estadoLeadCounts) {
    estadoMap[row.estado_de_lead || 'sin_estado'] = row._count.id_lead
  }

  const totalLeads = Object.values(estadoMap).reduce((a, b) => a + b, 0)
  const enGestion = estadoMap['en_gestion'] || 0
  const asignados = estadoMap['asignado'] || 0
  const descartados = estadoMap['descartado'] || 0

  // ─── Funnel de Gestión ───
  // 1. Leads enrutados (matching con asignado = true, distinct por lead)
  const enrutadosResult: Array<{ count: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT id_lead) as count
    FROM comercial.matching
    WHERE asignado = true
  `
  const leadsEnrutados = Number(enrutadosResult[0]?.count || 0)

  // 2. Leads gestionados (tienen al menos una accion comercial)
  const gestionadosResult: Array<{ count: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT id_lead) as count
    FROM comercial.crm_acciones_comerciales
  `
  const leadsGestionados = Number(gestionadosResult[0]?.count || 0)

  // 3. Leads con venta cerrada (ultimo estado asesor = Venta_cerrada)
  const ventasResult: Array<{ count: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM (
      SELECT DISTINCT ON (id_lead) id_lead, estado_asesor
      FROM comercial.crm_acciones_comerciales
      ORDER BY id_lead, fecha_creacion DESC
    ) latest
    WHERE estado_asesor = 'Venta_cerrada'
  `
  const ventasCerradas = Number(ventasResult[0]?.count || 0)

  return NextResponse.json({
    bot: {
      totalLeads,
      enGestion,
      asignados,
      descartados,
    },
    gestion: {
      enrutados: leadsEnrutados,
      gestionados: leadsGestionados,
      ventasCerradas,
    },
  })
}
