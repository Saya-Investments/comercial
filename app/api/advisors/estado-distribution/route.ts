import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Get the most recent estado_asesor per lead from crm_acciones_comerciales
  const results: Array<{ estado_asesor: string; count: bigint }> = await prisma.$queryRaw`
    SELECT estado_asesor, COUNT(*) as count
    FROM (
      SELECT DISTINCT ON (id_lead) id_lead, estado_asesor
      FROM comercial.crm_acciones_comerciales
      ORDER BY id_lead, fecha_creacion DESC
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
