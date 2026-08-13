import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Enlaza la llamada con la accion comercial que el asesor guardo al colgar.
 *
 * Van en tablas distintas a proposito: la accion es "que gestion se hizo"
 * (la ve el asesor y el supervisor), la llamada es "que paso tecnicamente"
 * (grabacion, transcripcion, id de Meta). Este endpoint los cose, para que
 * desde la gestion se pueda llegar al audio.
 */
export async function POST(req: NextRequest) {
  const { idLlamada, idAccion } = await req.json().catch(() => ({}))

  if (!idLlamada || !idAccion) {
    return NextResponse.json({ error: 'idLlamada e idAccion son requeridos' }, { status: 400 })
  }

  try {
    await prisma.crm_llamadas.update({
      where: { id_llamada: idLlamada },
      data: { id_accion: idAccion },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    // Que falle el enlace no debe romper el cierre de la gestion: la accion ya
    // quedo guardada, que es lo que le importa al asesor.
    console.error('[calls/link]', e)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
