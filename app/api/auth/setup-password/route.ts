import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email y contraseña son requeridos' }, { status: 400 })
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
  }

  const user = await prisma.crm_usuarios.findFirst({
    where: { email, activo: true },
  })

  if (!user) {
    return NextResponse.json(
      { error: 'No existe una cuenta con este correo. Contacta al administrador.' },
      { status: 404 }
    )
  }

  if (user.password_hash !== 'temp_hash') {
    return NextResponse.json(
      { error: 'Esta cuenta ya tiene contraseña configurada. Usa el login normal.' },
      { status: 400 }
    )
  }

  const hashedPassword = await bcrypt.hash(password, 10)

  await prisma.crm_usuarios.update({
    where: { id_usuario: user.id_usuario },
    data: {
      password_hash: hashedPassword,
      ultimo_login: new Date(),
      fecha_actualizacion: new Date(),
    },
  })

  return NextResponse.json({
    id: user.id_usuario,
    email: user.email,
    name: user.nombre,
    role: user.rol.toLowerCase(),
    username: user.username,
  })
}
