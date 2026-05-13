'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LeadDetailModal } from './modals/lead-detail-modal'
import { ActionModal } from './modals/action-modal'
import { ConversationModal } from './modals/conversation-modal'
import {
  TrendingUp,
  CheckCircle2,
  TrendingDown,
  Users,
  Loader2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  MessageSquare,
  Eye,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ProspectRow {
  id_lead: string
  dni: string | null
  numero: string | null
  nombre: string | null
  apellido: string | null
  base: string | null
  fecha_creacion: string
  fecha_registro_prosp: string | null
  asesor: string | null
  vendedor_nsv: string | null
  estado: string
}

interface ApiResponse {
  leads: ProspectRow[]
  counts: Record<string, number>
  totalCruzados: number
  totalLeadsCrm: number
  mesesDisponibles: string[]
  mes: string | null
}

type ModalType = 'detail' | 'action' | 'conversation' | null

// ─── Mapeo de estados → etapa + color ────────────────────────────────────────

type ColorKey =
  | 'sky' | 'indigo' | 'emerald' | 'violet' | 'fuchsia'
  | 'amber' | 'lime' | 'rose' | 'orange' | 'slate'

const ESTADO_META: Record<string, { etapa: string; color: ColorKey }> = {
  'No contactado':              { etapa: 'Contacto',      color: 'sky' },
  'Contactado':                 { etapa: 'Contacto',      color: 'sky' },
  'Con proforma':               { etapa: 'Proforma',      color: 'indigo' },
  'Proforma aprobada':          { etapa: 'Proforma',      color: 'indigo' },
  'Pago parcial':               { etapa: 'Pago',          color: 'emerald' },
  'Pago completo':              { etapa: 'Pago',          color: 'emerald' },
  'Documentación EDB':          { etapa: 'Documentación', color: 'violet' },
  'Subsanado':                  { etapa: 'Documentación', color: 'violet' },
  'Enviado a EDB':              { etapa: 'Evaluación',    color: 'fuchsia' },
  'En evaluación EDB':          { etapa: 'Evaluación',    color: 'fuchsia' },
  'Aprobado EDB':               { etapa: 'Evaluación',    color: 'fuchsia' },
  'Enviado a Supervisor':       { etapa: 'Evaluación',    color: 'fuchsia' },
  'En Oficial de Cumplimiento': { etapa: 'Evaluación',    color: 'fuchsia' },
  'Enviado a ADV':              { etapa: 'Evaluación',    color: 'fuchsia' },
  'En evaluación ADV':          { etapa: 'Evaluación',    color: 'fuchsia' },
  'En evaluación Riesgo':       { etapa: 'Evaluación',    color: 'fuchsia' },
  'Aprobado':                   { etapa: 'Evaluación',    color: 'fuchsia' },
  'Aprobado con observación':   { etapa: 'Evaluación',    color: 'fuchsia' },
  'En coordinación':            { etapa: 'Firma',         color: 'amber' },
  'Firmas en Revisión':         { etapa: 'Firma',         color: 'amber' },
  'Firmando':                   { etapa: 'Firma',         color: 'amber' },
  'Firmado Parcialmente':       { etapa: 'Firma',         color: 'amber' },
  'Firmado':                    { etapa: 'Firma',         color: 'amber' },
  'Inscrito Parcialmente':      { etapa: 'Inscripción',   color: 'lime' },
  'Inscrito':                   { etapa: 'Inscripción',   color: 'lime' },
  'Rechazado':                  { etapa: 'Rechazado',     color: 'rose' },
  'Devuelto':                   { etapa: 'Rechazado',     color: 'rose' },
  'Firma Rechazada':            { etapa: 'Firma caída',   color: 'orange' },
  'Firma Cancelada':            { etapa: 'Firma caída',   color: 'orange' },
  'Firma Expirada':             { etapa: 'Firma caída',   color: 'orange' },
  'Descartado':                 { etapa: 'Cerrado',       color: 'slate' },
  'Anulado':                    { etapa: 'Cerrado',       color: 'slate' },
}

const ESTADOS_EXITOSOS = new Set(['Inscrito'])
const ESTADOS_CAIDOS = new Set([
  'Rechazado', 'Devuelto', 'Firma Rechazada', 'Firma Cancelada',
  'Firma Expirada', 'Descartado', 'Anulado',
])

const COLOR_CLASSES: Record<ColorKey, { bg: string; text: string; border: string }> = {
  sky:     { bg: 'bg-sky-100',     text: 'text-sky-700',     border: 'border-sky-200' },
  indigo:  { bg: 'bg-indigo-100',  text: 'text-indigo-700',  border: 'border-indigo-200' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
  violet:  { bg: 'bg-violet-100',  text: 'text-violet-700',  border: 'border-violet-200' },
  fuchsia: { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700', border: 'border-fuchsia-200' },
  amber:   { bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200' },
  lime:    { bg: 'bg-lime-100',    text: 'text-lime-700',    border: 'border-lime-200' },
  rose:    { bg: 'bg-rose-100',    text: 'text-rose-700',    border: 'border-rose-200' },
  orange:  { bg: 'bg-orange-100',  text: 'text-orange-700',  border: 'border-orange-200' },
  slate:   { bg: 'bg-slate-100',   text: 'text-slate-600',   border: 'border-slate-200' },
}

const PAGE_SIZE = 15

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Lima',
  })
}

function diasDesde(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function mesLabel(mes: string): string {
  const [y, m] = mes.split('-')
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })
}

