import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const users = await prisma.crm_usuarios.findMany({
    orderBy: { fecha_creacion: 'desc' },
  })

  const mapped = users.map((u) => ({
    id: u.id_usuario,
    username: u.username,
    name: u.nombre,
    role: u.rol as 'Admin' | 'Manager' | 'Agente',
    email: u.email,
    active: u.activo ?? true,
    joinDate: u.fecha_ingreso?.toISOString().split('T')[0] || '',
  }))

  return NextResponse.json(mapped)
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const user = await prisma.crm_usuarios.create({
    data: {
      username: body.username,
      nombre: body.name,
      email: body.email,
      password_hash: body.password || 'temp_hash',
      rol: body.role || 'Agente',
    },
  })

  return NextResponse.json({ id: user.id_usuario }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()

  await prisma.crm_usuarios.update({
    where: { id_usuario: body.id },
    data: {
      username: body.username,
      nombre: body.name,
      email: body.email,
      rol: body.role,
      activo: body.active,
      fecha_actualizacion: new Date(),
    },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.crm_usuarios.delete({ where: { id_usuario: id } })
  return NextResponse.json({ ok: true })
}
