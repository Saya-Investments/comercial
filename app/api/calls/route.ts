import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Llamadas realizadas por un asesor.
 *
 * Se leen de crm_acciones_comerciales con tipo_accion = 'Llamada' (donde el CRM
 * registra la gestion) y se cruzan con crm_llamadas, que es donde vive el lado
 * tecnico: grabacion, transcripcion, id de Meta.
 *
 * Son dos tablas porque son dos cosas: la accion es "que gestion se hizo" y la
 * llamada es "que paso en la linea". Las llamadas viejas (registradas a mano
 * antes de este modulo) no tienen fila en crm_llamadas y quedan sin grabacion.
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
      crm_llamadas: {
        select: {
          id_llamada: true,
          estado: true,
          grabacion_url: true,
          transcript: true,
          duracion_seg: true,
        },
      },
    },
    orderBy: { fecha_creacion: 'desc' },
  })

  const mapped = llamadas.map((l) => {
    // La relacion es 1-a-muchos en el esquema, pero en la practica hay una sola
    // llamada por accion (la que se enlazo al guardar la gestion).
    const tecnica = l.crm_llamadas[0]

    return {
      id: l.id_accion,
      fecha: l.fecha_creacion.toISOString(),
      duracionSeg: l.duracion_seg,
      resultado: l.estado_asesor,
      observaciones: l.observaciones,
      // Solo se ofrece reproducir si hay una grabacion registrada; el enlace
      // real se firma aparte, al abrir el detalle.
      idLlamada: tecnica?.id_llamada ?? null,
      tieneGrabacion: Boolean(tecnica?.grabacion_url),
      transcript: tecnica?.transcript ?? null,
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
    }
  })

  return NextResponse.json(mapped)
}
