import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { firestore } from '@/lib/firebase'
import { FieldValue } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

const PHONE_ID = process.env.WHATSAPP_PHONE_ID!
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const formData = await req.formData()
  const file = formData.get('imagen') as File | null
  const caption = (formData.get('caption') as string | null)?.trim() ?? ''

  if (!file) {
    return NextResponse.json({ error: 'No se adjuntó imagen' }, { status: 400 })
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
      { error: 'outside_window', last_lead_message_at: leadMessages[0].fecha.toISOString() },
      { status: 422 }
    )
  }

  // Paso 1: subir imagen a los servidores de Meta
  // Leer bytes explícitamente para serialización multipart confiable en Node.js
  const fileBytes = await file.arrayBuffer()
  const mimeType = file.type || 'image/jpeg'
  const fileName = file.name || 'image.jpg'

  const uploadForm = new FormData()
  uploadForm.append('messaging_product', 'whatsapp')
  uploadForm.append('file', new Blob([fileBytes], { type: mimeType }), fileName)
  uploadForm.append('type', mimeType)

  const uploadRes = await fetch(`https://graph.facebook.com/v23.0/${PHONE_ID}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    body: uploadForm,
  })

  if (!uploadRes.ok) {
    const err = await uploadRes.json()
    console.error('[send-image] Meta upload error:', JSON.stringify(err))
    return NextResponse.json({ error: 'upload_error', detail: err }, { status: 502 })
  }

  const { id: mediaId } = await uploadRes.json()

  // Paso 2: enviar mensaje con el media_id obtenido
  const imagePayload: Record<string, string> = { id: mediaId }
  if (caption) imagePayload.caption = caption

  const metaRes = await fetch(`https://graph.facebook.com/v23.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: celular,
      type: 'image',
      image: imagePayload,
    }),
  })

  if (!metaRes.ok) {
    const err = await metaRes.json()
    console.error('[send-image] Meta send error:', JSON.stringify(err))
    return NextResponse.json({ error: 'meta_error', detail: err }, { status: 502 })
  }

  const metaData = await metaRes.json()

  // Guardar en Firestore
  await firestore.collection('comercial').add({
    celular,
    fecha: FieldValue.serverTimestamp(),
    id_bot: 'comercial',
    id_lead: id,
    mensaje: caption || '',
    sender: false,
  })

  return NextResponse.json({ ok: true, message_id: metaData.messages?.[0]?.id })
}
