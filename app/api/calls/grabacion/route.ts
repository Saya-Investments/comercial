import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { esEmailDemo } from '@/lib/demo-access'
import { urlsDeGrabacion } from '@/lib/gcs-grabaciones'

export const dynamic = 'force-dynamic'

/**
 * Devuelve enlaces temporales para escuchar una llamada.
 *
 * No se guardan URLs permanentes en la BD a proposito: son grabaciones de
 * conversaciones con clientes. Cada vez que alguien quiere escucharlas se firma
 * un enlace que vive 15 minutos, asi un link reenviado por chat deja de servir
 * solo.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const idLlamada = searchParams.get('idLlamada') || ''
  const userId = searchParams.get('userId') || ''

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
    select: { id_usuario: true, grabacion_url: true },
  })

  if (!llamada?.grabacion_url) {
    return NextResponse.json({ error: 'sin_grabacion' }, { status: 404 })
  }

  // Solo el asesor que hizo la llamada, o quien supervisa. Son datos personales
  // de un tercero: que esten en el CRM no las vuelve publicas para el equipo.
  const esSupervisor = ['admin', 'supervisor'].includes((usuario.rol || '').toLowerCase())
  if (llamada.id_usuario !== userId && !esSupervisor && !esEmailDemo(usuario.email)) {
    return NextResponse.json({ error: 'no_autorizado' }, { status: 403 })
  }

  const pistas = await urlsDeGrabacion(idLlamada)

  if (pistas.length === 0) {
    // La egress puede tardar unos segundos en subir el archivo despues de colgar.
    return NextResponse.json({ error: 'procesando', pistas: [] }, { status: 202 })
  }

  return NextResponse.json({ pistas })
}
