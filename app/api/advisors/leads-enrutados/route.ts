import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSupervisedAsesorIds } from '@/lib/supervisor'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supervisorId = new URL(req.url).searchParams.get('supervisorId')
  const asesorIds = await getSupervisedAsesorIds(supervisorId)

  const where: Record<string, unknown> = { asignado: true }
  if (asesorIds) {
    if (asesorIds.length === 0) return NextResponse.json({ count: 0 })
    where.id_asesor = { in: asesorIds }
  }

  const count = await prisma.matching.count({ where })

  return NextResponse.json({ count })
}
