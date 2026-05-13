import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const lead = await prisma.bd_leads.findUnique({
    where: { id_lead: id },
    select: { id_lead: true },
  })

  if (!lead) {
    return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
  }

  await prisma.bd_leads.update({
    where: { id_lead: id },
    data: { bot_pausado: false, bot_pausado_hasta: null },
  })

  return NextResponse.json({ ok: true })
}
