import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getActiveAsesorIds } from '@/lib/supervisor'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supervisorId = new URL(req.url).searchParams.get('supervisorId')
  const asesorIds = await getActiveAsesorIds(supervisorId)

  if (asesorIds.length === 0) return NextResponse.json({ count: 0 })

  const count = await prisma.matching.count({
    where: { asignado: true, id_asesor: { in: asesorIds } },
  })

  return NextResponse.json({ count })
}
