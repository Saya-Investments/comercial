import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { crossProspectsWithLeads, RANGO_DESDE } from '@/lib/prospect-funnel-cross'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId') || ''
  const mesParam = searchParams.get('mes')?.trim() || null

  if (!userId) {
    return NextResponse.json({ error: 'userId requerido' }, { status: 400 })
  }

  const usuario = await prisma.crm_usuarios.findUnique({
    where: { id_usuario: userId },
    select: { id_asesor: true },
  })

  if (!usuario?.id_asesor) {
    return NextResponse.json({ error: 'Usuario sin asesor vinculado' }, { status: 404 })
  }

  const idAsesor = usuario.id_asesor.toString()

  const { matches, totalLeadsCrm, mesesDisponibles } = await crossProspectsWithLeads({ idAsesor })

  const filtered = mesParam ? matches.filter(m => m.mes === mesParam) : matches

  const counts: Record<string, number> = {}
  const leads = filtered.map(m => {
    counts[m.estado] = (counts[m.estado] || 0) + 1
    const { mes: _mes, ...rest } = m
    return rest
  })

  return NextResponse.json({
    leads,
    counts,
    totalCruzados: leads.length,
    totalLeadsCrm,
    mesesDisponibles,
    mes: mesParam,
    rango: { desde: RANGO_DESDE, hastaIso: new Date().toISOString() },
  })
}
