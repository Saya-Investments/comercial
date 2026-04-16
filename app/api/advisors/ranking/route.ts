import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getActiveAsesorIds } from '@/lib/supervisor'

export const dynamic = 'force-dynamic'

/**
 * Ranking de actividad por asesor.
 *
 * Query params:
 *   - supervisorId (opcional): restringe a los asesores supervisados.
 *   - date (opcional, YYYY-MM-DD): filtra por dia. Si no se pasa, devuelve acumulado historico.
 *     - recibidos = matchings donde fecha_asignacion es ese dia
 *     - gestionados = leads distintos con crm_acciones_comerciales en ese dia
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const supervisorId = url.searchParams.get('supervisorId')
  const dateParam = url.searchParams.get('date') // YYYY-MM-DD o null

  const asesorIds = await getActiveAsesorIds(supervisorId)

  if (asesorIds.length === 0) return NextResponse.json([])

  // Validar formato YYYY-MM-DD si se pasa
  const isValidDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
  const date = isValidDate ? dateParam : null

  const rows: Array<{
    id_asesor: string
    nombre_asesor: string
    recibidos: bigint
    gestionados: bigint
  }> = date
    ? await prisma.$queryRaw`
        SELECT
          a.id_asesor,
          a.nombre_asesor,
          COALESCE(r.recibidos, 0) AS recibidos,
          COALESCE(g.gestionados, 0) AS gestionados
        FROM comercial.bd_asesores a
        LEFT JOIN (
          SELECT id_asesor, COUNT(*) AS recibidos
          FROM comercial.matching
          WHERE asignado = true
            AND fecha_asignacion IS NOT NULL
            AND DATE(fecha_asignacion AT TIME ZONE 'America/Lima') = ${date}::date
          GROUP BY id_asesor
        ) r ON r.id_asesor = a.id_asesor
        LEFT JOIN (
          -- Opcion B: gestionados del dia = de los leads ASIGNADOS ese dia,
          -- cuantos tienen al menos una accion comercial (sin importar cuando fue la accion).
          -- Ejemplo: lead asignado martes 6pm, gestionado miercoles 2am → cuenta como gestionado
          -- en el filtro martes (porque la cohorte se define por fecha_asignacion).
          SELECT m.id_asesor, COUNT(DISTINCT m.id_lead) AS gestionados
          FROM comercial.matching m
          WHERE m.asignado = true
            AND m.fecha_asignacion IS NOT NULL
            AND DATE(m.fecha_asignacion AT TIME ZONE 'America/Lima') = ${date}::date
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
    : await prisma.$queryRaw`
        SELECT
          a.id_asesor,
          a.nombre_asesor,
          COALESCE(r.recibidos, 0) AS recibidos,
          COALESCE(g.gestionados, 0) AS gestionados
        FROM comercial.bd_asesores a
        LEFT JOIN (
          SELECT id_asesor, COUNT(*) AS recibidos
          FROM comercial.matching
          WHERE asignado = true
          GROUP BY id_asesor
        ) r ON r.id_asesor = a.id_asesor
        LEFT JOIN (
          SELECT u.id_asesor, COUNT(DISTINCT ac.id_lead) AS gestionados
          FROM comercial.crm_acciones_comerciales ac
          JOIN comercial.crm_usuarios u ON u.id_usuario = ac.id_usuario
          WHERE u.id_asesor IS NOT NULL
          GROUP BY u.id_asesor
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
