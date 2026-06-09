import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export const STAGE_ORDER = [
  'gestion_bot',
  'asignados',
  'gestion_asesor',
  'contactado',
  'con_proforma',
  'proforma_aprobada',
  'firma',
  'inscrito',
] as const

export type Stage = (typeof STAGE_ORDER)[number]

export const STAGE_LABELS: Record<Stage, string> = {
  gestion_bot:      'Gestión Bot',
  asignados:        'Asignados',
  gestion_asesor:   'Gestión Asesor',
  contactado:       'Contactado',
  con_proforma:     'Con Proforma',
  proforma_aprobada:'Proforma Aprobada',
  firma:            'Firma',
  inscrito:         'Inscrito',
}

// The CASE WHEN that maps each lead to its current (highest) stage.
// Used in both the summary query and the lead-detail query.
const STAGE_CASE = `
  CASE
    WHEN nsv.estado_documento IN ('Inscrito', 'Inscrito Parcialmente')
      THEN 'inscrito'
    WHEN nsv.estado_documento IN (
      'En coordinación','Firmas en Revisión','Firmando',
      'Firmado Parcialmente','Firmado',
      'Firma Rechazada','Firma Cancelada','Firma Expirada'
    ) THEN 'firma'
    WHEN nsv.estado_documento IN (
      'Proforma aprobada',
      'Pago parcial','Pago completo',
      'Documentación EDB','Subsanado',
      'Enviado a EDB','En evaluación EDB','Aprobado EDB',
      'Enviado a Supervisor','En Oficial de Cumplimiento','Enviado a ADV',
      'En evaluación ADV','En evaluación Riesgo',
      'Aprobado','Aprobado con observación',
      'Rechazado','Devuelto'
    ) THEN 'proforma_aprobada'
    WHEN nsv.estado_documento = 'Con proforma'
      THEN 'con_proforma'
    WHEN last_ac.estado_asesor = 'Contactado'
      THEN 'contactado'
    WHEN ac_cnt.cnt > 0
      THEN 'gestion_asesor'
    WHEN l.ultimo_asesor_asignado IS NOT NULL OR l.asignado_call_center IS NOT NULL
      THEN 'asignados'
    ELSE 'gestion_bot'
  END
`

// Shared LATERAL JOINs for NSV + CRM actions
const LATERAL_JOINS = `
  LEFT JOIN LATERAL (
    SELECT np.estado_documento
    FROM comercial.nsv_prospectos np
    WHERE np.telefono_norm = RIGHT(
            REGEXP_REPLACE(COALESCE(l.numero,''), '[^0-9]','','g'), 9)
      AND np.fecha_registro > l.fecha_creacion
    ORDER BY np.fecha_registro DESC
    LIMIT 1
  ) nsv ON true
  LEFT JOIN LATERAL (
    SELECT a.estado_asesor
    FROM comercial.crm_acciones_comerciales a
    WHERE a.id_lead = l.id_lead
    ORDER BY a.fecha_creacion DESC
    LIMIT 1
  ) last_ac ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS cnt
    FROM comercial.crm_acciones_comerciales a
    WHERE a.id_lead = l.id_lead
  ) ac_cnt ON true
`

type CampaignRow = {
  id_campana: string
  nombre: string
  fecha_creacion: Date
  total_leads: number
  entregados: number
  leidos: number
  respondieron: number
  fallidos: number
  plantilla_nombre: string | null
  plantilla_contenido: string | null
}

type StageDistRow = {
  id_campana: string
  stage: string
  total: number
}

