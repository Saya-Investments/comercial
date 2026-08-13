import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { esEmailDemo } from '@/lib/demo-access'
import { transcribirLlamada, transcripcionConfigurada } from '@/lib/transcribir-llamada'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Transcribe una llamada AHORA, porque alguien la quiere leer.
 *
 * El cron (cada 5 min, con un margen de 1 min) sirve para que todo termine
 * transcrito, pero implica esperar hasta 7 minutos. Cuando el asesor abre la
 * pestaña de transcripcion no puede esperar eso, asi que se transcribe en el
 * momento y el cron queda de red de seguridad para lo que nadie abrio.
 *
 * De paso se gasta menos Deepgram: no se transcribe lo que nadie va a leer.
 */

/**
 * Llamadas transcribiendose ahora mismo en este proceso.
 *
 * Evita el trabajo doble cuando llegan dos pedidos juntos — algo habitual, por
 * el doble render de React en desarrollo o dos clics seguidos.
 */
const enCurso = new Set<string>()

export async function POST(req: NextRequest) {
  if (!transcripcionConfigurada()) {
    return NextResponse.json({ error: 'config_error' }, { status: 500 })
  }

  const { idLlamada, userId } = await req.json().catch(() => ({}))

  if (!idLlamada || !userId) {
    return NextResponse.json({ error: 'idLlamada y userId son requeridos' }, { status: 400 })
  }

  const usuario = await prisma.crm_usuarios.findUnique({
    where: { id_usuario: userId },
    select: { email: true, rol: true },
  })

  if (!usuario) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
  }

  const llamada = await prisma.crm_llamadas.findUnique({
    where: { id_llamada: idLlamada },
    select: { id_usuario: true, grabacion_url: true, transcript: true },
  })

  if (!llamada?.grabacion_url) {
    return NextResponse.json({ error: 'sin_grabacion' }, { status: 404 })
  }

  // Mismas reglas que para escuchar el audio: son datos personales de un
  // tercero, no basta con tener sesion en el CRM.
  const esSupervisor = ['admin', 'supervisor'].includes((usuario.rol || '').toLowerCase())
  if (llamada.id_usuario !== userId && !esSupervisor && !esEmailDemo(usuario.email)) {
    return NextResponse.json({ error: 'no_autorizado' }, { status: 403 })
  }

  // Ya estaba transcrita: se devuelve lo guardado sin volver a pagar Deepgram.
  if (llamada.transcript) {
    return NextResponse.json({ turnos: llamada.transcript })
  }

  if (enCurso.has(idLlamada)) {
    return NextResponse.json({ error: 'en_curso' }, { status: 202 })
  }

  enCurso.add(idLlamada)
  try {
    const turnos = await transcribirLlamada(idLlamada)

    if (!turnos) {
      // La egress todavia no subio las pistas. El cron lo reintenta despues.
      return NextResponse.json({ error: 'procesando' }, { status: 202 })
    }

    await prisma.crm_llamadas.update({
      where: { id_llamada: idLlamada },
      data: { transcript: turnos as unknown as Prisma.InputJsonValue },
    })

    return NextResponse.json({ turnos })
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e)
    console.error('[calls/transcribir]', detalle)
    return NextResponse.json({ error: 'fallo', detail: detalle.slice(0, 200) }, { status: 502 })
  } finally {
    enCurso.delete(idLlamada)
  }
}
