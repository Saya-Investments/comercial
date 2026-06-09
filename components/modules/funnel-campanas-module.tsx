'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Bot, UserCheck, ClipboardCheck, Phone,
  FileText, CheckSquare, PenLine, Star,
  ChevronDown, ChevronUp, Eye, MessageSquare,
  Loader2, RefreshCw, Mail, Check, BookOpen,
} from 'lucide-react'
import { LeadDetailModal } from './modals/lead-detail-modal'
import { ConversationModal } from './modals/conversation-modal'

// ── Types ─────────────────────────────────────────────────────────────────────
const STAGE_ORDER = [
  'gestion_bot', 'asignados', 'gestion_asesor', 'contactado',
  'con_proforma', 'proforma_aprobada', 'firma', 'inscrito',
] as const
type Stage = (typeof STAGE_ORDER)[number]

const STAGE_META: Record<Stage, {
  label: string
  short: string
  icon: React.ComponentType<{ className?: string }>
  hex: string
  color: string
  textColor: string
  borderColor: string
}> = {
  gestion_bot:       { label: 'Gestión Bot',      short: 'Bot',         icon: Bot,            hex: '#94a3b8', color: 'bg-slate-400',   textColor: 'text-slate-700',   borderColor: 'border-slate-300' },
  asignados:         { label: 'Asignados',         short: 'Asignados',   icon: UserCheck,      hex: '#38bdf8', color: 'bg-sky-400',     textColor: 'text-sky-700',     borderColor: 'border-sky-300' },
  gestion_asesor:    { label: 'Gestión Asesor',    short: 'Gestión',     icon: ClipboardCheck, hex: '#3b82f6', color: 'bg-blue-500',    textColor: 'text-blue-700',    borderColor: 'border-blue-300' },
  contactado:        { label: 'Contactado',        short: 'Contactado',  icon: Phone,          hex: '#8b5cf6', color: 'bg-violet-500',  textColor: 'text-violet-700',  borderColor: 'border-violet-300' },
  con_proforma:      { label: 'Con Proforma',      short: 'Proforma',    icon: FileText,       hex: '#f59e0b', color: 'bg-amber-500',   textColor: 'text-amber-700',   borderColor: 'border-amber-300' },
  proforma_aprobada: { label: 'Proforma Aprobada', short: 'P. Aprobada', icon: CheckSquare,    hex: '#f97316', color: 'bg-orange-500',  textColor: 'text-orange-700',  borderColor: 'border-orange-300' },
  firma:             { label: 'Firma',             short: 'Firma',       icon: PenLine,        hex: '#14b8a6', color: 'bg-teal-500',    textColor: 'text-teal-700',    borderColor: 'border-teal-300' },
  inscrito:          { label: 'Inscrito',          short: 'Inscrito',    icon: Star,           hex: '#10b981', color: 'bg-emerald-500', textColor: 'text-emerald-700', borderColor: 'border-emerald-300' },
}

type FunnelStage = {
  stage: Stage
  label: string
  count: number
  cumCount: number
}

type Campaign = {
  id: string
  nombre: string
  fechaCreacion: string
  totalLeads: number
  entregados: number
  leidos: number
  respondieron: number
  fallidos: number
  plantillaNombre: string | null
  plantillaContenido: string | null
  stageDistribution: Record<string, number>
  primaryStage: Stage
}

type Lead = {
  id_campana_lead: string
  id_lead: string
  nombre: string | null
  apellido: string | null
  dni: string | null
  numero: string | null
  fecha_creacion: string
  stage: Stage
  estado_envio: string | null
  entregado: boolean
  leido: boolean
  respondio: boolean
}

type ApiResponse = {
  funnel: FunnelStage[]
  campaigns: Campaign[]
  leads?: Lead[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString('es-PE')
const pct = (n: number, d: number) => d > 0 ? `${((n / d) * 100).toFixed(0)}%` : '—'
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })

// ── Sub-components ────────────────────────────────────────────────────────────

