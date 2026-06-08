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

  // Cruce con nsv_prospectos para obtener estado funnel por teléfono
  const phones9 = leads
    .map((cl) => (cl.bd_leads.numero || '').replace(/\D/g, '').slice(-9))
    .filter((p) => p.length === 9)

  type NsvRow = { phone9: string; estado_documento: string | null }
  let nsvByPhone = new Map<string, string | null>()
  if (phones9.length > 0) {
    try {
      const nsvRows = await prisma.$queryRaw<NsvRow[]>`
        SELECT telefono_norm AS phone9, estado_documento
        FROM comercial.nsv_prospectos
        WHERE telefono_norm = ANY(${phones9}::text[])
      `
      nsvByPhone = new Map(nsvRows.map((r) => [r.phone9, r.estado_documento]))
    } catch { /* si falla, leads cargan sin estado funnel */ }
  }

  const funnelCounts: Record<string, number> = {}
  for (const [, estado] of nsvByPhone) {
    if (estado) funnelCounts[estado] = (funnelCounts[estado] || 0) + 1
  }

  // Bot funnel stats: En Gestión → Asignados → Gestionados → Prospectos
  const leadIdsList = leads.map((cl) => cl.bd_leads.id_lead)
  let gestionadosSet = new Set<string>()
  if (leadIdsList.length > 0) {
    try {
      const gRes = await prisma.$queryRaw<{ id_lead: string }[]>`
        SELECT DISTINCT id_lead::text AS id_lead
        FROM comercial.crm_acciones_comerciales
        WHERE id_lead = ANY(${leadIdsList}::uuid[])
      `
      gestionadosSet = new Set(gRes.map((r) => r.id_lead))
    } catch { /* skip */ }
  }
  const gestionadosCount = gestionadosSet.size
  const estadoCounts = leads.reduce((acc, cl) => {
    const e = cl.bd_leads.estado_de_lead || 'lead'
    acc[e] = (acc[e] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const botFunnel = {
    total: leads.length,
    enGestion: (estadoCounts['en_gestion'] || 0) + (estadoCounts['asignado'] || 0),
    asignados: estadoCounts['asignado'] || 0,
    descartados: estadoCounts['descartado'] || 0,
    gestionados: gestionadosCount,
    prospectos: Object.values(funnelCounts).reduce((s, n) => s + n, 0),
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
    funnelCounts,
    botFunnel,
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
      estadoFunnel: nsvByPhone.get((cl.bd_leads.numero || '').replace(/\D/g, '').slice(-9)) ?? null,
      tieneAccion: gestionadosSet.has(cl.bd_leads.id_lead),
    })),
  })
}
