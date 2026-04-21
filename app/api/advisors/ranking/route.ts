import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getActiveAsesorIds } from '@/lib/supervisor'

export const dynamic = 'force-dynamic'

/**
 * Ranking de actividad por asesor.
 *
 * Query params:
 *   - supervisorId (opcional): restringe a los asesores supervisados.
 *   - date (opcional, YYYY-MM-DD): filtra por dia. Si no se pasa, devuelve acumulado historico.
 *     Cohorte por fecha_asignacion: recibidos = matchings asignados ese dia;
 *     gestionados = de esos mismos, cuantos tienen al menos una accion del asesor
 *     (sin importar cuando fue la accion).
 *   - priority (opcional, "high"|"medium"|"low"): filtra por matching.nivel_al_asignar.
 *     Si no se pasa, no filtra.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const supervisorId = url.searchParams.get('supervisorId')
  const dateParam = url.searchParams.get('date')
  const priorityParam = url.searchParams.get('priority')

  const asesorIds = await getActiveAsesorIds(supervisorId)

  if (asesorIds.length === 0) return NextResponse.json([])

  const isValidDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
  const date = isValidDate ? dateParam : null

  const validPriorities = ['high', 'medium', 'low']
  const priority =
    priorityParam && validPriorities.includes(priorityParam) ? priorityParam : null

  // Filtros compuestos con Prisma.sql para reutilizarlos en ambos subqueries
  const dateFilter = date
    ? Prisma.sql`AND m.fecha_asignacion IS NOT NULL AND DATE(m.fecha_asignacion AT TIME ZONE 'America/Lima') = ${date}::date`
    : Prisma.empty
  const priorityFilter = priority
    ? Prisma.sql`AND m.nivel_al_asignar = ${priority}`
    : Prisma.empty

  const rows: Array<{
    id_asesor: string
    nombre_asesor: string
    recibidos: bigint
    gestionados: bigint
  }> = await prisma.$queryRaw`
    SELECT
      a.id_asesor,
      a.nombre_asesor,
      COALESCE(r.recibidos, 0) AS recibidos,
      COALESCE(g.gestionados, 0) AS gestionados
    FROM comercial.bd_asesores a
    LEFT JOIN (
      SELECT m.id_asesor, COUNT(*) AS recibidos
      FROM comercial.matching m
      WHERE m.asignado = true
        ${dateFilter}
        ${priorityFilter}
      GROUP BY m.id_asesor
    ) r ON r.id_asesor = a.id_asesor
    LEFT JOIN (
      SELECT m.id_asesor, COUNT(DISTINCT m.id_lead) AS gestionados
      FROM comercial.matching m
      WHERE m.asignado = true
        ${dateFilter}
        ${priorityFilter}
        AND EXISTS (
          SELECT 1
          FROM comercial.crm_acciones_comerciales ac
          JOIN comercial.crm_usuarios u ON u.id_usuario = ac.id_usuario
          WHERE ac.id_lead = m.id_lead
            AND u.id_asesor = m.id_asesor
        )
      GROUP BY m.id_asesor
    ) g ON g.id_asesor = a.id_asesor
    WHERE a.id_asesor = ANY(${asesorIds}::uuid[])
    ORDER BY recibidos DESC, gestionados DESC
  `

  const data = rows.map((r) => ({
    id: r.id_asesor,
    name: r.nombre_asesor || 'Sin nombre',
    recibidos: Number(r.recibidos),
    gestionados: Number(r.gestionados),
  }))

  return NextResponse.json(data)
}
