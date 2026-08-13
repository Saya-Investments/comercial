/**
 * Acceso al bucket de grabaciones.
 *
 * Las grabaciones NO se sirven directo: el bucket es privado y la cuenta de
 * servicio solo puede crear y leer. Para reproducir se firma una URL temporal,
 * asi el audio nunca queda accesible desde internet ni pasa por el servidor del
 * CRM.
 *
 * Ver cambios_yomira/ESTADO_CRM_LLAMADAS.md
 */

import { Storage } from '@google-cloud/storage'

const BUCKET = process.env.GCS_BUCKET_GRABACIONES || ''

let _storage: Storage | null = null

function storage(): Storage {
  if (_storage) return _storage
  const cred = JSON.parse(process.env.GCS_SA_KEY || '{}')
  _storage = new Storage({ projectId: cred.project_id, credentials: cred })
  return _storage
}

export function grabacionesConfiguradas(): boolean {
  return Boolean(BUCKET && process.env.GCS_SA_KEY)
}

/** Credenciales tal como las espera LiveKit: el JSON serializado. */
export function credencialesParaLiveKit(): { credentials: string; bucket: string } {
  return { credentials: process.env.GCS_SA_KEY || '', bucket: BUCKET }
}

/**
 * Carpeta de una llamada. Una por llamada, con un archivo por participante:
 * asi el asesor y el lead quedan en pistas separadas y la atribucion es exacta.
 */
export function carpetaDeLlamada(idLlamada: string): string {
  return `llamadas/${idLlamada}`
}

/**
 * URLs firmadas de las pistas de una llamada.
 *
 * Duran 15 minutos: suficiente para escuchar la grabacion, poco para que el
 * enlace sirva si se filtra (por chat, por historial del navegador).
 */
export async function urlsDeGrabacion(
  idLlamada: string,
  minutos = 15,
): Promise<{ nombre: string; url: string; mezcla: boolean }[]> {
  if (!grabacionesConfiguradas()) return []

  const [archivos] = await storage()
    .bucket(BUCKET)
    .getFiles({ prefix: `${carpetaDeLlamada(idLlamada)}/` })

  const expires = Date.now() + minutos * 60_000

  const pistas = await Promise.all(
    archivos
      // El manifest .json que escribe LiveKit no es audio.
      .filter((f) => !f.name.endsWith('.json'))
      .map(async (f) => {
        const [url] = await f.getSignedUrl({ action: 'read', expires })
        const base = f.name.split('/').pop() || f.name
        // El nombre del archivo lleva la identity, que es como sabemos de quien
        // es cada pista sin tener que adivinar con diarizacion.
        const nombre = base.startsWith('conversacion')
          ? 'Conversación'
          : base.startsWith('asesor')
            ? 'Asesor'
            : 'Lead'
        return { nombre, url, mezcla: nombre === 'Conversación' }
      }),
  )

  // La mezcla primero: es la que uno quiere escuchar por defecto.
  return pistas.sort((a, b) => Number(b.mezcla) - Number(a.mezcla))
}
