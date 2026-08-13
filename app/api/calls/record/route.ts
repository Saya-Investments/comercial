import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { iniciarGrabacion } from '@/lib/livekit-calls'
import { carpetaDeLlamada } from '@/lib/gcs-grabaciones'

export const dynamic = 'force-dynamic'

/**
 * Arranca la grabacion de una llamada ya conectada.
 *
 * Lo dispara el CRM cuando el lead entra a la sala, no antes: si se arrancara
 * al marcar, las llamadas no contestadas dejarian archivos vacios en el bucket
 * y ruido en la BD.
 *
 * La ruta se guarda al iniciar (no al terminar) para que la grabacion sea
 * ubicable aunque el proceso muera a mitad de la llamada.
 */
export async function POST(req: NextRequest) {
  const { room, idLlamada } = await req.json().catch(() => ({}))

  if (!room || !idLlamada) {
    return NextResponse.json({ error: 'room e idLlamada son requeridos' }, { status: 400 })
  }

  const iniciadas = await iniciarGrabacion(room, idLlamada)

  if (iniciadas === 0) {
    return NextResponse.json({ grabando: false })
  }

  try {
    await prisma.crm_llamadas.update({
      where: { id_llamada: idLlamada },
      data: {
        grabacion_url: `gs://${process.env.GCS_BUCKET_GRABACIONES}/${carpetaDeLlamada(idLlamada)}`,
        // El aviso de grabacion se le muestra al asesor antes de conectar
        // (CallConfirmDialog) y el dock lo indica en vivo. Se sella aca, que es
        // cuando la grabacion realmente empieza.
        consentimiento_ts: new Date(),
      },
    })
  } catch (e) {
    console.error('[calls/record] no se pudo guardar la ruta:', e)
  }

  return NextResponse.json({ grabando: true, pistas: iniciadas })
}
