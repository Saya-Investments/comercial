import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')

  if (!userId) {
    return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
  }

  const user = await prisma.crm_usuarios.findUnique({
    where: { id_usuario: userId },
    select: { google_refresh_token: true },
  })

  return NextResponse.json({ connected: !!user?.google_refresh_token })
}

export async function DELETE(req: NextRequest) {
  const { userId } = await req.json()

  if (!userId) {
    return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
  }

  await prisma.crm_usuarios.update({
    where: { id_usuario: userId },
    data: {
      google_refresh_token: null,
      fecha_actualizacion: new Date(),
    },
  })

  return NextResponse.json({ ok: true })
}
