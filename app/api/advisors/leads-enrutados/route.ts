import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const count = await prisma.matching.count({
    where: { asignado: true },
  })

  return NextResponse.json({ count })
}