function toLeadShape(row: ProspectRow) {
  return {
    id: row.id_lead,
    dni: row.dni ?? '',
    name: [row.nombre, row.apellido].filter(Boolean).join(' '),
    phone: row.numero ?? '',
    status: row.estado,
    assignedDate: row.fecha_creacion,
    product: row.base ?? '',
    priority: '',
  }
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function EstadoChip({ estado }: { estado: string }) {
  const meta = ESTADO_META[estado]
  if (!meta) {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
        {estado}
      </span>
    )
  }
  const c = COLOR_CLASSES[meta.color]
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text} border ${c.border}`}>
      {estado}
    </span>
  )
}

function KpiCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string
  value: number
  sub?: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}) {
  return (
    <Card className="p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </Card>
  )
}

// ─── Módulo principal ─────────────────────────────────────────────────────────

export function MyProspectsModule() {
  const { user } = useAuth()
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [mesSeleccionado, setMesSeleccionado] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [selectedLead, setSelectedLead] = useState<ProspectRow | null>(null)
  const [modalType, setModalType] = useState<ModalType>(null)

  const fetchData = () => {
    if (!user?.id) return
    setLoading(true)
    const url = new URL('/api/my-prospects', window.location.origin)
    url.searchParams.set('userId', user.id)
    if (mesSeleccionado) url.searchParams.set('mes', mesSeleccionado)
    fetch(url.toString())
      .then(r => r.json())
      .then((d: ApiResponse) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, mesSeleccionado])

  // Reset page when filter changes
  useEffect(() => { setCurrentPage(0) }, [mesSeleccionado])

  const { enPipeline, exitosos, caidos } = useMemo(() => {
    if (!data) return { enPipeline: 0, exitosos: 0, caidos: 0 }
    let pip = 0, ex = 0, ca = 0
    for (const lead of data.leads) {
      if (ESTADOS_EXITOSOS.has(lead.estado)) ex++
      else if (ESTADOS_CAIDOS.has(lead.estado)) ca++
      else pip++
    }
    return { enPipeline: pip, exitosos: ex, caidos: ca }
  }, [data])

  const leads = data?.leads ?? []
  const mesesDisponibles = data?.mesesDisponibles ?? []
  const totalPages = Math.max(1, Math.ceil(leads.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages - 1)
  const pagedLeads = leads.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const openModal = (lead: ProspectRow, type: ModalType, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setSelectedLead(lead)
    setModalType(type)
  }

  const closeModal = () => {
    setSelectedLead(null)
    setModalType(null)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-background border-b border-border p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Mis Prospectos en NSV</h1>
            <p className="text-muted-foreground mt-1">
              Leads tuyos que ya están en el pipeline de back-office
            </p>
          </div>

          {mesesDisponibles.length > 0 && (
            <div className="relative">
              <div className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg bg-background hover:bg-muted/50 transition-colors">
                <select
                  value={mesSeleccionado ?? ''}
                  onChange={e => setMesSeleccionado(e.target.value || null)}
                  className="appearance-none bg-transparent text-sm font-medium text-foreground pr-6 focus:outline-none cursor-pointer"
                >
                  <option value="">Todos los meses</option>
                  {mesesDisponibles.map(m => (
                    <option key={m} value={m}>{mesLabel(m)}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-muted-foreground pointer-events-none absolute right-3" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Cargando prospectos...
          </div>
        ) : !data || leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <Users className="w-10 h-10 mb-3 opacity-40" />
            <p className="font-medium">Ningún lead tuyo está en NSV aún</p>
            <p className="text-sm mt-1">Cuando tus leads lleguen al back-office aparecerán aquí</p>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Total en NSV" value={data.totalCruzados} sub="leads cruzados" icon={Users} color="bg-primary" />
              <KpiCard label="En Pipeline" value={enPipeline} sub="avanzando" icon={TrendingUp} color="bg-sky-500" />
              <KpiCard label="Inscritos" value={exitosos} sub="cierre exitoso" icon={CheckCircle2} color="bg-lime-500" />
              <KpiCard label="Caídos" value={caidos} sub="salieron del funnel" icon={TrendingDown} color="bg-rose-500" />
            </div>

            {/* Tabla */}
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Cliente</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Teléfono</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Estado NSV</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Ingresó a NSV</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Días en etapa</th>
                      <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pagedLeads.map(lead => {
                      const dias = diasDesde(lead.fecha_registro_prosp)
                      const nombre = [lead.nombre, lead.apellido].filter(Boolean).join(' ') || '—'
                      return (
                        <tr
                          key={lead.id_lead}
                          className="hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={e => openModal(lead, 'detail', e)}
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-foreground">{nombre}</div>
                            {lead.dni && (
                              <div className="text-xs text-muted-foreground">DNI {lead.dni}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                            {lead.numero ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            <EstadoChip estado={lead.estado} />
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDate(lead.fecha_registro_prosp)}
                          </td>
                          <td className="px-4 py-3">
                            {dias !== null ? (
                              <span className={`font-semibold ${dias > 30 ? 'text-rose-600' : dias > 14 ? 'text-amber-600' : 'text-foreground'}`}>
                                {dias}d
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Acción comercial"
                                onClick={e => openModal(lead, 'action', e)}
                                className="text-foreground hover:bg-secondary"
                              >
                                <Briefcase className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Ver conversación"
                                onClick={e => openModal(lead, 'conversation', e)}
                                className="text-foreground hover:bg-secondary"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Ver detalle"
                                onClick={e => openModal(lead, 'detail', e)}
                                className="text-foreground hover:bg-secondary"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Paginación */}
            {leads.length > PAGE_SIZE && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Mostrando {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, leads.length)} de {leads.length} prospectos
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={safePage === 0}
                    onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Página {safePage + 1} / {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={safePage >= totalPages - 1}
                    onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modales */}
      {selectedLead && modalType === 'detail' && (
        <LeadDetailModal
          lead={toLeadShape(selectedLead)}
          onClose={closeModal}
        />
      )}
      {selectedLead && modalType === 'action' && (
        <ActionModal
          lead={{
            id: selectedLead.id_lead,
            name: [selectedLead.nombre, selectedLead.apellido].filter(Boolean).join(' '),
            phone: selectedLead.numero ?? '',
            dni: selectedLead.dni ?? '',
          }}
          onClose={closeModal}
          onActionSaved={() => { closeModal(); fetchData() }}
        />
      )}
      {selectedLead && modalType === 'conversation' && (
        <ConversationModal
          lead={{
            id: selectedLead.id_lead,
            name: [selectedLead.nombre, selectedLead.apellido].filter(Boolean).join(' '),
            phone: selectedLead.numero ?? '',
          }}
          onClose={closeModal}
        />
      )}
    </div>
  )
}