function FunnelVisual({
  stages,
  selectedStage,
  onSelect,
}: {
  stages: FunnelStage[]
  selectedStage: Stage | null
  onSelect: (s: Stage) => void
}) {
  const VB_W = 840
  const CENTER_Y = 90
  const MAX_H = 160
  const MIN_H = MAX_H * 0.18
  const LABEL_Y = CENTER_Y + MAX_H / 2 + 22
  const VB_H = LABEL_Y + 14
  const N = stages.length
  const STAGE_W = VB_W / N

  const maxCum = stages[0]?.cumCount ?? 1

  // Cube-root scale keeps small stages visible
  const heights = stages.map(s => {
    const ratio = maxCum > 0 ? s.cumCount / maxCum : 0
    return MIN_H + (MAX_H - MIN_H) * Math.cbrt(ratio)
  })
  // Right-edge of each section = left-edge of next (connected)
  const rightH = [...heights.slice(1), MIN_H * 0.4]

  return (
    <div className="w-full select-none" style={{ minHeight: 180 }}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Shine gradient — lighter top, slightly darker bottom */}
          <linearGradient id="funnel-shine" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="white" stopOpacity="0.40" />
            <stop offset="35%"  stopColor="white" stopOpacity="0.10" />
            <stop offset="100%" stopColor="black" stopOpacity="0.15" />
          </linearGradient>
          {/* Selected stage gets a brighter shine */}
          <linearGradient id="funnel-shine-sel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="white" stopOpacity="0.55" />
            <stop offset="30%"  stopColor="white" stopOpacity="0.15" />
            <stop offset="100%" stopColor="black" stopOpacity="0.10" />
          </linearGradient>
        </defs>

        {stages.map((s, i) => {
          const meta   = STAGE_META[s.stage]
          const isSel  = selectedStage === s.stage
          const x1     = i * STAGE_W + 1
          const x2     = (i + 1) * STAGE_W - 1
          const lH     = heights[i]
          const rH     = rightH[i]
          const midX   = (x1 + x2) / 2

          const pts = [
            `${x1},${CENTER_Y - lH / 2}`,
            `${x2},${CENTER_Y - rH / 2}`,
            `${x2},${CENTER_Y + rH / 2}`,
            `${x1},${CENTER_Y + lH / 2}`,
          ].join(' ')

          return (
            <g
              key={s.stage}
              onClick={() => onSelect(s.stage)}
              style={{ cursor: 'pointer' }}
            >
              <title>{meta.label}: {fmt(s.cumCount)} leads</title>

              {/* Main colored face */}
              <polygon
                points={pts}
                fill={meta.hex}
                opacity={isSel ? 1 : 0.52}
              />

              {/* 3D shine overlay */}
              <polygon
                points={pts}
                fill={`url(#funnel-shine${isSel ? '-sel' : ''})`}
                style={{ pointerEvents: 'none' }}
              />

              {/* Top highlight edge */}
              <line
                x1={x1} y1={CENTER_Y - lH / 2}
                x2={x2} y2={CENTER_Y - rH / 2}
                stroke="white" strokeWidth="1.8" strokeOpacity="0.65"
                style={{ pointerEvents: 'none' }}
              />

              {/* Bottom shadow edge */}
              <line
                x1={x1} y1={CENTER_Y + lH / 2}
                x2={x2} y2={CENTER_Y + rH / 2}
                stroke="black" strokeWidth="1.2" strokeOpacity="0.18"
                style={{ pointerEvents: 'none' }}
              />

              {/* Selected white border */}
              {isSel && (
                <polygon
                  points={pts}
                  fill="none"
                  stroke="white"
                  strokeWidth="2.2"
                  strokeOpacity="0.85"
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Count inside */}
              {s.cumCount > 0 && lH > 30 && (
                <text
                  x={midX}
                  y={CENTER_Y + 5}
                  textAnchor="middle"
                  fill="white"
                  fontSize={lH > 60 ? 13 : 10}
                  fontWeight="700"
                  fontFamily="system-ui, -apple-system, sans-serif"
                  style={{ pointerEvents: 'none' }}
                >
                  {fmt(s.cumCount)}
                </text>
              )}

              {/* Stage number below funnel */}
              <text
                x={midX}
                y={LABEL_Y}
                textAnchor="middle"
                fill={isSel ? meta.hex : '#94a3b8'}
                fontSize="11"
                fontWeight={isSel ? '700' : '400'}
                fontFamily="system-ui, -apple-system, sans-serif"
                style={{ pointerEvents: 'none' }}
              >
                {String(i + 1).padStart(2, '0')}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function StageLegend({ stages, selectedStage }: { stages: FunnelStage[]; selectedStage: Stage | null }) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {stages.map(s => {
        const meta = STAGE_META[s.stage]
        const isSelected = selectedStage === s.stage
        return (
          <div key={s.stage} className={`flex items-center gap-1 text-xs ${isSelected ? meta.textColor + ' font-semibold' : 'text-muted-foreground'}`}>
            <div className={`w-2.5 h-2.5 rounded-sm ${meta.color} ${isSelected ? '' : 'opacity-60'}`} />
            <span>{meta.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function ProgressionBubbles({
  campaign,
  fromStage,
}: {
  campaign: Campaign
  fromStage: Stage
}) {
  const fromIdx = STAGE_ORDER.indexOf(fromStage)
  const laterStages = STAGE_ORDER.slice(fromIdx)

  // Cumulative count: leads at this stage + all higher stages
  const cumCount = (stage: Stage) =>
    STAGE_ORDER.slice(STAGE_ORDER.indexOf(stage))
      .reduce((sum, s) => sum + (campaign.stageDistribution[s] ?? 0), 0)

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {laterStages.map((stage, i) => {
        const count = cumCount(stage)
        const meta = STAGE_META[stage]
        const isCurrent = i === 0

        if (count === 0 && !isCurrent) return null

        return (
          <div key={stage} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted-foreground text-xs">→</span>}
            <div
              className={`
                inline-flex items-center justify-center rounded-full text-xs font-bold
                min-w-[26px] h-[26px] px-1.5
                ${isCurrent
                  ? `${meta.color} text-white shadow-sm`
                  : count > 0
                    ? `bg-slate-100 text-slate-700 border border-slate-200`
                    : `bg-slate-50 text-slate-300 border border-slate-100`
                }
              `}
              title={`${meta.label}: ${count}`}
            >
              {count}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CampaignCard({
  campaign,
  selectedStage,
  isExpanded,
  onToggle,
}: {
  campaign: Campaign
  selectedStage: Stage
  isExpanded: boolean
  onToggle: () => void
}) {
  const meta = STAGE_META[campaign.primaryStage]

  return (
    <button
      onClick={onToggle}
      className={`
        w-full text-left rounded-lg border transition-all duration-150
        ${isExpanded
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30'
        }
      `}
    >
      <div className="flex items-center justify-between p-3 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-2 h-8 rounded-full flex-shrink-0 ${meta.color}`} />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{campaign.nombre}</p>
            <p className="text-xs text-muted-foreground">
              {fmt(campaign.totalLeads)} leads &middot; {fmtDate(campaign.fechaCreacion)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <ProgressionBubbles campaign={campaign} fromStage={selectedStage} />
          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>
    </button>
  )
}

function DeliveryStats({ campaign }: { campaign: Campaign }) {
  const rows = [
    { label: 'Enviados', value: campaign.totalLeads, icon: Mail, color: 'text-slate-500' },
    { label: 'Entregados', value: campaign.entregados, icon: Check, color: 'text-blue-500' },
    { label: 'Leídos', value: campaign.leidos, icon: BookOpen, color: 'text-violet-500' },
    { label: 'Respondieron', value: campaign.respondieron, icon: MessageSquare, color: 'text-emerald-500' },
  ]
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contactabilidad</p>
      <div className="grid grid-cols-2 gap-2">
        {rows.map(r => {
          const Icon = r.icon
          return (
            <div key={r.label} className="flex items-center gap-2 bg-muted/40 rounded-md px-2 py-1.5">
              <Icon className={`w-3.5 h-3.5 ${r.color}`} />
              <div>
                <div className="text-sm font-semibold">{fmt(r.value)}</div>
                <div className="text-xs text-muted-foreground leading-none">
                  {r.label} {r.label !== 'Enviados' ? `(${pct(r.value, campaign.totalLeads)})` : ''}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {campaign.fallidos > 0 && (
        <p className="text-xs text-red-500">{fmt(campaign.fallidos)} fallidos ({pct(campaign.fallidos, campaign.totalLeads)})</p>
      )}
    </div>
  )
}

const PAGE_SIZE = 20

function LeadsTable({
  leads,
  onLeadDetail,
  onConversation,
}: {
  leads: Lead[]
  onLeadDetail: (lead: Lead) => void
  onConversation: (lead: Lead) => void
}) {
  const [page, setPage] = useState(1)
  const totalPages = Math.ceil(leads.length / PAGE_SIZE)
  const paginated = leads.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const stageMeta = (s: Stage) => STAGE_META[s] ?? STAGE_META['gestion_bot']

  const pageButtons = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
    .reduce<(number | string)[]>((acc, p, idx, arr) => {
      if (idx > 0 && (arr[idx - 1] as number) < p - 1) acc.push('...')
      acc.push(p)
      return acc
    }, [])

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">DNI</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Nombre</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Fecha creación</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Etapa actual</th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((lead, i) => {
              const meta = stageMeta(lead.stage)
              return (
                <tr key={lead.id_campana_lead} className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{lead.dni ?? '—'}</td>
                  <td className="px-3 py-2 font-medium">
                    {[lead.nombre, lead.apellido].filter(Boolean).join(' ') || '(sin nombre)'}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(lead.fecha_creacion)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.textColor} border ${meta.borderColor}`}
                      style={{ backgroundColor: 'transparent' }}
                    >
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${meta.color}`} />
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => onLeadDetail(lead)}
                        className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        title="Ver detalle del lead"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onConversation(lead)}
                        className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        title="Ver conversación"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, leads.length)} de {leads.length} leads
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 rounded border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {'<'}
            </button>
            {pageButtons.map((p, i) =>
              p === '...' ? (
                <span key={`e-${i}`} className="px-1">...</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p as number)}
                  className={`w-7 py-1 rounded border text-xs transition-colors ${
                    page === p
                      ? 'bg-primary text-primary-foreground border-primary font-semibold'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  {p}
                </button>
              )
            )}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 py-1 rounded border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {'>'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main module ───────────────────────────────────────────────────────────────
export function FunnelCampanasModule() {
  const [base, setBase] = useState<'Todos' | 'Stock' | 'Caliente'>('Todos')
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null)
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null)
  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [leadsLoading, setLeadsLoading] = useState(false)
  const [modalLead, setModalLead] = useState<Lead | null>(null)
  const [modalType, setModalType] = useState<'detail' | 'conversation' | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setSelectedStage(null)
    setExpandedCampaign(null)
    setLeads(null)
    try {
      const params = base !== 'Todos' ? `?base=${base}` : ''
      const res = await fetch(`/api/funnel-campanas${params}`)
      const json = await res.json()
      setData(json)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [base])

  useEffect(() => { fetchData() }, [fetchData])

  const handleCampaignToggle = async (campaignId: string) => {
    if (expandedCampaign === campaignId) {
      setExpandedCampaign(null)
      setLeads(null)
      return
    }
    setExpandedCampaign(campaignId)
    setLeads(null)
    setLeadsLoading(true)
    try {
      const bParam = base !== 'Todos' ? `&base=${base}` : ''
      const res = await fetch(`/api/funnel-campanas?campanaId=${campaignId}${bParam}`)
      const json = await res.json()
      setLeads(json.leads ?? [])
    } catch (e) {
      console.error(e)
    } finally {
      setLeadsLoading(false)
    }
  }

  const campaignsForStage = selectedStage
    ? (data?.campaigns ?? []).filter(c => {
        const dist = c.stageDistribution
        const stageCount = dist[selectedStage] ?? 0
        // Show campaign if it has at least 1 lead at this stage
        return stageCount > 0
      }).sort((a, b) => (b.stageDistribution[selectedStage] ?? 0) - (a.stageDistribution[selectedStage] ?? 0))
    : []

  return (
    <div className="p-4 md:p-6 h-full overflow-auto">
      <div className="max-w-6xl mx-auto space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Funnel Campañas</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Seguimiento de campañas enviadas · Legacy (Stock) + Estancamiento de funnel
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>

        {/* ── Filtro base ── */}
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Base</p>
          <div className="flex gap-2 flex-wrap">
            {(['Todos', 'Stock', 'Caliente'] as const).map(b => (
              <button
                key={b}
                onClick={() => setBase(b)}
                className={`
                  px-4 py-1.5 rounded-full text-sm font-medium transition-all
                  ${base === b
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }
                `}
              >
                {b === 'Todos' ? 'Todos' : `Base ${b}`}
              </button>
            ))}
          </div>
        </Card>

        {/* ── Funnel visual ── */}
        <Card className="p-4 md:p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Framework del funnel · {base === 'Todos' ? 'Todas las bases' : `Base ${base}`}
            {selectedStage && (
              <span className={`ml-2 ${STAGE_META[selectedStage].textColor} normal-case font-bold`}>
                — {STAGE_META[selectedStage].label} seleccionado
              </span>
            )}
          </p>

          {loading ? (
            <div className="flex items-center justify-center h-28 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" /> Cargando datos…
            </div>
          ) : (
            <>
              <FunnelVisual
                stages={data?.funnel ?? []}
                selectedStage={selectedStage}
                onSelect={(s) => {
                  setSelectedStage(prev => prev === s ? null : s)
                  setExpandedCampaign(null)
                  setLeads(null)
                }}
              />
              <StageLegend stages={data?.funnel ?? []} selectedStage={selectedStage} />
            </>
          )}

          {!loading && selectedStage && (
            <p className="mt-3 text-xs text-muted-foreground">
              Haz click en una campaña para ver el detalle de sus leads
            </p>
          )}
        </Card>

        {/* ── Desplegable de campañas ── */}
        {selectedStage && !loading && (
          <Card className="p-4 md:p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Campañas con leads en &ldquo;{STAGE_META[selectedStage].label}&rdquo;
            </p>

            {campaignsForStage.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                Ninguna campaña tiene leads en esta etapa.
              </p>
            ) : (
              <div className="space-y-2">
                {campaignsForStage.map(camp => (
                  <div key={camp.id}>
                    <CampaignCard
                      campaign={camp}
                      selectedStage={selectedStage}
                      isExpanded={expandedCampaign === camp.id}
                      onToggle={() => handleCampaignToggle(camp.id)}
                    />

                    {/* Expanded: lead table + template/stats */}
                    {expandedCampaign === camp.id && (
                      <div className="mt-2 ml-4 border-l-2 border-primary/20 pl-4">
                        {leadsLoading ? (
                          <div className="flex items-center gap-2 text-muted-foreground py-4">
                            <Loader2 className="w-4 h-4 animate-spin" /> Cargando leads…
                          </div>
                        ) : leads ? (
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            {/* Lead table */}
                            <div className="lg:col-span-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                Leads de la campaña ({leads.length})
                              </p>
                              {leads.length === 0 ? (
                                <p className="text-sm text-muted-foreground italic">Sin leads.</p>
                              ) : (
                                <LeadsTable
                                  leads={leads}
                                  onLeadDetail={(lead) => { setModalLead(lead); setModalType('detail') }}
                                  onConversation={(lead) => { setModalLead(lead); setModalType('conversation') }}
                                />
                              )}
                            </div>

                            {/* Template + contactability */}
                            <div className="space-y-4">
                              <DeliveryStats campaign={camp} />

                              {camp.plantillaContenido && (
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                    Plantilla: {camp.plantillaNombre ?? 'Sin nombre'}
                                  </p>
                                  <div className="bg-muted/40 rounded-md p-3 text-xs text-muted-foreground whitespace-pre-wrap border border-border max-h-48 overflow-y-auto">
                                    {camp.plantillaContenido}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      {/* ── Modals ── */}
      {modalLead && modalType === 'detail' && (
        <LeadDetailModal
          lead={{
            id: modalLead.id_lead,
            dni: modalLead.dni ?? '',
            name: [modalLead.nombre, modalLead.apellido].filter(Boolean).join(' ') || '(sin nombre)',
            phone: modalLead.numero ?? '',
            status: modalLead.stage,
            assignedDate: modalLead.fecha_creacion,
            product: '',
            priority: '',
          }}
          onClose={() => { setModalLead(null); setModalType(null) }}
        />
      )}
      {modalLead && modalType === 'conversation' && (
        <ConversationModal
          lead={{
            id: modalLead.id_lead,
            name: [modalLead.nombre, modalLead.apellido].filter(Boolean).join(' ') || '(sin nombre)',
            phone: modalLead.numero ?? '',
          }}
          onClose={() => { setModalLead(null); setModalType(null) }}
        />
      )}
    </div>
  )
}
