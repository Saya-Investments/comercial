import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const tareas = await prisma.crm_tareas.findMany({
    include: {
      bd_leads: { select: { id_lead: true, dni: true, nombre: true, apellido: true, numero: true, producto: true, estado_de_lead: true } },
    },
    orderBy: { fecha_creacion: 'desc' },
    take: 200,
  })

  const mapped = tareas.map((t) => ({
    id: t.id_tarea,
    leadId: t.id_lead,
    dni: t.bd_leads.dni || '',
    name: `${t.bd_leads.nombre || ''} ${t.bd_leads.apellido || ''}`.trim(),
    phone: t.bd_leads.numero || '',
    status: t.bd_leads.estado_de_lead || '',
    product: t.bd_leads.producto || '',
    priority: t.prioridad as 'Alta' | 'Media' | 'Baja',
    taskTitle: t.titulo,
    taskStatus: t.estado,
    assignedDate: t.fecha_creacion.toISOString().split('T')[0],
    dueDate: t.fecha_vencimiento?.toISOString().split('T')[0] || '',
  }))

  return NextResponse.json(mapped)
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const tarea = await prisma.crm_tareas.create({
    data: {
      id_lead: body.leadId,
      id_usuario_asignado: body.userId,
      titulo: body.title,
      descripcion: body.description || null,
      prioridad: body.priority || 'Media',
      fecha_vencimiento: body.dueDate ? new Date(body.dueDate) : null,
    },
  })

  return NextResponse.json({ id: tarea.id_tarea }, { status: 201 })
}
