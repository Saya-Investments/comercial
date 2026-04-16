import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getActiveAsesorIds, getSupervisedAsesorIds } from '@/lib/supervisor'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supervisorId = new URL(req.url).searchParams.get('supervisorId')

  // Para el funnel del BOT: usamos la lista supervisada tal cual (null = admin = todos
  // los leads del sistema). NO filtramos por disponibilidad aqui porque el funnel del
  // bot representa el embudo completo del bot (leads conversando con el bot, aun sin
  // enrutarse), no se limita a los que llegaron a un asesor activo.
  const supervisedIds = await getSupervisedAsesorIds(supervisorId)

  // Para el funnel de GESTION: solo asesores activos (excluye renuncias, pruebas, etc.)
  const activeIds = await getActiveAsesorIds(supervisorId)

  // Early return si supervisor no tiene asesores asignados
  if (supervisedIds && supervisedIds.length === 0) {
    return NextResponse.json({
      bot: { totalLeads: 0, enGestion: 0, asignados: 0, descartados: 0 },
      gestion: { enrutados: 0, gestionados: 0, ventasCerradas: 0 },
    })
  }

  // ─── Funnel del Bot: estado_de_lead ───
  // Admin (supervisedIds=null): cuenta TODOS los leads del bot.
  // Supervisor: solo cuenta leads con matching activo a sus asesores supervisados.
  let totalLeads = 0, enGestion = 0, asignados = 0, descartados = 0

  if (supervisedIds) {
    const leadRows: Array<{ estado_de_lead: string; cnt: bigint }> = await prisma.$queryRaw`
      SELECT l.estado_de_lead, COUNT(*) as cnt
      FROM comercial.bd_leads l
      WHERE l.id_lead IN (
        SELECT DISTINCT m.id_lead FROM comercial.matching m
        WHERE m.asignado = true AND m.id_asesor = ANY(${supervisedIds}::uuid[])
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

  // ─── Funnel de Gestion (solo asesores activos) ───
  let leadsEnrutados = 0, leadsGestionados = 0, ventasCerradas = 0

  if (activeIds.length > 0) {
    const enrutadosResult: Array<{ count: bigint }> = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT id_lead) as count
      FROM comercial.matching
      WHERE asignado = true AND id_asesor = ANY(${activeIds}::uuid[])
    `
    leadsEnrutados = Number(enrutadosResult[0]?.count || 0)

    const gestionadosResult: Array<{ count: bigint }> = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT ac.id_lead) as count
      FROM comercial.crm_acciones_comerciales ac
      JOIN comercial.crm_usuarios u ON u.id_usuario = ac.id_usuario
      WHERE u.id_asesor = ANY(${activeIds}::uuid[])
    `
    leadsGestionados = Number(gestionadosResult[0]?.count || 0)

    const ventasResult: Array<{ count: bigint }> = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM (
        SELECT DISTINCT ON (ac.id_lead) ac.id_lead, ac.estado_asesor
        FROM comercial.crm_acciones_comerciales ac
        JOIN comercial.crm_usuarios u ON u.id_usuario = ac.id_usuario
        WHERE u.id_asesor = ANY(${activeIds}::uuid[])
        ORDER BY ac.id_lead, ac.fecha_creacion DESC
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
