import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getActiveAsesorIds } from '@/lib/supervisor'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supervisorId = new URL(req.url).searchParams.get('supervisorId')
  const asesorIds = await getActiveAsesorIds(supervisorId)

  if (asesorIds.length === 0) return NextResponse.json([])

  // Incluye acciones de asesores activos + acciones de usuarios del CC.
  // El DISTINCT ON toma el ultimo estado del lead entre ambos actores,
  // asi refleja el estado mas reciente real del lead (si el CC lo toco
  // y luego el asesor, gana el asesor; y viceversa).
  const results: Array<{ estado_asesor: string; count: bigint }> = await prisma.$queryRaw`
    SELECT estado_asesor, COUNT(*) as count
    FROM (
      SELECT DISTINCT ON (ac.id_lead) ac.id_lead, ac.estado_asesor
      FROM comercial.crm_acciones_comerciales ac
      JOIN comercial.crm_usuarios u ON u.id_usuario = ac.id_usuario
      WHERE u.id_asesor = ANY(${asesorIds}::uuid[])
         OR u.id_call_center IS NOT NULL
      ORDER BY ac.id_lead, ac.fecha_creacion DESC
    ) latest
    GROUP BY estado_asesor
    ORDER BY count DESC
  `

  const distribution = results.map((r) => ({
    name: r.estado_asesor,
    value: Number(r.count),
  }))

  return NextResponse.json(distribution)
}
