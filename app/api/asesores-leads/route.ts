import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSupervisedAsesorIds } from '@/lib/supervisor'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supervisorId = new URL(req.url).searchParams.get('supervisorId')
  const asesorIdsFilter = await getSupervisedAsesorIds(supervisorId)

  if (asesorIdsFilter && asesorIdsFilter.length === 0) {
    return NextResponse.json([])
  }

  // Get all asesores (filtered by supervisor if applicable)
  const asesores = await prisma.bd_asesores.findMany({
    where: asesorIdsFilter ? { id_asesor: { in: asesorIdsFilter } } : undefined,
    select: {
      id_asesor: true,
      nombre_asesor: true,
      cod_asesor: true,
      disponibilidad: true,
      leads_en_cola: true,
    },
    orderBy: { nombre_asesor: 'asc' },
  })

  // For each asesor, get their currently assigned leads (via matching)
  const asesorIds = asesores.map((a) => a.id_asesor)
  const matchings = await prisma.matching.findMany({
    where: { id_asesor: { in: asesorIds }, asignado: true },
    include: {
      bd_leads: {
        select: {
          id_lead: true,
          nombre: true,
          apellido: true,
          producto: true,
          scoring: true,
          numero: true,
          estado_de_lead: true,
        },
      },
    },
    orderBy: { fecha_asignacion: 'desc' },
  })

  // Group leads by asesor
  const leadsByAsesor = new Map<string, Array<{
    idLead: string
    nombre: string
    producto: string
    scoring: number
    telefono: string
    estado: string
    fechaAsignacion: string | null
  }>>()

  for (const m of matchings) {
    if (!leadsByAsesor.has(m.id_asesor)) {
      leadsByAsesor.set(m.id_asesor, [])
    }
    leadsByAsesor.get(m.id_asesor)!.push({
      idLead: m.id_lead,
      nombre: `${m.bd_leads.nombre || ''} ${m.bd_leads.apellido || ''}`.trim() || 'Sin nombre',
      producto: m.bd_leads.producto || '',
      scoring: m.bd_leads.scoring ? Math.round(Number(m.bd_leads.scoring) * 100) : 0,
      telefono: m.bd_leads.numero || '',
      estado: m.bd_leads.estado_de_lead || '',
      fechaAsignacion: m.fecha_asignacion?.toISOString() || null,
    })
  }

  const mapped = asesores.map((a) => ({
    idAsesor: a.id_asesor,
    nombreAsesor: a.nombre_asesor || a.cod_asesor || 'Sin nombre',
    disponibilidad: a.disponibilidad || 'no disponible',
    leadsEnCola: a.leads_en_cola ?? 0,
    leads: leadsByAsesor.get(a.id_asesor) || [],
  }))

  return NextResponse.json(mapped)
}
