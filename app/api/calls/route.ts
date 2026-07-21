import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Llamadas realizadas por un asesor.
 *
 * Se leen de crm_acciones_comerciales con tipo_accion = 'Llamada', que es donde
 * el CRM ya registra las llamadas (hoy a mano; con el dock quedaran automaticas
 * y con duracion real).
 *
 * La transcripcion y el resumen NO viven en la BD todavia: saldran de la
 * grabacion cuando la Calling API este integrada (ver plan-poc-voz-crm.md).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId') || ''

  if (!userId) {
    return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
  }

  const llamadas = await prisma.crm_acciones_comerciales.findMany({
    where: { id_usuario: userId, tipo_accion: 'Llamada' },
    include: {
      bd_leads: {
        select: {
          id_lead: true,
          nombre: true,
          apellido: true,
          numero: true,
          linea: true,
          producto: true,
          nivel_intencion_de_compra: true,
          estado_de_lead: true,
        },
      },
    },
    orderBy: { fecha_creacion: 'desc' },
  })

  const mapped = llamadas.map((l) => ({
    id: l.id_accion,
    fecha: l.fecha_creacion.toISOString(),
    duracionSeg: l.duracion_seg,
    resultado: l.estado_asesor,
    observaciones: l.observaciones,
    lead: {
      id: l.bd_leads.id_lead,
      nombre: [l.bd_leads.nombre, l.bd_leads.apellido].filter(Boolean).join(' ') || 'Sin nombre',
      numero: l.bd_leads.numero ?? '',
      linea: l.bd_leads.linea ?? '',
      producto: l.bd_leads.producto ?? '',
      intencion: l.bd_leads.nivel_intencion_de_compra
        ? Number(l.bd_leads.nivel_intencion_de_compra)
        : null,
      estado: l.bd_leads.estado_de_lead ?? '',
    },
  }))

  return NextResponse.json(mapped)
}
