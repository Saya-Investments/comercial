import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function getPriority(scoring: unknown): 'Alta' | 'Media' | 'Baja' {
  const s = Number(scoring) || 0
  if (s >= 0.7) return 'Alta'
  if (s >= 0.4) return 'Media'
  return 'Baja'
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId') || ''
  const role = searchParams.get('role') || ''

  // ---------- Leads asignados via matching ----------
  let matchingLeads: Array<{
    id: string
    leadId: string
    dni: string
    name: string
    phone: string
    status: string
    product: string
    priority: 'Alta' | 'Media' | 'Baja'
    taskTitle: string
    taskStatus: string
    assignedDate: string
    dueDate: string
    source: 'matching'
  }> = []

  if (userId && role === 'asesor') {
    // Obtener id_asesor del usuario
    const usuario = await prisma.crm_usuarios.findUnique({
      where: { id_usuario: userId },
      select: { id_asesor: true },
    })

    if (!usuario?.id_asesor) {
      return NextResponse.json([])
    }

    const matchings = await prisma.matching.findMany({
      where: { id_asesor: usuario.id_asesor, asignado: true },
      include: {
        bd_leads: {
          select: {
            id_lead: true,
            dni: true,
            nombre: true,
            apellido: true,
            numero: true,
            producto: true,
            estado_de_lead: true,
            scoring: true,
          },
        },
      },
      orderBy: { fecha_asignacion: 'desc' },
    })

    matchingLeads = matchings.map((m) => ({
      id: `m-${m.id_matching}`,
      leadId: m.bd_leads.id_lead,
      dni: m.bd_leads.dni || '',
      name: `${m.bd_leads.nombre || ''} ${m.bd_leads.apellido || ''}`.trim(),
      phone: m.bd_leads.numero || '',
      status: m.bd_leads.estado_de_lead || 'lead',
      product: m.bd_leads.producto || '',
      priority: getPriority(m.bd_leads.scoring),
      taskTitle: 'Gestionar lead',
      taskStatus: m.bd_leads.estado_de_lead === 'venta' || m.bd_leads.estado_de_lead === 'descartado' ? 'completada' : 'pendiente',
      assignedDate: m.fecha_asignacion?.toISOString().split('T')[0] || m.fecha_evaluacion.toISOString().split('T')[0],
      dueDate: '',
      source: 'matching' as const,
    }))
  } else if (!role || role === 'admin' || role === 'Admin') {
    // Admin ve todos los leads asignados via matching
    const matchings = await prisma.matching.findMany({
      where: { asignado: true },
      include: {
        bd_leads: {
          select: {
            id_lead: true,
            dni: true,
            nombre: true,
            apellido: true,
            numero: true,
            producto: true,
            estado_de_lead: true,
            scoring: true,
          },
        },
      },
      orderBy: { fecha_asignacion: 'desc' },
      take: 500,
    })

    matchingLeads = matchings.map((m) => ({
      id: `m-${m.id_matching}`,
      leadId: m.bd_leads.id_lead,
      dni: m.bd_leads.dni || '',
      name: `${m.bd_leads.nombre || ''} ${m.bd_leads.apellido || ''}`.trim(),
      phone: m.bd_leads.numero || '',
      status: m.bd_leads.estado_de_lead || 'lead',
      product: m.bd_leads.producto || '',
      priority: getPriority(m.bd_leads.scoring),
      taskTitle: 'Gestionar lead',
      taskStatus: m.bd_leads.estado_de_lead === 'venta' || m.bd_leads.estado_de_lead === 'descartado' ? 'completada' : 'pendiente',
      assignedDate: m.fecha_asignacion?.toISOString().split('T')[0] || m.fecha_evaluacion.toISOString().split('T')[0],
      dueDate: '',
      source: 'matching' as const,
    }))
  }

  // ---------- Tareas manuales de crm_tareas ----------
  const tareasWhere: Record<string, unknown> = {}
  if (userId && role === 'asesor') {
    tareasWhere.id_usuario_asignado = userId
  }

  const tareas = await prisma.crm_tareas.findMany({
    where: tareasWhere,
    include: {
      bd_leads: {
        select: {
          id_lead: true,
          dni: true,
          nombre: true,
          apellido: true,
          numero: true,
          producto: true,
          estado_de_lead: true,
          scoring: true,
        },
      },
    },
    orderBy: { fecha_creacion: 'desc' },
    take: 200,
  })

  const manualTasks = tareas.map((t) => ({
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
    source: 'manual' as const,
  }))

  // ---------- Combinar y deduplicar por leadId ----------
  const seenLeadIds = new Set<string>()
  const combined = []

  // Prioridad: tareas manuales primero (tienen info mas especifica)
  for (const task of manualTasks) {
    if (!seenLeadIds.has(task.leadId)) {
      seenLeadIds.add(task.leadId)
      combined.push(task)
    }
  }
  for (const task of matchingLeads) {
    if (!seenLeadIds.has(task.leadId)) {
      seenLeadIds.add(task.leadId)
      combined.push(task)
    }
  }

  return NextResponse.json(combined)
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
