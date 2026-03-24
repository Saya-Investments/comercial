import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

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

  // Recibidos: leads assigned to this asesor via matching (asignado = true)
  const matchings = await prisma.matching.findMany({
    where: { id_asesor: idAsesor, asignado: true },
    select: { id_lead: true },
  })
  const leadIds = matchings.map(m => m.id_lead)
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

  // Venta cerrada: leads with ultimo_estado_asesor = 'venta_cerrada'
  const ventaCerradaCount = await prisma.bd_leads.count({
    where: {
      id_lead: { in: leadIds },
      ultimo_estado_asesor: 'venta_cerrada',
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
