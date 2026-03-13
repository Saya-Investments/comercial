import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const estado = searchParams.get('estado') || ''
  const producto = searchParams.get('producto') || ''
  const userId = searchParams.get('userId') || ''
  const role = searchParams.get('role') || ''
  const asesorId = searchParams.get('asesorId') || ''

  const where: Record<string, unknown> = {}

  // Filter by specific asesor (admin filtering)
  if (asesorId) {
    const matchings = await prisma.matching.findMany({
      where: { id_asesor: asesorId, asignado: true },
      select: { id_lead: true },
    })
    const leadIds = matchings.map((m) => m.id_lead)
    where.OR = [
      { id_lead: { in: leadIds } },
      { ultimo_asesor_asignado: asesorId },
    ]
  } else if (userId && role === 'asesor') {
    const usuario = await prisma.crm_usuarios.findUnique({
      where: { id_usuario: userId },
      select: { id_asesor: true },
    })

    if (usuario?.id_asesor) {
      // Get lead IDs assigned to this asesor via matching (asignado = true)
      const matchings = await prisma.matching.findMany({
        where: { id_asesor: usuario.id_asesor, asignado: true },
        select: { id_lead: true },
      })
      const leadIds = matchings.map((m) => m.id_lead)

      // Also include leads directly assigned via ultimo_asesor_asignado
      where.OR = [
        { id_lead: { in: leadIds } },
        { ultimo_asesor_asignado: usuario.id_asesor },
      ]
    } else {
      // User has no linked asesor, show nothing
      return NextResponse.json([])
    }
  }

  if (search) {
    const searchFilter = [
      { nombre: { contains: search, mode: 'insensitive' } },
      { apellido: { contains: search, mode: 'insensitive' } },
      { dni: { contains: search } },
      { numero: { contains: search } },
    ]
    // Combine search with existing OR (asesor filter) using AND
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchFilter }]
      delete where.OR
    } else {
      where.OR = searchFilter
    }
  }
  if (estado) where.estado_de_lead = estado
  if (producto) where.producto = producto

  const leads = await prisma.bd_leads.findMany({
    where,
    include: {
      bd_asesores: { select: { nombre_asesor: true, cod_asesor: true } },
    },
    orderBy: { fecha_creacion: 'desc' },
    take: 200,
  })

  const mapped = leads.map((l) => ({
    id: l.id_lead,
    dni: l.dni || '',
    name: `${l.nombre || ''} ${l.apellido || ''}`.trim(),
    phone: l.numero || '',
    email: l.correo || '',
    status: l.estado_de_lead || 'lead',
    assignedDate: l.fecha_creacion.toISOString().split('T')[0],
    product: l.producto || '',
    priority: getPriority(l.scoring),
    score: l.scoring ? Math.round(Number(l.scoring) * 100) : 0,
    zona: l.zona || '',
    origen: l.origen_lead || '',
    asesor: l.bd_asesores?.nombre_asesor || 'Sin asignar',
    sentimiento: l.sentimiento_actual || '',
    segmento: l.segmento_de_scoring || '',
  }))

  return NextResponse.json(mapped)
}

function getPriority(scoring: unknown): 'Alta' | 'Media' | 'Baja' {
  const s = Number(scoring) || 0
  if (s >= 0.7) return 'Alta'
  if (s >= 0.4) return 'Media'
  return 'Baja'
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const lead = await prisma.bd_leads.create({
    data: {
      dni: body.dni,
      nombre: body.name?.split(' ')[0] || body.name,
      apellido: body.name?.split(' ').slice(1).join(' ') || '',
      numero: body.phone,
      producto: body.product,
      correo: body.email || null,
      estado_de_lead: 'lead',
    },
  })

  return NextResponse.json({ id: lead.id_lead }, { status: 201 })
}