type LeadRow = {
  id_campana_lead: string
  id_lead: string
  nombre: string | null
  apellido: string | null
  dni: string | null
  numero: string | null
  fecha_creacion: Date
  stage: string
  estado_envio: string | null
  entregado: boolean
  leido: boolean
  respondio: boolean
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const base = url.searchParams.get('base') // 'Stock' | 'Caliente' | null
  const campanaId = url.searchParams.get('campanaId') // lead detail mode

  const baseWhere =
    base === 'Stock' || base === 'Caliente'
      ? `AND l."Base" = '${base}'`
      : ''

  // ── 1. Campaign list + delivery stats ─────────────────────────────────────
  const campaigns = await prisma.$queryRawUnsafe<CampaignRow[]>(`
    SELECT
      c.id_campana::text,
      c.nombre,
      c.fecha_creacion,
      COUNT(DISTINCT cl.id_lead)::int AS total_leads,
      COUNT(*) FILTER (WHERE cl.entregado)::int AS entregados,
      COUNT(*) FILTER (WHERE cl.leido)::int AS leidos,
      COUNT(*) FILTER (WHERE cl.respondio)::int AS respondieron,
      COUNT(*) FILTER (WHERE cl.failed_at IS NOT NULL)::int AS fallidos,
      p.nombre AS plantilla_nombre,
      p.contenido AS plantilla_contenido
    FROM comercial.crm_campanas c
    LEFT JOIN comercial.crm_campana_leads cl ON cl.id_campana = c.id_campana
    LEFT JOIN comercial.bd_leads l ON l.id_lead = cl.id_lead
    LEFT JOIN comercial.crm_plantillas p ON p.id_plantilla = c.id_plantilla
    WHERE c.estado = 'Enviada'
      ${baseWhere}
    GROUP BY c.id_campana, p.nombre, p.contenido
    ORDER BY c.fecha_creacion DESC
  `)

  // ── 2. Stage distribution per campaign ────────────────────────────────────
  const stageDist = await prisma.$queryRawUnsafe<StageDistRow[]>(`
    WITH lead_stages AS (
      SELECT
        cl.id_campana::text AS id_campana,
        ${STAGE_CASE} AS stage
      FROM comercial.crm_campana_leads cl
      JOIN comercial.crm_campanas c ON c.id_campana = cl.id_campana
      JOIN comercial.bd_leads l ON l.id_lead = cl.id_lead
      ${LATERAL_JOINS}
      WHERE c.estado = 'Enviada'
        ${baseWhere}
    )
    SELECT id_campana, stage, COUNT(*)::int AS total
    FROM lead_stages
    GROUP BY id_campana, stage
    ORDER BY id_campana, stage
  `)

  // ── 3. Build per-campaign stage map ──────────────────────────────────────
  const stageMap: Record<string, Record<string, number>> = {}
  for (const row of stageDist) {
    if (!stageMap[row.id_campana]) stageMap[row.id_campana] = {}
    stageMap[row.id_campana][row.stage] = Number(row.total)
  }

  // ── 4. Overall cumulative funnel (sum across all campaigns) ───────────────
  const overallPerStage: Record<string, number> = {}
  for (const dist of Object.values(stageMap)) {
    for (const [stage, cnt] of Object.entries(dist)) {
      overallPerStage[stage] = (overallPerStage[stage] ?? 0) + cnt
    }
  }

  // Cumulative: stage N includes all leads at stage N and above
  const cumulativeFunnel = STAGE_ORDER.map((stage, idx) => {
    const higherStages = STAGE_ORDER.slice(idx)
    const cum = higherStages.reduce((s, st) => s + (overallPerStage[st] ?? 0), 0)
    return {
      stage,
      label: STAGE_LABELS[stage],
      count: overallPerStage[stage] ?? 0,
      cumCount: cum,
    }
  })

  // ── 5. Enrich campaigns ───────────────────────────────────────────────────
  const stageIdx: Record<string, number> = {}
  STAGE_ORDER.forEach((s, i) => { stageIdx[s] = i })

  const enrichedCampaigns = campaigns.map(c => {
    const dist = stageMap[c.id_campana] ?? {}
    // Primary stage = stage with most leads (excluding gestion_bot as fallback)
    let primary: Stage = 'gestion_bot'
    let maxCnt = -1
    for (const [stage, cnt] of Object.entries(dist)) {
      if (cnt > maxCnt) { maxCnt = cnt; primary = stage as Stage }
    }
    return {
      id: c.id_campana,
      nombre: c.nombre,
      fechaCreacion: c.fecha_creacion,
      totalLeads: Number(c.total_leads),
      entregados: Number(c.entregados),
      leidos: Number(c.leidos),
      respondieron: Number(c.respondieron),
      fallidos: Number(c.fallidos),
      plantillaNombre: c.plantilla_nombre,
      plantillaContenido: c.plantilla_contenido,
      stageDistribution: dist,
      primaryStage: primary,
    }
  })

  // ── 6. Lead details (only when campanaId is provided) ─────────────────────
  let leads: object[] | null = null
  if (campanaId) {
    leads = await prisma.$queryRawUnsafe<LeadRow[]>(`
      SELECT
        cl.id::text AS id_campana_lead,
        l.id_lead::text,
        l.nombre,
        l.apellido,
        l.dni,
        l.numero,
        l.fecha_creacion,
        ${STAGE_CASE} AS stage,
        cl.estado_envio,
        cl.entregado,
        cl.leido,
        cl.respondio
      FROM comercial.crm_campana_leads cl
      JOIN comercial.bd_leads l ON l.id_lead = cl.id_lead
      ${LATERAL_JOINS}
      WHERE cl.id_campana = '${campanaId}'
        ${baseWhere}
      ORDER BY l.nombre NULLS LAST
    `)
  }

  return NextResponse.json({
    funnel: cumulativeFunnel,
    campaigns: enrichedCampaigns,
    ...(leads !== null ? { leads } : {}),
  })
}
