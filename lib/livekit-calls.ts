/**
 * Envoltorio del SDK de LiveKit para las llamadas por WhatsApp.
 *
 * Todo el contacto con el SDK pasa por aca a proposito: el conector de WhatsApp
 * esta en BETA y su API puede cambiar. Concentrandolo en un solo archivo, un
 * cambio de firma se arregla en un lugar y no desparramado por las rutas.
 *
 * Ver cambios_yomira/CAMBIOS_LLAMADAS_CRM.md
 */

import {
  AccessToken,
  ConnectorClient,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  GCPUpload,
  RoomServiceClient,
} from 'livekit-server-sdk'
import { carpetaDeLlamada, credencialesParaLiveKit, grabacionesConfiguradas } from '@/lib/gcs-grabaciones'

const LIVEKIT_URL = process.env.LIVEKIT_URL || ''
const API_KEY = process.env.LIVEKIT_API_KEY || ''
const API_SECRET = process.env.LIVEKIT_API_SECRET || ''

/** La doc del conector enumera 23.0/24.0/25.0. Meta ya va en v26 pero no hace
 *  falta que coincidan: son cosas distintas (webhook vs. cliente del conector). */
const CLOUD_API_VERSION = process.env.WHATSAPP_CLOUD_API_VERSION_CONECTOR || '25.0'

/** El SDK de servidor habla HTTP aunque la URL del proyecto sea wss://. */
const httpUrl = LIVEKIT_URL.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:')

export function livekitConfigurado(): boolean {
  return Boolean(LIVEKIT_URL && API_KEY && API_SECRET)
}

function connector() {
  return new ConnectorClient(httpUrl, API_KEY, API_SECRET)
}

function rooms() {
  return new RoomServiceClient(httpUrl, API_KEY, API_SECRET)
}

/**
 * Token con el que el navegador del asesor entra a la sala.
 *
 * Es por llamada, no por usuario: LiveKit no tiene cuentas. Vence solo, asi que
 * no hay que guardarlo ni invalidarlo. El `identity` es lo que despues nombra
 * las pistas de la grabacion, por eso lleva el id del usuario.
 */
export async function tokenAsesor(opts: {
  room: string
  userId: string
  nombre?: string
}): Promise<string> {
  const at = new AccessToken(API_KEY, API_SECRET, {
    identity: `asesor:${opts.userId}`,
    name: opts.nombre || 'Asesor',
    ttl: '2h', // cubre la llamada mas larga imaginable sin dejar el token vivo de gratis
  })
  at.addGrant({
    roomJoin: true,
    room: opts.room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  })
  return at.toJwt()
}

/**
 * Origina la llamada de WhatsApp hacia el lead.
 *
 * Quien marca es Meta; LiveKit es el intermediario que le pasa la orden y se
 * queda con el audio. Devuelve el id de llamada de WhatsApp, que es la clave
 * para colgar y para cruzar con los eventos del webhook.
 */
export async function llamarPorWhatsApp(opts: {
  room: string
  telefono: string
}): Promise<{ whatsappCallId: string }> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_ID || ''
  const apiKey = process.env.WHATSAPP_ACCESS_TOKEN || ''

  const res = await connector().dialWhatsAppCall({
    whatsappPhoneNumberId: phoneNumberId,
    whatsappToPhoneNumber: opts.telefono,
    whatsappCloudApiVersion: CLOUD_API_VERSION,
    whatsappApiKey: apiKey,
    roomName: opts.room,
  })

  return { whatsappCallId: (res as { whatsappCallId: string }).whatsappCallId }
}

/**
 * Corta la llamada.
 *
 * Hay que llamarlo siempre, cuelgue quien cuelgue: si no, la limpieza
 * automatica recien ocurre a los 30 s y esos minutos igual se facturan.
 */
export async function colgarLlamada(whatsappCallId: string): Promise<void> {
  // Pide el token de Meta ademas del id: quien corta la llamada es Meta, no
  // LiveKit — LiveKit solo transmite la orden.
  await connector().disconnectWhatsAppCall(
    whatsappCallId,
    process.env.WHATSAPP_ACCESS_TOKEN || '',
  )
}

