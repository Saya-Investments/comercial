import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createCalendarEvent, updateCalendarEvent, cancelCalendarEvent } from '@/lib/google-calendar'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  const asesorId = searchParams.get('asesorId')

  const where: Record<string, unknown> = {}
  if (asesorId) {
    // Find the user linked to this asesor
    const usuario = await prisma.crm_usuarios.findFirst({
      where: { id_asesor: asesorId },
      select: { id_usuario: true },
    })
    if (usuario) where.id_usuario = usuario.id_usuario
    else return NextResponse.json([])
  } else if (userId) {
    where.id_usuario = userId
  }

  const citas = await prisma.crm_citas.findMany({
    where,
    include: {
      bd_leads: { select: { nombre: true, apellido: true } },
    },
    orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
  })

  const mapped = citas.map((c) => {
    const horaDate = c.hora as unknown as Date
    const horaStr = horaDate instanceof Date
      ? `${String(horaDate.getUTCHours()).padStart(2, '0')}:${String(horaDate.getUTCMinutes()).padStart(2, '0')}`
      : String(c.hora).slice(0, 5)

    return {
      id: c.id_cita,
      title: c.titulo,
      leadName: c.nombre_lead || `${c.bd_leads?.nombre || ''} ${c.bd_leads?.apellido || ''}`.trim() || '',
      date: c.fecha.toISOString().split('T')[0],
      time: horaStr,
      location: c.ubicacion || undefined,
      description: c.descripcion || undefined,
      type: c.tipo as 'llamada' | 'reunion' | 'video',
      status: c.estado as 'active' | 'cancelled',
    }
  })

  return NextResponse.json(mapped)
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const [hours, minutes] = (body.time || '09:00').split(':').map(Number)
  const horaDate = new Date(Date.UTC(1970, 0, 1, hours, minutes, 0))

  // Create cita in DB
  const cita = await prisma.crm_citas.create({
    data: {
      titulo: body.title,
      id_lead: body.leadId || null,
      nombre_lead: body.leadName || null,
      id_usuario: body.userId,
      fecha: new Date(body.date),
      hora: horaDate,
      ubicacion: body.location || null,
      descripcion: body.description || null,
      tipo: body.type || 'llamada',
    },
  })

  // Sync to Google Calendar if user has connected
  const usuario = await prisma.crm_usuarios.findUnique({
    where: { id_usuario: body.userId },
    select: { google_refresh_token: true },
  })

  if (usuario?.google_refresh_token) {
    const googleEventId = await createCalendarEvent(usuario.google_refresh_token, {
      title: body.title,
      description: body.description || undefined,
      date: body.date,
      time: body.time || '09:00',
      type: body.type || 'llamada',
      location: body.location || undefined,
      leadName: body.leadName || undefined,
    })

    if (googleEventId) {
      await prisma.crm_citas.update({
        where: { id_cita: cita.id_cita },
        data: { google_event_id: googleEventId },
      })
    }
  }

  return NextResponse.json({ id: cita.id_cita }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()

  const data: Record<string, unknown> = { fecha_actualizacion: new Date() }

  if (body.status) data.estado = body.status
  if (body.title) data.titulo = body.title
  if (body.date) data.fecha = new Date(body.date)
  if (body.time) {
    const [h, m] = body.time.split(':').map(Number)
    data.hora = new Date(Date.UTC(1970, 0, 1, h, m, 0))
  }
  if (body.location !== undefined) data.ubicacion = body.location
  if (body.description !== undefined) data.descripcion = body.description
  if (body.type) data.tipo = body.type

  // Get existing cita for Google Calendar sync
  const existingCita = await prisma.crm_citas.findUnique({
    where: { id_cita: body.id },
    select: { google_event_id: true, id_usuario: true },
  })

  await prisma.crm_citas.update({
    where: { id_cita: body.id },
    data,
  })

  // Sync changes to Google Calendar
  if (existingCita?.google_event_id) {
    const usuario = await prisma.crm_usuarios.findUnique({
      where: { id_usuario: existingCita.id_usuario },
      select: { google_refresh_token: true },
    })

    if (usuario?.google_refresh_token) {
      if (body.status === 'cancelled') {
        await cancelCalendarEvent(usuario.google_refresh_token, existingCita.google_event_id)
        await prisma.crm_citas.update({
          where: { id_cita: body.id },
          data: { google_event_id: null },
        })
      } else {
        await updateCalendarEvent(usuario.google_refresh_token, existingCita.google_event_id, {
          title: body.title,
          date: body.date,
          time: body.time,
          type: body.type,
          description: body.description,
          location: body.location,
        })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
