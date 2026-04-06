import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSupervisedAsesorIds } from '@/lib/supervisor'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supervisorId = new URL(req.url).searchParams.get('supervisorId')
  const asesorIds = await getSupervisedAsesorIds(supervisorId)

  let results: Array<{ estado_asesor: string; count: bigint }>

  if (asesorIds && asesorIds.length > 0) {
    results = await prisma.$queryRaw`
      SELECT estado_asesor, COUNT(*) as count
      FROM (
        SELECT DISTINCT ON (ac.id_lead) ac.id_lead, ac.estado_asesor
        FROM comercial.crm_acciones_comerciales ac
        JOIN comercial.crm_usuarios u ON u.id_usuario = ac.id_usuario
        WHERE u.id_asesor = ANY(${asesorIds}::uuid[])
        ORDER BY ac.id_lead, ac.fecha_creacion DESC
      ) latest
      GROUP BY estado_asesor
      ORDER BY count DESC
    `
  } else if (asesorIds && asesorIds.length === 0) {
    return NextResponse.json([])
  } else {
    results = await prisma.$queryRaw`
      SELECT estado_asesor, COUNT(*) as count
      FROM (
        SELECT DISTINCT ON (id_lead) id_lead, estado_asesor
        FROM comercial.crm_acciones_comerciales
        ORDER BY id_lead, fecha_creacion DESC
      ) latest
      GROUP BY estado_asesor
      ORDER BY count DESC
    `
  }

  const distribution = results.map((r) => ({
    name: r.estado_asesor,
    value: Number(r.count),
  }))

  return NextResponse.json(distribution)
}
