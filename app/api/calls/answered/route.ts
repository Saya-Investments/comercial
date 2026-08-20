import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Marca el momento en que el lead atendio.
 *
 * `inicio` se guardaba al marcar, asi que la duracion incluia el tiempo que la
 * llamada estuvo sonando. Eso infla la metrica justamente en las llamadas que
 * peor salen: una que suena 30 s y se conversa 10 figuraba como de 40 s.
 *
 * Corriendo `inicio` hasta aca, `duracion_seg` pasa a ser tiempo de
 * conversacion, que es lo que sirve para medir gestion.
 */
export async function POST(req: NextRequest) {
  const { idLlamada } = await req.json().catch(() => ({}))

  if (!idLlamada) {
    return NextResponse.json({ error: 'idLlamada es requerido' }, { status: 400 })
  }

  try {
    // Solo si sigue 'iniciada': si ya se cerro, correrle el inicio ahora
    // reescribiria la duracion de una llamada terminada.
    const actualizadas = await prisma.crm_llamadas.updateMany({
      where: { id_llamada: idLlamada, estado: 'iniciada' },
      data: { estado: 'conectada', inicio: new Date() },
    })
    return NextResponse.json({ ok: actualizadas.count > 0 })
  } catch (e) {
    console.error('[calls/answered]', e)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
