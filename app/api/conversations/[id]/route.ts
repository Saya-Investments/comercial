import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { firestore } from '@/lib/firebase'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Obtener el numero (celular) del lead desde PostgreSQL
  const lead = await prisma.bd_leads.findUnique({
    where: { id_lead: id },
    select: { numero: true },
  })

  if (!lead?.numero) {
    return NextResponse.json([])
  }

  // Normalizar: quitar el + del numero para que coincida con Firestore
  const celular = lead.numero.replace(/^\+/, '')

  // Buscar mensajes en Firestore coleccion "comercial" por celular
  const snapshot = await firestore
    .collection('comercial')
    .where('celular', '==', celular)
    .get()

  const messages = snapshot.docs
    .map((doc) => {
      const data = doc.data()
      const fecha = data.fecha?.toDate?.() ? data.fecha.toDate() : new Date(data.fecha || 0)
      // Ajustar a UTC-5 (Peru)
      const fechaPeru = new Date(fecha.getTime() - 5 * 60 * 60 * 1000)
      return {
        text: data.mensaje || '',
        sender: data.sender === true ? 'lead' as const : 'user' as const,
        timestamp: fechaPeru.toISOString().replace('T', ' ').slice(0, 16),
        imagen_url: data.imagen_url || null,
        _sort: fecha.getTime(),
      }
    })
    .sort((a, b) => a._sort - b._sort)
    .map(({ _sort, ...msg }, i) => ({ id: i + 1, ...msg }))

  return NextResponse.json(messages)
}
