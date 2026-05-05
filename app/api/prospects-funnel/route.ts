import { NextResponse } from 'next/server'
import { crossProspectsWithLeads, RANGO_DESDE } from '@/lib/prospect-funnel-cross'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  // ?mes=YYYY-MM filtra leads por su fecha_creacion (hora Lima). Sin parametro
  // o vacio = devuelve todo el rango.
  const mesParam = url.searchParams.get('mes')?.trim() || null

  const { matches, totalLeadsCrm, mesesDisponibles } = await crossProspectsWithLeads()

  const filtered = mesParam ? matches.filter(m => m.mes === mesParam) : matches

  const counts: Record<string, number> = {}
  const leadsMatched = filtered.map((m) => {
    counts[m.estado] = (counts[m.estado] || 0) + 1
    const { mes: _mes, ...rest } = m
    return rest
  })

  return NextResponse.json({
    counts,
    totalCruzados: leadsMatched.length,
    totalLeadsCrm,
    leads: leadsMatched,
    mesesDisponibles,
    mes: mesParam,
    rango: { desde: RANGO_DESDE, hastaIso: new Date().toISOString() },
  })
}
