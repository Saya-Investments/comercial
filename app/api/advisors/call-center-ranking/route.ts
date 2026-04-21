import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Ranking acumulado del call center.
 * Metricas:
 *   - recibidos: leads con bd_leads.asignado_call_center = id_cc
 *   - gestionados: leads con al menos una crm_acciones_comerciales registrada por un usuario
 *     del CC (crm_usuarios.id_call_center = id_cc)
 *   - en_cola: bd_call_center.leads_en_cola (valor en vivo)
 */
export async function GET() {
  const rows: Array<{
    id_call_center: string
    nombre: string
    recibidos: bigint
    gestionados: bigint
    en_cola: number
  }> = await prisma.$queryRaw`
    SELECT
      cc.id_call_center,
      cc.nombre,
      COALESCE(r.recibidos, 0) AS recibidos,
      COALESCE(g.gestionados, 0) AS gestionados,
      cc.leads_en_cola AS en_cola
    FROM comercial.bd_call_center cc
    LEFT JOIN (
      SELECT asignado_call_center, COUNT(*) AS recibidos
      FROM comercial.bd_leads
      WHERE asignado_call_center IS NOT NULL
      GROUP BY asignado_call_center
    ) r ON r.asignado_call_center = cc.id_call_center
    LEFT JOIN (
      SELECT u.id_call_center, COUNT(DISTINCT ac.id_lead) AS gestionados
      FROM comercial.crm_acciones_comerciales ac
      JOIN comercial.crm_usuarios u ON u.id_usuario = ac.id_usuario
      WHERE u.id_call_center IS NOT NULL
      GROUP BY u.id_call_center
    ) g ON g.id_call_center = cc.id_call_center
    ORDER BY recibidos DESC, gestionados DESC
  `

  const data = rows.map((r) => ({
    id: r.id_call_center,
    name: r.nombre,
    recibidos: Number(r.recibidos),
    gestionados: Number(r.gestionados),
    enCola: Number(r.en_cola),
  }))

  return NextResponse.json(data)
}
