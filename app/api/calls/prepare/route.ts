import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { esEmailDemo } from '@/lib/demo-access'
import { crearSala, livekitConfigurado, tokenAsesor } from '@/lib/livekit-calls'

export const dynamic = 'force-dynamic'

/**
 * Paso 1 de la llamada: prepara la sala y el token, SIN marcar todavia.
 *
 * Va separado del dial a proposito. Si se marcara primero, el lead podria
 * contestar (o la llamada morir) antes de que el navegador del asesor termine
 * de conectarse: en el mejor caso se pierden los primeros segundos de audio, en
 * el peor la sala ya no existe cuando el navegador intenta publicar el
 * microfono ("engine not connected within timeout").
 *
 * El asesor entra primero; recien cuando esta adentro se llama a /dial.
 */
export async function POST(req: NextRequest) {
  if (!livekitConfigurado()) {
    return NextResponse.json(
      { error: 'config_error', detail: 'Faltan LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET' },
      { status: 500 },
    )
  }

  const { leadId, userId } = await req.json().catch(() => ({}))

  if (!leadId || !userId) {
    return NextResponse.json({ error: 'leadId y userId son requeridos' }, { status: 400 })
  }

  const usuario = await prisma.crm_usuarios.findUnique({
    where: { id_usuario: userId },
    select: { id_usuario: true, nombre: true, email: true },
  })

  if (!usuario) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
  }

  // Gate del piloto: las llamadas cuestan por minuto, no se abren a todos.
  if (!esEmailDemo(usuario.email)) {
    return NextResponse.json({ error: 'no_habilitado' }, { status: 403 })
  }

  const lead = await prisma.bd_leads.findUnique({
    where: { id_lead: leadId },
    select: { numero: true },
  })

  if (!lead?.numero) {
    return NextResponse.json({ error: 'El lead no tiene numero' }, { status: 404 })
  }

  const room = `call_${leadId.slice(0, 8)}_${Date.now()}`

  // Se crea explicitamente en vez de dejar que nazca sola al entrar: asi la
  // sala existe antes de marcar, pase lo que pase con el orden de conexion.
  await crearSala(room)

  const token = await tokenAsesor({ room, userId, nombre: usuario.nombre })

  return NextResponse.json({
    room,
    token,
    url: process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL,
  })
}
