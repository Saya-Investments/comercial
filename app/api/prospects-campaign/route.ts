import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { RANGO_DESDE } from '@/lib/prospect-funnel-cross'

export const dynamic = 'force-dynamic'

type RawEstado = { estado_documento: string | null }
type RawProspectLead = {
  id_lead: string
  numero: string | null
  nombre: string | null
  apellido: string | null
  correo: string | null
  estado_documento: string | null
}

// Misma lógica que el funnel: todos los leads del rango con match en nsv_prospectos.
const BASE_JOIN = `
  FROM comercial.bd_leads l
  JOIN LATERAL (
    SELECT np.estado_documento, np.fecha_estado
    FROM comercial.nsv_prospectos np
    WHERE np.telefono_norm = RIGHT(
            REGEXP_REPLACE(COALESCE(l.numero, ''), '[^0-9]', '', 'g'), 9)
      AND np.fecha_registro > l.fecha_creacion
    ORDER BY np.fecha_registro DESC
    LIMIT 1
  ) p ON true
  WHERE l.fecha_creacion >= '${RANGO_DESDE}'::timestamptz
    AND l.fecha_creacion <= NOW()
    AND l.numero IS NOT NULL
    AND NOW() - p.fecha_estado > INTERVAL '4 days'
`

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  if (action === 'filters') {
    const rows = await prisma.$queryRawUnsafe<RawEstado[]>(
      `SELECT DISTINCT TRIM(p.estado_documento) AS estado_documento
       ${BASE_JOIN}
         AND TRIM(p.estado_documento) <> ''
       ORDER BY 1`
    )
    const estados = rows.map((r) => r.estado_documento!).filter(Boolean)

    const baseRows = await prisma.$queryRawUnsafe<{ base: string | null }[]>(
      `SELECT DISTINCT TRIM(l.base) AS base
       FROM comercial.bd_leads l
       WHERE l.fecha_creacion >= '${RANGO_DESDE}'::timestamptz
         AND l.base IS NOT NULL
         AND TRIM(l.base) <> ''
       ORDER BY 1`
    )
    const bases = baseRows.map((r) => r.base!).filter(Boolean)

    return NextResponse.json({ estados, bases })
  }

  const estadosParam = searchParams.getAll('estados')

  if (estadosParam.length === 0) {
    return NextResponse.json({ total: 0, leads: [] })
  }

  const placeholders = estadosParam.map((_, i) => `$${i + 1}`).join(', ')

  // Filtro opcional por base (columna "Base" de bd_leads: Caliente, Stock, ...).
  const basesParam = searchParams.getAll('bases')
  const queryParams: string[] = [...estadosParam]
  let baseClause = ''
  if (basesParam.length > 0) {
    const basePlaceholders = basesParam
      .map((_, i) => `$${estadosParam.length + i + 1}`)
      .join(', ')
    baseClause = ` AND TRIM(l.base) IN (${basePlaceholders})`
    queryParams.push(...basesParam)
  }

  if (action === 'count') {
    const rows = await prisma.$queryRawUnsafe<[{ total: bigint }]>(
      `SELECT COUNT(DISTINCT l.id_lead)::bigint AS total
       ${BASE_JOIN}
         AND TRIM(p.estado_documento) IN (${placeholders})${baseClause}`,
      ...queryParams
    )
    return NextResponse.json({ total: Number(rows[0].total) })
  }

  if (action === 'leads') {
    const rows = await prisma.$queryRawUnsafe<RawProspectLead[]>(
      `SELECT DISTINCT ON (l.id_lead)
         l.id_lead::text,
         l.numero,
         l.nombre,
         l.apellido,
         l.correo,
         TRIM(p.estado_documento) AS estado_documento
       ${BASE_JOIN}
         AND TRIM(p.estado_documento) IN (${placeholders})${baseClause}
       LIMIT 1000`,
      ...queryParams
    )
    return NextResponse.json({ leads: rows, total: rows.length })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
