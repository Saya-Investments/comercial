import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const leadId = searchParams.get('leadId')

  if (!leadId) {
    return NextResponse.json({ error: 'leadId es requerido' }, { status: 400 })
  }

  const historial = await prisma.hist_estado_asesor.findMany({
    where: { id_lead: leadId },
    include: {
      crm_usuarios: { select: { nombre: true } },
      crm_acciones_comerciales: { select: { tipo_accion: true, observaciones: true } },
    },
    orderBy: { fecha_cambio: 'desc' },
  })

  const mapped = historial.map((h) => ({
    id: h.id_hist,
    estadoAnterior: h.estado_anterior,
    estadoNuevo: h.estado_nuevo,
    fecha: h.fecha_cambio.toISOString(),
    usuario: h.crm_usuarios.nombre,
    tipoAccion: h.crm_acciones_comerciales.tipo_accion,
    observaciones: h.crm_acciones_comerciales.observaciones,
  }))

  return NextResponse.json(mapped)
}