/**
 * Crea la sala antes de marcar.
 *
 * `emptyTimeout` generoso: entre que el asesor entra y el lead contesta, la
 * sala queda momentaneamente con un solo participante, y no queremos que
 * LiveKit la cierre en medio de la negociacion.
 */
export async function crearSala(room: string): Promise<void> {
  try {
    await rooms().createRoom({ name: room, emptyTimeout: 300, maxParticipants: 5 })
  } catch {
    // Si ya existe, sirve igual.
  }
}

function egress() {
  return new EgressClient(httpUrl, API_KEY, API_SECRET)
}

/**
 * Arranca una grabacion POR PARTICIPANTE (Track Egress).
 *
 * Una pista por persona en vez de una mezcla: asi se sabe con certeza quien
 * dijo que, sin depender de que un modelo lo adivine (diarizacion). Los
 * archivos se nombran con la identity, que es lo que despues permite
 * etiquetarlos como "Asesor" y "Lead".
 *
 * Devuelve cuantas pistas se pusieron a grabar.
 */
export async function iniciarGrabacion(room: string, idLlamada: string): Promise<number> {
  if (!grabacionesConfiguradas()) {
    console.warn('[livekit] grabacion no configurada (falta GCS_BUCKET_GRABACIONES / GCS_SA_KEY)')
    return 0
  }

  const { credentials, bucket } = credencialesParaLiveKit()
  const cliente = egress()
  let iniciadas = 0

  // UNA sola grabacion por llamada: la mezcla de la conversacion.
  //
  // Antes se grababa ademas una pista por persona, lo que daba atribucion
  // exacta para la transcripcion. Pero eran 3 grabaciones concurrentes por
  // llamada y el plan permite 2: con dos asesores llamando a la vez, algunas
  // fallaban en silencio y la llamada quedaba sin audio guardado. Con una sola
  // entran varias llamadas simultaneas; el precio es que la transcripcion pasa
  // a depender de diarizacion (ver lib/transcribir-llamada.ts).
  try {
    await cliente.startRoomCompositeEgress(
      room,
      new EncodedFileOutput({
        fileType: EncodedFileType.OGG,
        filepath: `${carpetaDeLlamada(idLlamada)}/conversacion.ogg`,
        output: { case: 'gcp', value: new GCPUpload({ credentials, bucket }) },
      }),
      { audioOnly: true },
    )
    iniciadas++
  } catch (e) {
    console.error('[livekit] egress de la mezcla fallo:', e)
  }

  console.log(`[livekit] grabando la mezcla en ${room} (${iniciadas} egress)`)
  return iniciadas
}

/**
 * Detiene las grabaciones activas de una sala.
 *
 * Se consultan por sala en vez de guardar los ids: si el proceso del CRM se
 * reinicia a mitad de una llamada, los ids en memoria se pierden pero LiveKit
 * sigue sabiendo que hay grabando.
 */
export async function detenerGrabaciones(room: string): Promise<void> {
  if (!grabacionesConfiguradas()) return
  try {
    const cliente = egress()
    const enCurso = await cliente.listEgress({ roomName: room, active: true })

    // Cuando cuelga el lead, la sala se vacia y LiveKit detiene las grabaciones
    // por su cuenta; `active: true` igual devuelve las recien completadas.
    // Pedir stop sobre esas da un 412 que no es un problema real, solo ruido.
    // EgressStatus: 0 STARTING · 1 ACTIVE · 2 ENDING · 3 COMPLETE · 4 FAILED
    const detenibles = enCurso.filter((e) => e.status <= 1)

    await Promise.all(
      detenibles.map((e) =>
        cliente.stopEgress(e.egressId).catch((err) => {
          // Puede completarse entre el listado y el stop: es una carrera
          // esperable, no un fallo de la grabacion.
          const esperado = (err as { status?: number })?.status === 412
          if (!esperado) console.warn('[livekit] stopEgress:', err)
        }),
      ),
    )
  } catch (e) {
    console.error('[livekit] detenerGrabaciones:', e)
  }
}

/** Borra la sala. Best-effort: si ya no existe, no es un error real. */
export async function cerrarSala(room: string): Promise<void> {
  try {
    await rooms().deleteRoom(room)
  } catch {
    // la sala pudo cerrarse sola al irse el ultimo participante
  }
}
