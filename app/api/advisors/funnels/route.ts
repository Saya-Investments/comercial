import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSupervisedAsesorIds } from '@/lib/supervisor'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supervisorId = new URL(req.url).searchParams.get('supervisorId')
  const asesorIds = await getSupervisedAsesorIds(supervisorId)

  if (asesorIds && asesorIds.length === 0) {
    return NextResponse.json({
      bot: { totalLeads: 0, enGestion: 0, asignados: 0, descartados: 0 },
      gestion: { enrutados: 0, gestionados: 0, ventasCerradas: 0 },
    })
  }

  // ─── Funnel del Bot: estado_de_lead ───
  // When supervisor, only count leads assigned to their asesores
  let totalLeads = 0, enGestion = 0, asignados = 0, descartados = 0

  if (asesorIds) {
    // Get lead IDs assigned to supervised asesores
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
    totalLeads = Object.values(estadoMap).reduce((a, b) => a + b, 0)
    enGestion = estadoMap['en_gestion'] || 0
    asignados = estadoMap['asignado'] || 0
    descartados = estadoMap['descartado'] || 0
  } else {
    const estadoLeadCounts = await prisma.bd_leads.groupBy({
      by: ['estado_de_lead'],
      _count: { id_lead: true },
    })
    const estadoMap: Record<string, number> = {}
    for (const row of estadoLeadCounts) {
      estadoMap[row.estado_de_lead || 'sin_estado'] = row._count.id_lead
    }
    totalLeads = Object.values(estadoMap).reduce((a, b) => a + b, 0)
    enGestion = estadoMap['en_gestion'] || 0
    asignados = estadoMap['asignado'] || 0
    descartados = estadoMap['descartado'] || 0
  }

  // ─── Funnel de Gestión ───
  let leadsEnrutados: number, leadsGestionados: number, ventasCerradas: number

  if (asesorIds) {
    const enrutadosResult: Array<{ count: bigint }> = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT id_lead) as count
      FROM comercial.matching
      WHERE asignado = true AND id_asesor = ANY(${asesorIds}::uuid[])
    `
    leadsEnrutados = Number(enrutadosResult[0]?.count || 0)

    const gestionadosResult: Array<{ count: bigint }> = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT ac.id_lead) as count
      FROM comercial.crm_acciones_comerciales ac
      JOIN comercial.crm_usuarios u ON u.id_usuario = ac.id_usuario
      WHERE u.id_asesor = ANY(${asesorIds}::uuid[])
    `
    leadsGestionados = Number(gestionadosResult[0]?.count || 0)

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
    ventasCerradas = Number(ventasResult[0]?.count || 0)
  } else {
    const enrutadosResult: Array<{ count: bigint }> = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT id_lead) as count
      FROM comercial.matching
      WHERE asignado = true
    `
    leadsEnrutados = Number(enrutadosResult[0]?.count || 0)

    const gestionadosResult: Array<{ count: bigint }> = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT id_lead) as count
      FROM comercial.crm_acciones_comerciales
    `
    leadsGestionados = Number(gestionadosResult[0]?.count || 0)

    const ventasResult: Array<{ count: bigint }> = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM (
        SELECT DISTINCT ON (id_lead) id_lead, estado_asesor
        FROM comercial.crm_acciones_comerciales
        ORDER BY id_lead, fecha_creacion DESC
      ) latest
      WHERE estado_asesor = 'Venta_cerrada'
    `
    ventasCerradas = Number(ventasResult[0]?.count || 0)
  }

  return NextResponse.json({
    bot: { totalLeads, enGestion, asignados, descartados },
    gestion: { enrutados: leadsEnrutados, gestionados: leadsGestionados, ventasCerradas },
  })
}
