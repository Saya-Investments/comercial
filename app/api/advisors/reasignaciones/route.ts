import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPilotAsesorIds } from '@/lib/supervisor'

export const dynamic = 'force-dynamic'

/**
 * Reasignaciones por asesor.
 *
 * Devuelve para cada asesor del piloto:
 *   - quitados: leads que se le quitaron por reasignacion (era el id_asesor_anterior)
 *   - asignados: leads que recibio producto de una reasignacion (es el id_asesor, reasignado=true)
 *
 * Query params:
 *   - supervisorId (opcional): restringe a los asesores supervisados.
 *   - date (opcional, YYYY-MM-DD, zona Lima): filtra por dia segun hist_asignaciones.fecha_asignacion
 *     del evento de reasignacion. Sin date, devuelve acumulado historico.
 *
 * Incluye asesores que renunciaron (ej. Reategui) porque participaron en el piloto.
 * Excluye asesores que nunca participaron (ej. Vela, que era de prueba).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const supervisorId = url.searchParams.get('supervisorId')
  const dateParam = url.searchParams.get('date')

  const asesorIds = await getPilotAsesorIds(supervisorId)
  if (asesorIds.length === 0) return NextResponse.json([])

  const isValidDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
  const date = isValidDate ? dateParam : null

  const rows: Array<{
    id_asesor: string
    nombre_asesor: string
    disponibilidad: string | null
    quitados: bigint
    asignados: bigint
  }> = date
    ? await prisma.$queryRaw`
        SELECT
          a.id_asesor,
          a.nombre_asesor,
          a.disponibilidad,
          COALESCE(q.cnt, 0) AS quitados,
          COALESCE(asg.cnt, 0) AS asignados
        FROM comercial.bd_asesores a
        LEFT JOIN (
          SELECT id_asesor_anterior AS id_asesor, COUNT(*) AS cnt
          FROM comercial.hist_asignaciones
          WHERE reasignado = true
            AND id_asesor_anterior IS NOT NULL
            AND DATE(fecha_asignacion AT TIME ZONE 'America/Lima') = ${date}::date
          GROUP BY id_asesor_anterior
        ) q ON q.id_asesor = a.id_asesor
        LEFT JOIN (
          SELECT id_asesor, COUNT(*) AS cnt
          FROM comercial.hist_asignaciones
          WHERE reasignado = true
            AND DATE(fecha_asignacion AT TIME ZONE 'America/Lima') = ${date}::date
          GROUP BY id_asesor
        ) asg ON asg.id_asesor = a.id_asesor
        WHERE a.id_asesor = ANY(${asesorIds}::uuid[])
        ORDER BY quitados DESC, asignados DESC, a.nombre_asesor ASC
      `
    : await prisma.$queryRaw`
        SELECT
          a.id_asesor,
          a.nombre_asesor,
          a.disponibilidad,
          COALESCE(q.cnt, 0) AS quitados,
          COALESCE(asg.cnt, 0) AS asignados
        FROM comercial.bd_asesores a
        LEFT JOIN (
          SELECT id_asesor_anterior AS id_asesor, COUNT(*) AS cnt
          FROM comercial.hist_asignaciones
          WHERE reasignado = true
            AND id_asesor_anterior IS NOT NULL
          GROUP BY id_asesor_anterior
        ) q ON q.id_asesor = a.id_asesor
        LEFT JOIN (
          SELECT id_asesor, COUNT(*) AS cnt
          FROM comercial.hist_asignaciones
          WHERE reasignado = true
          GROUP BY id_asesor
        ) asg ON asg.id_asesor = a.id_asesor
        WHERE a.id_asesor = ANY(${asesorIds}::uuid[])
        ORDER BY quitados DESC, asignados DESC, a.nombre_asesor ASC
      `

  const data = rows.map((r) => ({
    id: r.id_asesor,
    name: r.nombre_asesor || 'Sin nombre',
    disponibilidad: r.disponibilidad || 'disponible',
    quitados: Number(r.quitados),
    asignados: Number(r.asignados),
  }))

  return NextResponse.json(data)
}
