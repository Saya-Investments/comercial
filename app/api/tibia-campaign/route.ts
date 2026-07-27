import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { TIBIA_CASCADA_CTE } from '@/lib/tibia-cascada'
import { ESCALONES_CAMPANA, esEscalonTibia, type EscalonTibia } from '@/lib/tibia-constants'

export const dynamic = 'force-dynamic'

const PREVIEW_LIMIT = 1000

type TibiaLeadRow = {
  id_lead: string
  numero: string | null
  nombre: string | null
  apellido: string | null
  correo: string | null
  escalon: string
}

// Solo se aceptan los escalones que el modal ofrece como filtro (P5-P7).
function parseEscalones(searchParams: URLSearchParams): EscalonTibia[] {
  const seleccionables = new Set(ESCALONES_CAMPANA.map((e) => e.code as string))

  return searchParams
    .getAll('escalones')
    .filter((value) => esEscalonTibia(value) && seleccionables.has(value)) as EscalonTibia[]
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  // Conteo por escalon del universo completo: alimenta el "(N leads)" que va al
  // lado de cada checkbox del modal.
  if (action === 'breakdown') {
    const rows = await prisma.$queryRawUnsafe<{ escalon: string; leads: bigint }[]>(
      `${TIBIA_CASCADA_CTE}
       SELECT escalon, COUNT(*)::bigint AS leads
       FROM cascada
       GROUP BY 1 ORDER BY 1`
    )

    const breakdown: Record<string, number> = {}
    for (const row of rows) breakdown[row.escalon] = Number(row.leads)

    return NextResponse.json({ breakdown })
  }

  const escalones = parseEscalones(searchParams)

  if (escalones.length === 0) {
    return NextResponse.json({ total: 0, leads: [] })
  }

  if (action === 'count') {
    const rows = await prisma.$queryRawUnsafe<[{ total: bigint }]>(
      `${TIBIA_CASCADA_CTE}
       SELECT COUNT(*)::bigint AS total
       FROM cascada
       WHERE escalon = ANY($1::text[])`,
      escalones
    )

    return NextResponse.json({ total: Number(rows[0].total) })
  }

  if (action === 'leads') {
    const rows = await prisma.$queryRawUnsafe<TibiaLeadRow[]>(
      `${TIBIA_CASCADA_CTE}
       SELECT l.id_lead::text, l.numero, l.nombre, l.apellido, l.correo, c.escalon
       FROM cascada c
       JOIN comercial.bd_leads l ON l.id_lead = c.id_lead
       WHERE c.escalon = ANY($1::text[])
       ORDER BY c.escalon
       LIMIT ${PREVIEW_LIMIT}`,
      escalones
    )

    return NextResponse.json({ leads: rows, total: rows.length })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
