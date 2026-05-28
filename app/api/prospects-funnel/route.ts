import { NextResponse } from 'next/server'
import { crossProspectsWithLeads, RANGO_DESDE } from '@/lib/prospect-funnel-cross'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const mesParam = url.searchParams.get('mes')?.trim() || null
  const mesCierreParam = url.searchParams.get('mes_cierre')?.trim() || null
  const origenParam = url.searchParams.get('origen')?.trim() || null

  const { matches, totalLeadsCrm, mesesDisponibles, mesesCierre } = await crossProspectsWithLeads()

  let filtered = mesParam ? matches.filter(m => m.mes === mesParam) : matches
  if (mesCierreParam) filtered = filtered.filter(m => m.mes_cierre === mesCierreParam)
  if (origenParam === 'asesor' || origenParam === 'call_center') {
    filtered = filtered.filter(m => m.origen_gestion === origenParam)
  }

  const counts: Record<string, number> = {}
  const leadsMatched = filtered.map((m) => {
    counts[m.estado] = (counts[m.estado] || 0) + 1
    const { mes: _mes, mes_cierre: _mc, ...rest } = m
    return rest
  })

  return NextResponse.json({
    counts,
    totalCruzados: leadsMatched.length,
    totalLeadsCrm,
    leads: leadsMatched,
    mesesDisponibles,
    mesesCierre,
    mes: mesParam,
    mesCierre: mesCierreParam,
    origen: origenParam,
    rango: { desde: RANGO_DESDE, hastaIso: new Date().toISOString() },
  })
}
