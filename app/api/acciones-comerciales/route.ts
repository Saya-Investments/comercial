import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createCalendarEvent } from '@/lib/google-calendar'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const leadId = searchParams.get('leadId')

  if (!leadId) {
    return NextResponse.json({ error: 'leadId es requerido' }, { status: 400 })
  }

  const acciones = await prisma.crm_acciones_comerciales.findMany({
    where: { id_lead: leadId },
    include: {
      crm_usuarios: { select: { nombre: true, username: true } },
      crm_citas: { select: { fecha: true, hora: true, estado: true } },
    },
    orderBy: { fecha_creacion: 'desc' },
  })

  const mapped = acciones.map((a) => ({
    id: a.id_accion,
    leadId: a.id_lead,
    userId: a.id_usuario,
    userName: a.crm_usuarios.nombre,
    tipoAccion: a.tipo_accion,
    estadoAsesor: a.estado_asesor,
    observaciones: a.observaciones,
    duracionSeg: a.duracion_seg,
    citaId: a.id_cita,
    cita: a.crm_citas
      ? {
          fecha: a.crm_citas.fecha.toISOString().split('T')[0],
          hora: (() => {
            const h = a.crm_citas.hora as unknown as Date
            return h instanceof Date
              ? `${String(h.getUTCHours()).padStart(2, '0')}:${String(h.getUTCMinutes()).padStart(2, '0')}`
              : String(a.crm_citas.hora).slice(0, 5)
          })(),
          estado: a.crm_citas.estado,
        }
      : null,
    fecha: a.fecha_creacion.toISOString(),
  }))

  return NextResponse.json(mapped)
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const { leadId, userId, tipoAccion, estadoAsesor, observaciones, duracionSeg, cita, citaId: bodyCitaId } = body

  if (!leadId || !userId || !tipoAccion || !estadoAsesor) {
    return NextResponse.json(
      { error: 'leadId, userId, tipoAccion y estadoAsesor son requeridos' },
      { status: 400 }
    )
  }

  // Get current estado_asesor from lead
  const lead = await prisma.bd_leads.findUnique({
    where: { id_lead: leadId },
    select: { ultimo_estado_asesor: true, ultimo_asesor_asignado: true },
  })

  if (!lead) {
    return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
  }

  // Find active assignment for this lead (optional)
  const asignacion = await prisma.hist_asignaciones.findFirst({
    where: { id_lead: leadId, estado_gestion: { in: ['en_espera', 'prospecto'] } },
    orderBy: { fecha_asignacion: 'desc' },
  })

  let citaId: string | null = bodyCitaId || null

  // If scheduling a call, create the cita first
  if (tipoAccion === 'Agendar_llamada' && cita) {
    const [hours, minutes] = (cita.time || '09:00').split(':').map(Number)
    const horaDate = new Date(Date.UTC(1970, 0, 1, hours, minutes, 0))

    const nuevaCita = await prisma.crm_citas.create({
      data: {
        titulo: `Llamada agendada - ${cita.leadName || 'Lead'}`,
        id_lead: leadId,
        nombre_lead: cita.leadName || null,
        id_usuario: userId,
        fecha: new Date(cita.date),
        hora: horaDate,
        descripcion: observaciones || null,
        tipo: 'llamada',
      },
    })
    citaId = nuevaCita.id_cita

    // Sync to Google Calendar
    const usuario = await prisma.crm_usuarios.findUnique({
      where: { id_usuario: userId },
      select: { google_refresh_token: true },
    })

    if (usuario?.google_refresh_token) {
      const googleEventId = await createCalendarEvent(usuario.google_refresh_token, {
        title: `Llamada agendada - ${cita.leadName || 'Lead'}`,
        description: observaciones || undefined,
        date: cita.date,
        time: cita.time || '09:00',
        type: 'llamada',
        leadName: cita.leadName || undefined,
      })

      if (googleEventId) {
        await prisma.crm_citas.update({
          where: { id_cita: nuevaCita.id_cita },
          data: { google_event_id: googleEventId },
        })
      }
    }
  }

  // Create the accion comercial
  const accion = await prisma.crm_acciones_comerciales.create({
    data: {
      id_lead: leadId,
      id_asignacion: asignacion?.id_asignacion || null,
      id_usuario: userId,
      tipo_accion: tipoAccion,
      estado_asesor: estadoAsesor,
      observaciones: observaciones || null,
      id_cita: citaId,
      duracion_seg: duracionSeg || null,
    },
  })

  // Insert into hist_estado_asesor
  await prisma.hist_estado_asesor.create({
    data: {
      id_lead: leadId,
      id_accion: accion.id_accion,
      id_usuario: userId,
      estado_anterior: lead.ultimo_estado_asesor || null,
      estado_nuevo: estadoAsesor,
    },
  })

  // Update bd_leads.ultimo_estado_asesor
  await prisma.bd_leads.update({
    where: { id_lead: leadId },
    data: {
      ultimo_estado_asesor: estadoAsesor,
      fecha_actualizacion: new Date(),
    },
  })

  return NextResponse.json({ id: accion.id_accion, citaId }, { status: 201 })
}
