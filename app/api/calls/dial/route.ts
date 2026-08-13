import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { esEmailDemo } from '@/lib/demo-access'
import { livekitConfigurado, llamarPorWhatsApp } from '@/lib/livekit-calls'

export const dynamic = 'force-dynamic'

/**
 * Paso 2 de la llamada: marca al lead sobre una sala que YA existe y en la que
 * el asesor YA esta conectado (ver /api/calls/prepare).
 *
 * ⚠️ SEGURIDAD (pendiente antes de abrirlo a asesores reales):
 * el CRM todavia no tiene sesion server-side — el usuario viene del body. Aca
 * se acota el riesgo exigiendo que el email este en la lista demo, pero eso NO
 * es autenticacion: un cliente puede mandar cualquier userId. Antes de sacarlo
 * del piloto hay que sacar el usuario de una sesion real.
 * Ver §9 de cambios_yomira/CAMBIOS_LLAMADAS_CRM.md
 */
export async function POST(req: NextRequest) {
  if (!livekitConfigurado()) {
    return NextResponse.json({ error: 'config_error' }, { status: 500 })
  }

  const { leadId, userId, room } = await req.json().catch(() => ({}))

  if (!leadId || !userId || !room) {
    return NextResponse.json({ error: 'leadId, userId y room son requeridos' }, { status: 400 })
  }

  const usuario = await prisma.crm_usuarios.findUnique({
    where: { id_usuario: userId },
    select: { email: true },
  })

  if (!usuario || !esEmailDemo(usuario.email)) {
    return NextResponse.json({ error: 'no_habilitado' }, { status: 403 })
  }

  const lead = await prisma.bd_leads.findUnique({
    where: { id_lead: leadId },
    select: { nombre: true, apellido: true, numero: true },
  })

  if (!lead?.numero) {
    return NextResponse.json({ error: 'El lead no tiene numero' }, { status: 404 })
  }

  const telefono = lead.numero.replace(/^\+/, '')

  try {
    const { whatsappCallId } = await llamarPorWhatsApp({ room, telefono })

    // Se registra el intento apenas Meta lo acepta, no al colgar: si el asesor
    // cierra la pestaña o se cae la red, el intento igual queda. Sin esto, las
    // llamadas que no terminan bien serian invisibles y volveriamos al
    // subregistro que este modulo viene a resolver.
    const llamada = await prisma.crm_llamadas.create({
      data: {
        id_lead: leadId,
        id_usuario: userId,
        wa_call_id: whatsappCallId,
        lk_room: room,
        direccion: 'saliente',
        estado: 'iniciada',
        inicio: new Date(),
      },
      select: { id_llamada: true },
    })

    return NextResponse.json({
      whatsappCallId,
      idLlamada: llamada.id_llamada,
      lead: {
        nombre: [lead.nombre, lead.apellido].filter(Boolean).join(' ') || 'Sin nombre',
        telefono,
      },
    })
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e)

    // 138006 = el lead no autorizo que lo llamen. Es el error mas probable y el
    // unico que el asesor puede resolver (pidiendo el permiso), asi que se
    // distingue del resto para que la UI diga algo util.
    const sinPermiso = detalle.includes('138006') || /call permission/i.test(detalle)

    // Los intentos fallidos tambien se guardan: cuantas llamadas NO se pudieron
    // hacer, y por que, es justo el dato que decide si el permiso de Meta es un
    // problema real o marginal para el piloto.
    try {
      await prisma.crm_llamadas.create({
        data: {
          id_lead: leadId,
          id_usuario: userId,
          lk_room: room,
          direccion: 'saliente',
          estado: sinPermiso ? 'sin_permiso' : 'fallida',
          motivo_fallo: detalle.slice(0, 1000),
          inicio: new Date(),
          fin: new Date(),
          duracion_seg: 0,
        },
      })
    } catch (dbErr) {
      console.error('[calls/dial] no se pudo registrar el fallo:', dbErr)
    }

    if (sinPermiso) {
      return NextResponse.json(
        { error: 'sin_permiso', detail: 'El lead no autorizo llamadas de WhatsApp.' },
        { status: 422 },
      )
    }

    console.error('[calls/dial] fallo:', detalle)
    return NextResponse.json({ error: 'dial_error', detail: detalle }, { status: 502 })
  }
}
