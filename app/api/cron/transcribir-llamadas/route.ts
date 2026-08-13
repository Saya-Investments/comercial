import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { transcribirLlamada, transcripcionConfigurada } from '@/lib/transcribir-llamada'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET

/** Cuantas llamadas se transcriben por tick. */
const LOTE = 5

/**
 * Cron de transcripcion de llamadas.
 *
 * Va por cron y no dentro del colgado por dos razones: transcribir tarda entre
 * segundos y minutos (el asesor no puede quedarse esperando para cerrar la
 * gestion), y la egress tarda un rato en terminar de subir los archivos a GCS
 * despues de que la llamada corta. Barrer cada tanto resuelve las dos cosas y
 * ademas recupera solo las que fallaron en un intento anterior.
 */
export async function GET(req: NextRequest) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!transcripcionConfigurada()) {
    return NextResponse.json({ error: 'Falta DEEPGRAM_API_KEY o el bucket' }, { status: 500 })
  }

  const candidatas = await prisma.crm_llamadas.findMany({
    where: {
      grabacion_url: { not: null },
      // Un margen para que la egress haya terminado de subir. Antes de eso no
      // hay archivos y el intento se gastaria en vano.
      fin: { not: null, lt: new Date(Date.now() - 60_000) },
    },
    select: { id_llamada: true, transcript: true },
    orderBy: { fecha_creacion: 'desc' },
    take: LOTE * 6,
  })

  // El filtro de "json nulo" se hace aca y no en el where: Prisma distingue el
  // NULL de la columna del null de JSON, y expresarlo en el where cuesta mas de
  // lo que vale para un lote de este tamaño.
  const pendientes = candidatas.filter((c) => c.transcript === null).slice(0, LOTE)

  const resultados: { id: string; turnos?: number; error?: string }[] = []

  for (const { id_llamada } of pendientes) {
    try {
      const turnos = await transcribirLlamada(id_llamada)
      if (!turnos) {
        // Todavia no hay pistas: se reintenta en el proximo tick.
        resultados.push({ id: id_llamada, error: 'sin_pistas' })
        continue
      }
      await prisma.crm_llamadas.update({
        where: { id_llamada },
        data: { transcript: turnos as unknown as Prisma.InputJsonValue },
      })
      resultados.push({ id: id_llamada, turnos: turnos.length })
    } catch (e) {
      const detalle = e instanceof Error ? e.message : String(e)
      console.error(`[cron/transcribir] ${id_llamada}:`, detalle)
      resultados.push({ id: id_llamada, error: detalle.slice(0, 200) })
    }
  }

  return NextResponse.json({ procesadas: resultados.length, resultados })
}
