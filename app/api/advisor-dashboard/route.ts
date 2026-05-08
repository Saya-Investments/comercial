import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const VENTA_CERRADA_ESTADOS = ['Venta_cerrada', 'venta_cerrada']

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId') || ''

  if (!userId) {
    return NextResponse.json({ error: 'userId requerido' }, { status: 400 })
  }

  // Get the asesor ID linked to this user
  const usuario = await prisma.crm_usuarios.findUnique({
    where: { id_usuario: userId },
    select: { id_asesor: true },
  })

  if (!usuario?.id_asesor) {
    return NextResponse.json({ error: 'Usuario sin asesor vinculado' }, { status: 404 })
  }

  const idAsesor = usuario.id_asesor

  // Recibidos: leads assigned to this asesor either by active matching or by
  // the current asesor pointer on the lead.
  const [matchings, directLeads] = await Promise.all([
    prisma.matching.findMany({
      where: { id_asesor: idAsesor, asignado: true },
      select: { id_lead: true },
    }),
    prisma.bd_leads.findMany({
      where: { ultimo_asesor_asignado: idAsesor },
      select: { id_lead: true },
    }),
  ])
  const leadIds = Array.from(new Set([
    ...matchings.map(m => m.id_lead),
    ...directLeads.map(l => l.id_lead),
  ]))
  const recibidos = leadIds.length

  if (recibidos === 0) {
    return NextResponse.json({
      funnel: { recibidos: 0, gestionados: 0, ventaCerrada: 0 },
    })
  }

  // Gestionados: leads with at least one accion comercial by this asesor's user
  const accionesLeads = await prisma.crm_acciones_comerciales.findMany({
    where: { id_lead: { in: leadIds } },
    select: { id_lead: true },
    distinct: ['id_lead'],
  })
  const gestionados = accionesLeads.length

  // Venta cerrada: leads whose latest asesor state is closed.
  const ventaCerradaCount = await prisma.bd_leads.count({
    where: {
      id_lead: { in: leadIds },
      ultimo_estado_asesor: { in: VENTA_CERRADA_ESTADOS },
    },
  })

  return NextResponse.json({
    funnel: {
      recibidos,
      gestionados,
      ventaCerrada: ventaCerradaCount,
    },
  })
}
