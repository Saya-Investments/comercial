import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getActiveAsesorIds } from '@/lib/supervisor'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supervisorId = new URL(req.url).searchParams.get('supervisorId')
  const asesorIds = await getActiveAsesorIds(supervisorId)

  if (asesorIds.length === 0) {
    return NextResponse.json({
      bot: { totalLeads: 0, enGestion: 0, asignados: 0, descartados: 0 },
      gestion: { enrutados: 0, gestionados: 0, ventasCerradas: 0 },
    })
  }

  // ─── Funnel del Bot: estado_de_lead de los leads asignados a asesores activos ───
  const leadRows: Array<{ estado_de_lead: string; cnt: bigint }> = await prisma.$queryRaw`
    SELECT l.estado_de_lead, COUNT(*) as cnt
    FROM comercial.bd_leads l
    WHERE l.id_lead IN (
      SELECT DISTINCT m.id_lead FROM comercial.matching m
      WHERE m.asignado = true AND m.id_asesor = ANY(${asesorIds}::uuid[])
    )
    GROUP BY l.estado_de_lead
  `
  const estadoMap: Record<string, number> = {}
  for (const row of leadRows) {
    estadoMap[row.estado_de_lead || 'sin_estado'] = Number(row.cnt)
  }
  const totalLeads = Object.values(estadoMap).reduce((a, b) => a + b, 0)
  const enGestion = estadoMap['en_gestion'] || 0
  const asignados = estadoMap['asignado'] || 0
  const descartados = estadoMap['descartado'] || 0

  // ─── Funnel de Gestion (solo asesores activos) ───
  const enrutadosResult: Array<{ count: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT id_lead) as count
    FROM comercial.matching
    WHERE asignado = true AND id_asesor = ANY(${asesorIds}::uuid[])
  `
  const leadsEnrutados = Number(enrutadosResult[0]?.count || 0)

  const gestionadosResult: Array<{ count: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT ac.id_lead) as count
    FROM comercial.crm_acciones_comerciales ac
    JOIN comercial.crm_usuarios u ON u.id_usuario = ac.id_usuario
    WHERE u.id_asesor = ANY(${asesorIds}::uuid[])
  `
  const leadsGestionados = Number(gestionadosResult[0]?.count || 0)

  const ventasResult: Array<{ count: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM (
      SELECT DISTINCT ON (ac.id_lead) ac.id_lead, ac.estado_asesor
      FROM comercial.crm_acciones_comerciales ac
      JOIN comercial.crm_usuarios u ON u.id_usuario = ac.id_usuario
      WHERE u.id_asesor = ANY(${asesorIds}::uuid[])
      ORDER BY ac.id_lead, ac.fecha_creacion DESC
    ) latest
    WHERE estado_asesor = 'Venta_cerrada'
  `
  const ventasCerradas = Number(ventasResult[0]?.count || 0)

  return NextResponse.json({
    bot: { totalLeads, enGestion, asignados, descartados },
    gestion: { enrutados: leadsEnrutados, gestionados: leadsGestionados, ventasCerradas },
  })
}
