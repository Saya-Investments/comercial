/**
 * Envia una solicitud de permiso de llamada por WhatsApp.
 *
 * Sin este permiso, Meta rechaza toda llamada saliente con:
 *   138006 "No approved call permission from the recipient"
 *
 * REQUISITO: la ventana de 24h tiene que estar ABIERTA, o sea que el destino
 * tiene que haberle escrito al bot en las ultimas 24 horas. Si no, este envio
 * falla y hay que reabrir la conversacion con una plantilla primero.
 *
 * LIMITE: 1 solicitud cada 24h por contacto (25/dia en sandbox). Si el usuario
 * no responde, se puede mandar una segunda dentro de 7 dias. No abusar.
 *
 * Uso:
 *   node scripts/_wa_permiso_llamada.mjs 51993538942
 *   node scripts/_wa_permiso_llamada.mjs 51993538942 "Texto personalizado"
 *
 * Ver cambios_yomira/handoff-llamadas-livekit-whatsapp.md (§3, Fase 0).
 */

import 'dotenv/config'

const destino = (process.argv[2] || '').replace(/[^0-9]/g, '')
const textoArg = process.argv[3]

if (!destino) {
  console.error('Uso: node scripts/_wa_permiso_llamada.mjs 51993538942 ["texto"]')
  process.exit(1)
}

const PHONE_ID = process.env.WHATSAPP_PHONE_ID
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN
const VERSION = process.env.WHATSAPP_CLOUD_API_VERSION || 'v26.0'

if (!PHONE_ID || !TOKEN) {
  console.error('Faltan WHATSAPP_PHONE_ID o WHATSAPP_ACCESS_TOKEN en .env')
  process.exit(1)
}

// El texto es lo que ve el lead junto a los botones. Conviene que diga quien
// llama y para que: la tasa de aceptacion depende casi enteramente de esto.
const texto = textoArg ||
  'Hola, soy tu asesor de Maqui+. ¿Nos autorizas a llamarte por WhatsApp ' +
  'para resolver tus dudas sobre el credito? Es mas rapido que por chat.'

const url = `https://graph.facebook.com/${VERSION}/${PHONE_ID}/messages`

const body = {
  messaging_product: 'whatsapp',
  recipient_type: 'individual',
  to: destino,
  type: 'interactive',
  interactive: {
    type: 'call_permission_request',
    action: { name: 'call_permission_request' },
    body: { text: texto },
  },
}

const res = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
})

const json = await res.json().catch(() => ({}))

if (!res.ok) {
  console.error(`\nFallo (${res.status}):`)
  console.error(JSON.stringify(json, null, 2))
  const code = json?.error?.code
  if (code === 131047 || code === 131026) {
    console.error('\n→ La ventana de 24h esta cerrada. El destino tiene que')
    console.error('  escribirle al bot primero (o mandarle una plantilla).')
  }
  process.exit(1)
}

console.log('\nSolicitud enviada:')
console.log(JSON.stringify(json, null, 2))
console.log('\nAhora, en el celular destino:')
console.log('  1. Deberia llegar un mensaje con botones de autorizacion.')
console.log('  2. Aceptar (si ofrece "siempre", elegir esa: el permiso queda')
console.log('     indefinido en vez de vencer a los 7 dias).')
console.log('  3. Reintentar:  node scripts/_livekit_humo.mjs +' + destino)
