import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { firestore } from '@/lib/firebase'
import { FieldValue } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

const PHONE_ID = process.env.WHATSAPP_PHONE_ID!
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { mensaje } = await req.json()

  if (!mensaje?.trim()) {
    return NextResponse.json({ error: 'Mensaje vacío' }, { status: 400 })
  }

  const lead = await prisma.bd_leads.findUnique({
    where: { id_lead: id },
    select: { numero: true },
  })

  if (!lead?.numero) {
    return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
  }

  const celular = lead.numero.replace(/^\+/, '')

  // Buscar último mensaje entrante del lead (sender: true) para verificar ventana 24h
  const snapshot = await firestore
    .collection('comercial')
    .where('celular', '==', celular)
    .get()

  const leadMessages = snapshot.docs
    .filter((doc) => doc.data().sender === true)
    .map((doc) => {
      const fecha = doc.data().fecha?.toDate?.() ?? new Date(0)
      return { fecha }
    })
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())

  if (leadMessages.length === 0) {
    return NextResponse.json(
      { error: 'outside_window', reason: 'El lead nunca ha enviado mensajes.' },
      { status: 422 }
    )
  }

  const hoursElapsed = (Date.now() - leadMessages[0].fecha.getTime()) / (1000 * 60 * 60)

  if (hoursElapsed >= 24) {
    return NextResponse.json(
      {
        error: 'outside_window',
        last_lead_message_at: leadMessages[0].fecha.toISOString(),
      },
      { status: 422 }
    )
  }

  if (!PHONE_ID || !ACCESS_TOKEN) {
    console.error('[send] Faltan env vars: WHATSAPP_PHONE_ID o WHATSAPP_ACCESS_TOKEN')
    return NextResponse.json({ error: 'config_error', detail: 'Variables de entorno no cargadas. Reinicia el servidor.' }, { status: 500 })
  }

  // Enviar mensaje via Meta Cloud API
  const metaRes = await fetch(
    `https://graph.facebook.com/v23.0/${PHONE_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: celular,
        type: 'text',
        text: { body: mensaje },
      }),
    }
  )

  if (!metaRes.ok) {
    const err = await metaRes.json()
    console.error('[send] Meta error:', JSON.stringify(err))
    return NextResponse.json({ error: 'meta_error', detail: err }, { status: 502 })
  }

  const metaData = await metaRes.json()

  // Guardar en Firestore con la misma estructura del bot
  await firestore.collection('comercial').add({
    celular,
    fecha: FieldValue.serverTimestamp(),
    id_bot: 'comercial',
    id_lead: id,
    mensaje,
    sender: false,
  })

  return NextResponse.json({ ok: true, message_id: metaData.messages?.[0]?.id })
}
