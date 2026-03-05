import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const campanas = await prisma.crm_campanas.findMany({
    include: { _count: { select: { crm_campana_leads: true } } },
    orderBy: { fecha_creacion: 'desc' },
  })

  const mapped = campanas.map((c) => ({
    id: c.id_campana,
    name: c.nombre,
    database: c.base_datos || '',
    filters: c.filtros || '',
    template: c.plantilla || '',
    status: c.estado as 'Activa' | 'Pausada' | 'Completada',
    leads: c._count.crm_campana_leads || c.total_leads || 0,
    createdDate: c.fecha_creacion.toISOString().split('T')[0],
  }))

  return NextResponse.json(mapped)
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const campana = await prisma.crm_campanas.create({
    data: {
      nombre: body.name,
      base_datos: body.database || null,
      filtros: body.filters || null,
      plantilla: body.template || null,
      cluster: body.cluster || 'default',
      total_leads: body.leads || 0,
    },
  })

  return NextResponse.json({ id: campana.id_campana }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()

  await prisma.crm_campanas.update({
    where: { id_campana: body.id },
    data: {
      estado: body.status,
      fecha_actualizacion: new Date(),
    },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.crm_campanas.delete({ where: { id_campana: id } })
  return NextResponse.json({ ok: true })
}
