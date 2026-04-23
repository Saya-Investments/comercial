import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Metricas de derivaciones del Call Center.
 *
 * Query params:
 *   - date (opcional, YYYY-MM-DD): filtra "recibidos" por fecha_asignacion_cc
 *     y "derivados" por fecha_derivacion (ambas en zona Lima). Si no se pasa,
 *     devuelve acumulado historico. `en_gestion` siempre refleja estado actual.
 *
 * Por cada agente del CC devuelve:
 *   - recibidos: leads que fueron asignados al CC (filas historicas)
 *   - derivados: leads que ya salieron del CC (fecha_derivacion NOT NULL)
 *   - en_gestion: leads actualmente en el CC (fecha_derivacion IS NULL)
 *   - derivados_timeout / derivados_manual / ventas_cerradas: desglose por motivo
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const dateParam = url.searchParams.get('date')
  const isValidDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
  const date = isValidDate ? dateParam : null

  const recibidosDateFilter = date
    ? Prisma.sql`AND DATE(fecha_asignacion_cc AT TIME ZONE 'America/Lima') = ${date}::date`
    : Prisma.empty
  const derivadosDateFilter = date
    ? Prisma.sql`AND DATE(fecha_derivacion AT TIME ZONE 'America/Lima') = ${date}::date`
    : Prisma.empty

  const rows: Array<{
    id_call_center: string
    nombre: string
    recibidos: bigint
    derivados: bigint
    en_gestion: bigint
    derivados_timeout: bigint
    derivados_manual: bigint
    ventas_cerradas: bigint
  }> = await prisma.$queryRaw`
    SELECT
      cc.id_call_center,
      cc.nombre,
      COALESCE(r.recibidos, 0) AS recibidos,
      COALESCE(d.derivados, 0) AS derivados,
      COALESCE(e.en_gestion, 0) AS en_gestion,
      COALESCE(d.derivados_timeout, 0) AS derivados_timeout,
      COALESCE(d.derivados_manual, 0) AS derivados_manual,
      COALESCE(d.ventas_cerradas, 0) AS ventas_cerradas
    FROM comercial.bd_call_center cc
    LEFT JOIN (
      SELECT id_call_center, COUNT(*) AS recibidos
      FROM comercial.hist_cc_derivaciones
      WHERE 1=1
        ${recibidosDateFilter}
      GROUP BY id_call_center
    ) r ON r.id_call_center = cc.id_call_center
    LEFT JOIN (
      SELECT
        id_call_center,
        COUNT(*) AS derivados,
        COUNT(*) FILTER (WHERE motivo_derivacion = 'timeout_4h') AS derivados_timeout,
        COUNT(*) FILTER (WHERE motivo_derivacion = 'manual') AS derivados_manual,
        COUNT(*) FILTER (WHERE motivo_derivacion = 'venta_cerrada') AS ventas_cerradas
      FROM comercial.hist_cc_derivaciones
      WHERE fecha_derivacion IS NOT NULL
        ${derivadosDateFilter}
      GROUP BY id_call_center
    ) d ON d.id_call_center = cc.id_call_center
    LEFT JOIN (
      SELECT id_call_center, COUNT(*) AS en_gestion
      FROM comercial.hist_cc_derivaciones
      WHERE fecha_derivacion IS NULL
      GROUP BY id_call_center
    ) e ON e.id_call_center = cc.id_call_center
    ORDER BY recibidos DESC, derivados DESC
  `

  const data = rows.map((r) => ({
    id: r.id_call_center,
    name: r.nombre,
    recibidos: Number(r.recibidos),
    derivados: Number(r.derivados),
    enGestion: Number(r.en_gestion),
    derivadosPorTimeout: Number(r.derivados_timeout),
    derivadosManual: Number(r.derivados_manual),
    ventasCerradas: Number(r.ventas_cerradas),
  }))

  return NextResponse.json(data)
}
