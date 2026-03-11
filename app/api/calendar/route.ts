import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  const where: Record<string, unknown> = {}
  if (userId) where.id_usuario = userId

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

  await prisma.crm_citas.update({
    where: { id_cita: body.id },
    data,
  })

  return NextResponse.json({ ok: true })
}
