import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { firestore } from '@/lib/firebase'
import { esEmailDemo } from '@/lib/demo-access'

export const dynamic = 'force-dynamic'

const PHONE_ID = process.env.WHATSAPP_PHONE_ID!
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!
const VERSION = process.env.WHATSAPP_CLOUD_API_VERSION || 'v26.0'

/**
 * Pide al lead permiso para llamarlo por WhatsApp.
 *
 * Es la RED DE SEGURIDAD, no el camino principal: lo normal es que el bot lo
 * pida al enrutar, mientras el lead conversa. Desde el CRM se usa cuando eso no
 * paso — con el costo de que hay que esperar a que el lead conteste el mensaje.
 *
 * Meta permite UNA solicitud cada 24h por contacto, asi que este endpoint no se
 * puede llamar a la ligera: si se quema, el asesor se queda sin pedirla cuando
 * de verdad la necesite.
 */
export async function POST(req: NextRequest) {
  if (!PHONE_ID || !ACCESS_TOKEN) {
    return NextResponse.json({ error: 'config_error' }, { status: 500 })
  }

  const { leadId, userId } = await req.json().catch(() => ({}))

  if (!leadId || !userId) {
    return NextResponse.json({ error: 'leadId y userId son requeridos' }, { status: 400 })
  }

  const usuario = await prisma.crm_usuarios.findUnique({
    where: { id_usuario: userId },
    select: { email: true },
  })

  if (!usuario || !esEmailDemo(usuario.email)) {
    return NextResponse.json({ error: 'no_habilitado' }, { status: 403 })
  }

  const lead = await prisma.bd_leads.findUnique({
    where: { id_lead: leadId },
    select: { numero: true, permiso_llamada_pedido: true, permiso_llamada_estado: true },
  })

  if (!lead?.numero) {
    return NextResponse.json({ error: 'El lead no tiene numero' }, { status: 404 })
  }

  if (lead.permiso_llamada_estado === 'concedido') {
    return NextResponse.json({ error: 'ya_concedido' }, { status: 409 })
  }

  // Tope de Meta: 1 cada 24h. Se chequea antes de gastar el intento, porque un
  // rechazo de Meta cuenta igual contra el limite.
  if (lead.permiso_llamada_pedido) {
    const horas = (Date.now() - lead.permiso_llamada_pedido.getTime()) / 3_600_000
    if (horas < 24) {
      return NextResponse.json(
        { error: 'pedido_reciente', horasRestantes: Math.ceil(24 - horas) },
        { status: 429 },
      )
    }
  }

  const celular = lead.numero.replace(/^\+/, '')

  // La solicitud es un mensaje libre, asi que necesita la ventana de 24h
  // abierta. Mismo chequeo que usa el envio manual de WhatsApp.
  const snapshot = await firestore.collection('comercial').where('celular', '==', celular).get()
  const ultimoDelLead = snapshot.docs
    .filter((d) => d.data().sender === true)
    .map((d) => d.data().fecha?.toDate?.() ?? new Date(0))
    .sort((a, b) => b.getTime() - a.getTime())[0]

  if (!ultimoDelLead || (Date.now() - ultimoDelLead.getTime()) / 3_600_000 >= 24) {
    return NextResponse.json(
      {
        error: 'fuera_de_ventana',
        detail: 'El lead no escribio en las ultimas 24h. Hay que reabrir la conversacion primero.',
      },
      { status: 422 },
    )
  }

  const res = await fetch(`https://graph.facebook.com/${VERSION}/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: celular,
      type: 'interactive',
      interactive: {
        type: 'call_permission_request',
        action: { name: 'call_permission_request' },
        body: {
          text:
            'Para ayudarte mejor, tu asesor puede llamarte por WhatsApp. ' +
            '¿Nos autorizas? Es más rápido que resolverlo por chat.',
        },
      },
    }),
  })

  if (!res.ok) {
    const detalle = await res.text()
    console.error('[calls/permission] Meta rechazo:', detalle)
    return NextResponse.json({ error: 'meta_error', detail: detalle }, { status: 502 })
  }

  await prisma.bd_leads.update({
    where: { id_lead: leadId },
    data: { permiso_llamada_pedido: new Date(), permiso_llamada_estado: 'pendiente' },
  })

  return NextResponse.json({ ok: true })
}
