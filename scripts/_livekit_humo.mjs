/**
 * Prueba de humo — conector de WhatsApp de LiveKit.
 *
 * Marca a un celular por WhatsApp usando el numero del bot y mete la llamada en
 * una room de LiveKit. Es el paso que decide si todo el modulo es viable: si
 * suena y hay audio, se fue el grueso del riesgo tecnico.
 *
 * NO es codigo de produccion. Es un script de validacion de un solo uso.
 * Ver cambios_yomira/handoff-llamadas-livekit-whatsapp.md (Fase A).
 *
 * Uso:
 *   node scripts/_livekit_humo.mjs +51999888777
 *
 * Requiere en .env:
 *   LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
 *   WHATSAPP_PHONE_ID, WHATSAPP_ACCESS_TOKEN
 *
 * OJO: el numero destino tiene que haber concedido permiso de llamada (ver §3
 * del handoff). Sin permiso, Meta rechaza la llamada.
 */

import 'dotenv/config'
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'
import { ConnectorClient } from 'livekit-server-sdk'

const destino = process.argv[2]
/**
 * --solo: genera unicamente un token de sala, sin llamar a nadie.
 *
 * Sirve para saber si el navegador puede conectarse a LiveKit, sin meter a Meta
 * en el medio. Si con este token tampoco entras desde meet.livekit.io, el
 * problema es del navegador o de la red, no del CRM.
 */
const soloToken = destino === '--solo'

if (!destino) {
  console.error('Uso: node scripts/_livekit_humo.mjs +51999888777')
  console.error('     node scripts/_livekit_humo.mjs --solo   (solo token, no llama)')
  process.exit(1)
}

const {
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  WHATSAPP_PHONE_ID,
  WHATSAPP_ACCESS_TOKEN,
} = process.env

const faltantes = Object.entries({
  LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET,
  WHATSAPP_PHONE_ID, WHATSAPP_ACCESS_TOKEN,
}).filter(([, v]) => !v).map(([k]) => k)

if (faltantes.length) {
  console.error('Faltan variables en .env:', faltantes.join(', '))
  process.exit(1)
}

// La doc del conector enumera 23.0 / 24.0 / 25.0. Si 26.0 falla, bajar a 25.0.
const CLOUD_API_VERSION = process.env.WHATSAPP_CLOUD_API_VERSION_CONECTOR || '25.0'

const httpUrl = LIVEKIT_URL.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:')
const room = `humo_${Date.now()}`

/**
 * Token para unirse a la sala haciendo de "asesor".
 *
 * Sirve para probar el audio real ANTES de construir el softphone: con este
 * token te podes unir a la room desde https://meet.livekit.io (pestaña Custom)
 * y hablar con el lead. Es el lugar exacto que despues ocupara el navegador
 * del asesor dentro del CRM.
 */
async function tokenAsesor(roomName) {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: 'asesor:prueba',
    name: 'Asesor (prueba)',
    ttl: '30m',
  })
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true })
  return at.toJwt()
}

async function main() {
  const connector = new ConnectorClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
  const rooms = new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)

  // Se imprime PRIMERO: hay que estar dentro de la sala antes de que el lead
  // conteste, o los primeros segundos de la llamada son silencio.
  const token = await tokenAsesor(room)
  console.log('\n--- Para hablar con el lead (hace de asesor) ---')
  console.log('1. Abri https://meet.livekit.io  ->  pestaña "Custom"')
  console.log(`2. Server URL: ${LIVEKIT_URL}`)
  console.log(`3. Token:\n${token}`)
  console.log('4. Entra a la sala Y RECIEN AHI conteste el celular.')
  console.log('   Usa audifonos: sin cancelacion de eco, el lead se oye a si mismo.')
  console.log('-----------------------------------------------\n')

  if (soloToken) {
    console.log('Modo --solo: no se llama a nadie.')
    console.log('Si con este token PODES entrar a la sala y se ve tu microfono,')
    console.log('  el navegador y la red estan bien -> el problema esta en el CRM.')
    console.log('Si NO podes entrar, el problema es del navegador o la red')
    console.log('  (Brave Shields, VPN, firewall corporativo bloqueando WebRTC).')
    return
  }

  console.log(`Room: ${room}`)
  console.log(`Marcando a ${destino} desde el numero ${WHATSAPP_PHONE_ID}...\n`)

  let call
  try {
    call = await connector.dialWhatsAppCall({
      whatsappPhoneNumberId: WHATSAPP_PHONE_ID,
      whatsappToPhoneNumber: destino,
      whatsappCloudApiVersion: CLOUD_API_VERSION,
      whatsappApiKey: WHATSAPP_ACCESS_TOKEN,
      roomName: room,
    })
  } catch (e) {
    console.error('dialWhatsAppCall fallo:', e?.message || e)
    console.error('\nSi el error menciona que el conector no esta habilitado,')
    console.error('hay que pedirle acceso a la beta a soporte de LiveKit.')
    console.error('Si menciona permisos, revisar el permiso de llamada del contacto.')
    console.error('Si menciona la version, probar con 25.0 o 24.0.')
    process.exit(1)
  }

  console.log('Llamada iniciada:', JSON.stringify(call, null, 2))
  console.log('\nDeberia estar sonando el WhatsApp del destino.')
  console.log('IMPORTANTE: cuando conteste, Meta manda un webhook con el SDP answer')
  console.log('a la URL configurada, y ahi hay que llamar a connectWhatsAppCall YA:')
  console.log('  await connector.connectWhatsAppCall(callId, { type: "answer", sdp })')
  console.log('Sin ese paso, la llamada se conecta muda y se corta sola.\n')

  // Monitorear participantes de la room durante 60s para ver si el lead entra.
  const hasta = Date.now() + 60_000
  const visto = new Set()
  while (Date.now() < hasta) {
    try {
      const ps = await rooms.listParticipants(room)
      for (const p of ps) {
        if (!visto.has(p.identity)) {
          visto.add(p.identity)
          console.log(`[${new Date().toISOString()}] participante: ${p.identity}`)
        }
      }
    } catch {
      // la room puede no existir hasta que entra el primer participante
    }
    await new Promise((r) => setTimeout(r, 2000))
  }

  console.log('\nFin del monitoreo.')
  console.log(visto.size
    ? 'Hubo participantes: el conector funciona.'
    : 'Nadie entro a la room. Revisar el webhook / connectWhatsAppCall.')
}

main().catch((e) => { console.error(e); process.exit(1) })
