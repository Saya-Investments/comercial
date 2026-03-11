import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const campaign = await prisma.crm_campanas.findUnique({
    where: { id_campana: id },
    include: {
      crm_plantillas: { select: { nombre: true, contenido: true } },
      crm_campana_leads: {
        include: {
          bd_leads: {
            select: {
              id_lead: true,
              nombre: true,
              apellido: true,
              numero: true,
              correo: true,
              zona: true,
              origen_lead: true,
              suborigen_lead: true,
              estado_de_lead: true,
            },
          },
        },
        orderBy: { fecha_creacion: 'desc' },
      },
    },
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
  }

  // Compute real stats from leads
  const leads = campaign.crm_campana_leads
  const stats = {
    total: leads.length,
    pendiente: leads.filter((l) => l.estado_envio === 'pendiente').length,
    enviado: leads.filter((l) => ['accepted', 'enviado'].includes(l.estado_envio || '')).length,
    entregado: leads.filter((l) => l.entregado).length,
    leido: leads.filter((l) => l.leido).length,
    respondido: leads.filter((l) => l.respondio).length,
    fallido: leads.filter((l) => ['failed', 'error'].includes(l.estado_envio || '')).length,
  }

  return NextResponse.json({
    id: campaign.id_campana,
    name: campaign.nombre,
    database: campaign.base_datos || '',
    filters: campaign.filtros || '',
    template: campaign.crm_plantillas?.nombre || '',
    templateContent: campaign.crm_plantillas?.contenido || '',
    templateId: campaign.id_plantilla || '',
    variables: campaign.variables || {},
    status: campaign.estado,
    totalLeads: campaign.total_leads,
    createdDate: campaign.fecha_creacion.toISOString(),
    startDate: campaign.fecha_inicio?.toISOString() || null,
    endDate: campaign.fecha_fin?.toISOString() || null,
    stats,
    leads: leads.map((cl) => ({
      id: cl.id,
      idLead: cl.bd_leads.id_lead,
      nombre: cl.bd_leads.nombre || '',
      apellido: cl.bd_leads.apellido || '',
      numero: cl.bd_leads.numero || '',
      correo: cl.bd_leads.correo || '',
      zona: cl.bd_leads.zona || '',
      origen: cl.bd_leads.origen_lead || '',
      suborigen: cl.bd_leads.suborigen_lead || '',
      estadoLead: cl.bd_leads.estado_de_lead || '',
      estadoEnvio: cl.estado_envio || 'pendiente',
      fechaEnvio: cl.fecha_envio?.toISOString() || null,
      entregado: cl.entregado || false,
      leido: cl.leido || false,
      respondio: cl.respondio || false,
      errorCode: cl.error_code || null,
      errorDescripcion: cl.error_descripcion || null,
    })),
  })
}
