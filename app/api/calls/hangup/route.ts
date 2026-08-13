import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  cerrarSala,
  colgarLlamada,
  detenerGrabaciones,
  livekitConfigurado,
} from '@/lib/livekit-calls'

export const dynamic = 'force-dynamic'

/**
 * Cuelga la llamada desde el CRM y cierra su registro.
 *
 * Se llama cuando el asesor pulsa "Colgar". Si el que corta es el lead, el
 * corte llega por el webhook de Meta y esto no se ejecuta — por eso el endpoint
 * tolera que la llamada ya no exista: colgar dos veces no es un error.
 */
export async function POST(req: NextRequest) {
  if (!livekitConfigurado()) {
    return NextResponse.json({ error: 'config_error' }, { status: 500 })
  }

  const { whatsappCallId, room, idLlamada, conecto } = await req.json().catch(() => ({}))

  if (whatsappCallId) {
    try {
      await colgarLlamada(whatsappCallId)
    } catch (e) {
      // La llamada pudo haberse cortado del otro lado un instante antes.
      console.warn('[calls/hangup] disconnect:', e instanceof Error ? e.message : e)
    }
  }

  // Detener la grabacion ANTES de borrar la sala: al cerrarse la sala las
  // pistas desaparecen, y una egress cortada asi puede dejar el archivo
  // incompleto.
  if (room) {
    await detenerGrabaciones(room)
    await cerrarSala(room)
  }

  // La duracion se calcula contra el `inicio` guardado en la BD y no contra el
  // cronometro del navegador: el reloj del cliente es manipulable y ademas se
  // desfasa si la pestaña queda en segundo plano.
  if (idLlamada) {
    try {
      const previa = await prisma.crm_llamadas.findUnique({
        where: { id_llamada: idLlamada },
        select: { inicio: true, estado: true },
      })

      if (previa && previa.estado === 'iniciada') {
        const fin = new Date()
        const seg = previa.inicio
          ? Math.max(0, Math.round((fin.getTime() - previa.inicio.getTime()) / 1000))
          : null

        await prisma.crm_llamadas.update({
          where: { id_llamada: idLlamada },
          data: {
            // "no_contesto" no es lo mismo que "finalizada": distinguirlo es lo
            // que despues permite medir tasa de contacto real por asesor.
            estado: conecto ? 'finalizada' : 'no_contesto',
            fin,
            duracion_seg: seg,
          },
        })
      }
    } catch (e) {
      console.error('[calls/hangup] cierre de registro:', e)
    }
  }

  return NextResponse.json({ ok: true })
}
