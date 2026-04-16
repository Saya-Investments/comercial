import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getActiveAsesorIds } from '@/lib/supervisor'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supervisorId = new URL(req.url).searchParams.get('supervisorId')
  const asesorIds = await getActiveAsesorIds(supervisorId)

  if (asesorIds.length === 0) return NextResponse.json([])

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
