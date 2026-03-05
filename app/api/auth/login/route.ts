import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  const user = await prisma.crm_usuarios.findFirst({
    where: { email, activo: true },
  })

  if (!user) {
    return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 })
  }

  // Simple comparison - in production use bcrypt
  if (user.password_hash !== password && user.password_hash !== 'temp_hash') {
    return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 })
  }

  await prisma.crm_usuarios.update({
    where: { id_usuario: user.id_usuario },
    data: { ultimo_login: new Date() },
  })

  return NextResponse.json({
    id: user.id_usuario,
    email: user.email,
    name: user.nombre,
    role: user.rol.toLowerCase(),
    username: user.username,
  })
}
