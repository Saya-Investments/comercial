import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const leadId = searchParams.get('leadId')

  if (!leadId) {
    return NextResponse.json({ error: 'leadId es requerido' }, { status: 400 })
  }

  const historial = await prisma.hist_scoring.findMany({
    where: { id_lead: leadId },
    orderBy: { timestamp: 'asc' },
  })

  const mapped = historial.map((h) => ({
    id: h.id_hist,
    scoringAnterior: h.scoring_anterior ? Number(h.scoring_anterior) : null,
    scoringNuevo: h.scoring_nuevo ? Number(h.scoring_nuevo) : null,
    deltaScoring: h.delta_scoring ? Number(h.delta_scoring) : null,
    eventoTrigger: h.evento_trigger,
    nivelInteres: h.nivel_interes ? Number(h.nivel_interes) : null,
    sentimiento: h.sentimiento,
    contactabilidad: h.contactabilidad ? Number(h.contactabilidad) : null,
    timestamp: h.timestamp.toISOString(),
  }))

  return NextResponse.json(mapped)
}
