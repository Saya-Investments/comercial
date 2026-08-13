/**
 * Transcripcion de llamadas con Deepgram.
 *
 * Se transcriben las pistas POR SEPARADO (asesor y lead), no la mezcla. Cada
 * archivo contiene una sola voz, asi que la atribucion es exacta por
 * construccion: no hace falta diarizacion, que agrupa por timbre y se equivoca
 * justo cuando mas importa — cuando los dos hablan encimados, que en una
 * llamada de ventas pasa todo el tiempo.
 *
 * Despues los turnos se intercalan por marca de tiempo para reconstruir la
 * conversacion.
 *
 * Ver cambios_yomira/ESTADO_CRM_LLAMADAS.md
 */

// SDK v5: la API es `new DeepgramClient(...)` y `listen.v1.media`.
// El `createClient` / `listen.prerecorded` de las guias es de la v3.
import { DeepgramClient } from '@deepgram/sdk'
import { Storage } from '@google-cloud/storage'

export interface Turno {
  who: 'asesor' | 'lead'
  text: string
  /** Segundo en que arranca, para poder saltar al audio. */
  t: number
}

const BUCKET = process.env.GCS_BUCKET_GRABACIONES || ''

export function transcripcionConfigurada(): boolean {
  return Boolean(process.env.DEEPGRAM_API_KEY && BUCKET && process.env.GCS_SA_KEY)
}

function storage(): Storage {
  const cred = JSON.parse(process.env.GCS_SA_KEY || '{}')
  return new Storage({ projectId: cred.project_id, credentials: cred })
}

/** Transcribe un archivo mono y devuelve sus turnos, todos del mismo hablante. */
async function transcribirPista(objeto: string, who: 'asesor' | 'lead'): Promise<Turno[]> {
  const dg = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY! })

  // Se descarga a memoria en vez de pasarle una URL a Deepgram: el bucket es
  // privado y firmar una URL publica para que un tercero la lea es exponer la
  // grabacion mas de lo necesario. Una llamada de 10 min pesa ~2 MB.
  const [buffer] = await storage().bucket(BUCKET).file(objeto).download()

  const res = await dg.listen.v1.media.transcribeFile(buffer, {
    model: 'nova-3',
    language: 'es',
    smart_format: true, // puntuacion y mayusculas: sin esto es un bloque ilegible
    utterances: true, // turnos en vez de una tirada de palabras
    // Sin diarize NI multichannel: el archivo ya es de una sola persona.
  })

  // La v5 envuelve la respuesta segun el metodo; se contemplan las dos formas
  // para que un cambio menor del SDK no deje la transcripcion en silencio.
  const r = res as unknown as {
    result?: { results?: { utterances?: { transcript?: string; start?: number }[] } }
    results?: { utterances?: { transcript?: string; start?: number }[] }
  }
  const utterances = r.result?.results?.utterances ?? r.results?.utterances ?? []

  return utterances
    .filter((u) => (u.transcript || '').trim().length > 0)
    .map((u) => ({ who, text: (u.transcript || '').trim(), t: Number(u.start) || 0 }))
}

/**
 * Transcribe una llamada completa.
 *
 * Devuelve null si no hay pistas separadas todavia (la egress puede tardar unos
 * segundos en subirlas despues de colgar).
 */
export async function transcribirLlamada(idLlamada: string): Promise<Turno[] | null> {
  if (!transcripcionConfigurada()) return null

  const [archivos] = await storage()
    .bucket(BUCKET)
    .getFiles({ prefix: `llamadas/${idLlamada}/` })

  const pistas = archivos.filter(
    (f) => f.name.endsWith('.ogg') && !f.name.endsWith('conversacion.ogg'),
  )

  if (pistas.length === 0) return null

  const partes = await Promise.all(
    pistas.map((f) => {
      const base = f.name.split('/').pop() || ''
      return transcribirPista(f.name, base.startsWith('asesor') ? 'asesor' : 'lead')
    }),
  )

  // Intercalar por tiempo: es lo que convierte dos monologos en una conversacion.
  return partes.flat().sort((a, b) => a.t - b.t)
}
