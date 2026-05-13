import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { firestore } from '@/lib/firebase'
import { FieldValue } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

const PHONE_ID     = process.env.WHATSAPP_PHONE_ID!
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!
const BOT_PAUSE_MS = 3 * 60 * 60 * 1000

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!PHONE_ID || !ACCESS_TOKEN) {
    return NextResponse.json({ error: 'config_error', detail: 'Variables WHATSAPP no cargadas. Reinicia el servidor.' }, { status: 500 })
  }

  const formData = await req.formData()
  const file = formData.get('imagen') as File | null
  const caption = (formData.get('caption') as string | null)?.trim() || undefined

  if (!file) {
    return NextResponse.json({ error: 'Imagen requerida' }, { status: 400 })
  }

  const lead = await prisma.bd_leads.findUnique({
    where: { id_lead: id },
    select: { numero: true },
  })

  if (!lead?.numero) {
    return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
  }

  const celular = lead.numero.replace(/^\+/, '')

  // Verificar ventana de 24h
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

  // Subir imagen a Meta
  const mimeType = file.type || 'image/jpeg'
  const fileBytes = await file.arrayBuffer()
  const mediaForm = new FormData()
  mediaForm.append('file', new Blob([fileBytes], { type: mimeType }), file.name || 'imagen.jpg')
  mediaForm.append('messaging_product', 'whatsapp')
  mediaForm.append('type', mimeType)

  const uploadRes = await fetch(`https://graph.facebook.com/v23.0/${PHONE_ID}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    body: mediaForm,
  })

  if (!uploadRes.ok) {
    const err = await uploadRes.json()
    console.error('[send-image] Upload error:', JSON.stringify(err))
    return NextResponse.json({ error: 'upload_error', detail: err }, { status: 502 })
  }

  const { id: mediaId } = await uploadRes.json()

  // Enviar imagen via WhatsApp
  const msgBody: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to: celular,
    type: 'image',
    image: caption ? { id: mediaId, caption } : { id: mediaId },
  }

  const metaRes = await fetch(`https://graph.facebook.com/v23.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(msgBody),
  })

  if (!metaRes.ok) {
    const err = await metaRes.json()
    console.error('[send-image] Meta error:', JSON.stringify(err))
    return NextResponse.json({ error: 'meta_error', detail: err }, { status: 502 })
  }

  const metaData = await metaRes.json()

  // Guardar en Firestore y pausar bot
  await Promise.all([
    firestore.collection('comercial').add({
      celular,
      fecha: FieldValue.serverTimestamp(),
      id_bot: 'comercial',
      id_lead: id,
      mensaje: caption || '',
      imagen_url: `media:${mediaId}`,
      sender: false,
    }),
    prisma.bd_leads.update({
      where: { id_lead: id },
      data: { bot_pausado: true, bot_pausado_hasta: new Date(Date.now() + BOT_PAUSE_MS) },
    }),
  ])

  return NextResponse.json({ ok: true, message_id: metaData.messages?.[0]?.id })
}
