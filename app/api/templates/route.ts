import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const plantillas = await prisma.crm_plantillas.findMany({
    orderBy: { fecha_creacion: 'desc' },
  })

  const mapped = plantillas.map((p) => ({
    id: p.id_plantilla,
    name: p.nombre,
    subject: p.asunto || '',
    content: p.contenido,
    createdDate: p.fecha_creacion.toISOString().split('T')[0],
  }))

  return NextResponse.json(mapped)
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const plantilla = await prisma.crm_plantillas.create({
    data: {
      nombre: body.name,
      asunto: body.subject || null,
      contenido: body.content,
    },
  })

  return NextResponse.json({ id: plantilla.id_plantilla }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()

  await prisma.crm_plantillas.update({
    where: { id_plantilla: body.id },
    data: {
      nombre: body.name,
      asunto: body.subject || null,
      contenido: body.content,
      fecha_actualizacion: new Date(),
    },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.crm_plantillas.delete({ where: { id_plantilla: id } })
  return NextResponse.json({ ok: true })
}
