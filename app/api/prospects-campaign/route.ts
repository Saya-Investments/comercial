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

// Misma lógica que el funnel: leads gestionados (con acciones comerciales) desde el inicio del piloto.
const BASE_JOIN = `
  FROM comercial.bd_leads l
  JOIN LATERAL (
    SELECT np.estado_documento
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
    AND EXISTS (
      SELECT 1 FROM comercial.crm_acciones_comerciales ac
      WHERE ac.id_lead = l.id_lead
    )
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
    return NextResponse.json({ estados })
  }

  const estadosParam = searchParams.getAll('estados')

  if (estadosParam.length === 0) {
    return NextResponse.json({ total: 0, leads: [] })
  }

  const placeholders = estadosParam.map((_, i) => `$${i + 1}`).join(', ')

  if (action === 'count') {
    const rows = await prisma.$queryRawUnsafe<[{ total: bigint }]>(
      `SELECT COUNT(DISTINCT l.id_lead)::bigint AS total
       ${BASE_JOIN}
         AND TRIM(p.estado_documento) IN (${placeholders})`,
      ...estadosParam
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
         AND TRIM(p.estado_documento) IN (${placeholders})
       LIMIT 1000`,
      ...estadosParam
    )
    return NextResponse.json({ leads: rows, total: rows.length })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
