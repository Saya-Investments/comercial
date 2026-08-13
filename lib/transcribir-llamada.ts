/**
 * Transcripcion de llamadas con Deepgram.
 *
 * Se transcribe la MEZCLA de la conversacion con diarizacion (Deepgram agrupa
 * por voz y devuelve "hablante 0", "hablante 1"), y despues se mapea cada
 * hablante a asesor o lead.
 *
 * Antes se transcribian las pistas por separado, lo que daba atribucion exacta
 * por construccion. Se dejo de hacer porque grabar una pista por persona
 * implicaba 3 grabaciones concurrentes por llamada y el plan de LiveKit permite
 * 2: con dos asesores llamando a la vez, algunas fallaban en silencio.
 *
 * El costo de este cambio: la diarizacion ADIVINA. Se equivoca sobre todo
 * cuando los dos hablan encimados, que en una llamada de ventas pasa seguido.
 * Si mas adelante se sube de plan, conviene volver a las pistas separadas.
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

/**
 * Transcribe una llamada completa.
 *
 * Devuelve null si la grabacion todavia no esta en el bucket (la egress tarda
 * unos segundos en subirla despues de colgar).
 */
export async function transcribirLlamada(idLlamada: string): Promise<Turno[] | null> {
  if (!transcripcionConfigurada()) return null

  const [archivos] = await storage()
    .bucket(BUCKET)
    .getFiles({ prefix: `llamadas/${idLlamada}/` })

  // La mezcla es la que se transcribe. Se aceptan las pistas sueltas como
  // respaldo para las llamadas grabadas con el esquema anterior.
  const mezcla =
    archivos.find((f) => f.name.endsWith('conversacion.ogg')) ??
    archivos.find((f) => f.name.endsWith('.ogg'))

  if (!mezcla) return null

  const dg = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY! })

  // Se descarga a memoria en vez de pasarle una URL a Deepgram: el bucket es
  // privado y firmar una URL publica para que un tercero la lea es exponer la
  // grabacion mas de lo necesario. Una llamada de 10 min pesa ~2 MB.
  const [buffer] = await storage().bucket(BUCKET).file(mezcla.name).download()

  const res = await dg.listen.v1.media.transcribeFile(buffer, {
    model: 'nova-3',
    language: 'es',
    smart_format: true, // puntuacion y mayusculas: sin esto es un bloque ilegible
    utterances: true, // turnos en vez de una tirada de palabras
    diarize: true, // separa hablantes por voz; devuelve numeros, no nombres
  })

  // La v5 envuelve la respuesta segun el metodo; se contemplan las dos formas
  // para que un cambio menor del SDK no deje la transcripcion en silencio.
  type Utt = { transcript?: string; start?: number; speaker?: number }
  const r = res as unknown as {
    result?: { results?: { utterances?: Utt[] } }
    results?: { utterances?: Utt[] }
  }
  const utterances = (r.result?.results?.utterances ?? r.results?.utterances ?? []).filter(
    (u) => (u.transcript || '').trim().length > 0,
  )

  if (utterances.length === 0) return null

  /**
   * Deepgram devuelve numeros de hablante, no nombres. El mapeo se hace por
   * orden: en una llamada saliente habla primero el asesor (saluda y se
   * presenta), asi que el primer hablante es el asesor y el resto, el lead.
   *
   * Es una heuristica. Si el lead atiende diciendo "alo", queda invertido.
   */
  const primerHablante = utterances[0].speaker ?? 0

  return utterances.map((u) => ({
    who: (u.speaker ?? 0) === primerHablante ? 'asesor' : 'lead',
    text: (u.transcript || '').trim(),
    t: Number(u.start) || 0,
  }))
}
