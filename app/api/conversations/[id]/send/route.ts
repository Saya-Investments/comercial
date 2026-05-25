import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { firestore } from '@/lib/firebase'
import { FieldValue } from 'firebase-admin/firestore'
import { registrarMensajeWspComoAccion } from '@/lib/registrar-mensaje-wsp-accion'

export const dynamic = 'force-dynamic'

const PHONE_ID     = process.env.WHATSAPP_PHONE_ID!
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!
const BOT_PAUSE_MS = 3 * 60 * 60 * 1000 // 3 horas

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { mensaje } = await req.json()

  if (!mensaje?.trim()) {
    return NextResponse.json({ error: 'Mensaje vacío' }, { status: 400 })
  }

  if (!PHONE_ID || !ACCESS_TOKEN) {
    return NextResponse.json({ error: 'config_error', detail: 'Variables WHATSAPP no cargadas. Reinicia el servidor.' }, { status: 500 })
  }

  const lead = await prisma.bd_leads.findUnique({
    where: { id_lead: id },
    select: { numero: true },
  })

  if (!lead?.numero) {
    return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
  }

  const celular = lead.numero.replace(/^\+/, '')

  // Verificar ventana de 24h: último mensaje entrante del lead (sender: true)
  const snapshot = await firestore.collection('comercial').where('celular', '==', celular).get()

  const leadMessages = snapshot.docs
    .filter((doc) => doc.data().sender === true)
    .map((doc) => ({ fecha: doc.data().fecha?.toDate?.() ?? new Date(0) }))
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())

  if (leadMessages.length === 0) {
    return NextResponse.json({ error: 'outside_window', reason: 'El lead nunca ha enviado mensajes.' }, { status: 422 })
  }

  const hoursElapsed = (Date.now() - leadMessages[0].fecha.getTime()) / (1000 * 60 * 60)
  if (hoursElapsed >= 24) {
    return NextResponse.json({ error: 'outside_window', last_lead_message_at: leadMessages[0].fecha.toISOString() }, { status: 422 })
  }

  // Enviar por Meta Cloud API
  const metaRes = await fetch(`https://graph.facebook.com/v23.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: celular, type: 'text', text: { body: mensaje } }),
  })

  if (!metaRes.ok) {
    const err = await metaRes.json()
    console.error('[send] Meta error:', JSON.stringify(err))
    return NextResponse.json({ error: 'meta_error', detail: err }, { status: 502 })
  }

  const metaData = await metaRes.json()

  // Guardar en Firestore, pausar bot y registrar accion Mensaje_WSP (si aplica) en paralelo
  await Promise.all([
    firestore.collection('comercial').add({
      celular,
      fecha: FieldValue.serverTimestamp(),
      id_bot: 'comercial',
      id_lead: id,
      mensaje,
      sender: false,
    }),
    prisma.bd_leads.update({
      where: { id_lead: id },
      data: { bot_pausado: true, bot_pausado_hasta: new Date(Date.now() + BOT_PAUSE_MS) },
    }),
    registrarMensajeWspComoAccion(id),
  ])

  return NextResponse.json({ ok: true, message_id: metaData.messages?.[0]?.id })
}
