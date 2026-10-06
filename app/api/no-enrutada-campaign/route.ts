import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { NO_ENRUTADA_CTE } from '@/lib/no-enrutada-cascada'
import {
  GRUPOS_CAMPANA,
  esGrupoNoEnrutada,
  type GrupoNoEnrutada,
} from '@/lib/no-enrutada-constants'

export const dynamic = 'force-dynamic'

const PREVIEW_LIMIT = 1000

type NoEnrutadaLeadRow = {
  id_lead: string
  numero: string | null
  nombre: string | null
  apellido: string | null
  correo: string | null
  grupo: string
}

// Solo se aceptan los grupos que el modal ofrece como filtro (olas 3 de X1/X2,
// X3, X4 y X5). X1/X2 olas 1-2, X6 y X7 no son campanables.
function parseGrupos(searchParams: URLSearchParams): GrupoNoEnrutada[] {
  const seleccionables = new Set(GRUPOS_CAMPANA.map((g) => g.code as string))

  return searchParams
    .getAll('grupos')
    .filter((value) => esGrupoNoEnrutada(value) && seleccionables.has(value)) as GrupoNoEnrutada[]
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  // Conteo por grupo del universo completo: alimenta el "(N leads)" que va al
  // lado de cada checkbox del modal.
  if (action === 'breakdown') {
    const rows = await prisma.$queryRawUnsafe<{ grupo: string; leads: bigint }[]>(
      `${NO_ENRUTADA_CTE}
       SELECT grupo, COUNT(*)::bigint AS leads
       FROM no_enrutada
       GROUP BY 1 ORDER BY 1`
    )

    const breakdown: Record<string, number> = {}
    for (const row of rows) breakdown[row.grupo] = Number(row.leads)

    return NextResponse.json({ breakdown })
  }

  const grupos = parseGrupos(searchParams)

  if (grupos.length === 0) {
    return NextResponse.json({ total: 0, leads: [] })
  }

  if (action === 'count') {
    const rows = await prisma.$queryRawUnsafe<[{ total: bigint }]>(
      `${NO_ENRUTADA_CTE}
       SELECT COUNT(*)::bigint AS total
       FROM no_enrutada
       WHERE grupo = ANY($1::text[])`,
      grupos
    )

    return NextResponse.json({ total: Number(rows[0].total) })
  }

  if (action === 'leads') {
    // Dentro de cada grupo se ordena por score de mayor a menor, igual que la
    // recomendacion del slide 3 ("dentro de cada ola: score de mayor a menor").
    const rows = await prisma.$queryRawUnsafe<NoEnrutadaLeadRow[]>(
      `${NO_ENRUTADA_CTE}
       SELECT l.id_lead::text, l.numero, l.nombre, l.apellido, l.correo, n.grupo
       FROM no_enrutada n
       JOIN comercial.bd_leads l ON l.id_lead = n.id_lead
       WHERE n.grupo = ANY($1::text[])
       ORDER BY n.grupo, n.score DESC NULLS LAST
       LIMIT ${PREVIEW_LIMIT}`,
      grupos
    )

    return NextResponse.json({ leads: rows, total: rows.length })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
