'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Filter,
  Phone,
  FileText,
  FolderCheck,
  ClipboardCheck,
  PenLine,
  UserCheck,
  CreditCard,
  ChevronRight,
  XCircle,
  FileX,
  Ban,
  TrendingDown,
  Users,
  CheckCircle2,
  Loader2,
} from 'lucide-react'

type EstadoChip = {
  nombre: string
  cantidad: number
  parallelGroup?: string // si dos estados son paralelos comparten el mismo grupo
  hint?: string
}

type Etapa = {
  numero: number
  titulo: string
  icon: React.ComponentType<{ className?: string }>
  color: string // tailwind clases tipo bg-/text-/border-
  estados: EstadoChip[]
}

type GrupoTerminal = {
  titulo: string
  descripcion: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  estados: { nombre: string; cantidad: number }[]
}

// Esqueleto del pipeline: titulos, iconos, colores y el orden de los chips.
// Las cantidades arrancan en 0 y se hidratan con /api/prospects-funnel (cruce
// con el excel Prospectos_22, match por telefono y fecha_registro > fecha_creacion
// del lead CRM). Los estados que no aparezcan en el excel quedan en 0 — asi
// conservamos la lectura visual del pipeline completo.
const ETAPAS_ESQUELETO: Etapa[] = [
  {
    numero: 1,
    titulo: 'Contacto',
    icon: Phone,
    color: 'sky',
    estados: [
      { nombre: 'No contactado', cantidad: 0 },
      { nombre: 'Contactado', cantidad: 0 },
    ],
  },
  {
    numero: 2,
    titulo: 'Proforma',
    icon: FileText,
    color: 'indigo',
    estados: [
      { nombre: 'Con proforma', cantidad: 0 },
      { nombre: 'Proforma aprobada', cantidad: 0 },
    ],
  },
  {
    numero: 3,
    titulo: 'Documentación',
    icon: FolderCheck,
    color: 'violet',
    estados: [
      { nombre: 'Documentación EDB', cantidad: 0 },
      { nombre: 'Subsanado', cantidad: 0, hint: 'Reingreso tras observación' },
    ],
  },
  {
    numero: 4,
    titulo: 'Evaluación',
    icon: ClipboardCheck,
    color: 'fuchsia',
    estados: [
      { nombre: 'Enviado a EDB', cantidad: 0 },
      { nombre: 'En evaluación EDB', cantidad: 0 },
      { nombre: 'Aprobado EDB', cantidad: 0 },
      { nombre: 'Enviado a Supervisor', cantidad: 0 },
      { nombre: 'En Oficial de Cumplimiento', cantidad: 0 },
      { nombre: 'Enviado a ADV', cantidad: 0 },
      { nombre: 'En evaluación ADV', cantidad: 0 },
      { nombre: 'En evaluación Riesgo', cantidad: 0, hint: 'Checkpoint común' },
      { nombre: 'Aprobado', cantidad: 0, parallelGroup: 'aprobacion' },
      { nombre: 'Aprobado con observación', cantidad: 0, parallelGroup: 'aprobacion' },
    ],
  },
  {
    numero: 5,
    titulo: 'Firma',
    icon: PenLine,
    color: 'amber',
    estados: [
      { nombre: 'En coordinación', cantidad: 0 },
      { nombre: 'Firmas en Revisión', cantidad: 0 },
      { nombre: 'Firmando', cantidad: 0 },
      { nombre: 'Firmado Parcialmente', cantidad: 0 },
      { nombre: 'Firmado', cantidad: 0 },
    ],
  },
  {
    numero: 6,
    titulo: 'Inscripción',
    icon: UserCheck,
    color: 'lime',
    estados: [
      { nombre: 'Inscrito Parcialmente', cantidad: 0 },
      { nombre: 'Inscrito', cantidad: 0 },
    ],
  },
  {
    numero: 7,
    titulo: 'Pago',
    icon: CreditCard,
    color: 'emerald',
    estados: [
      { nombre: 'Pago parcial', cantidad: 0 },
      { nombre: 'Pago completo', cantidad: 0, hint: 'Cierre exitoso' },
    ],
  },
]

const GRUPOS_TERMINALES_ESQUELETO: GrupoTerminal[] = [
  {
    titulo: 'Rechazos de evaluación',
    descripcion: 'Caídos en validaciones back-office',
    icon: XCircle,
    color: 'rose',
    estados: [
      { nombre: 'Rechazado', cantidad: 0 },
      { nombre: 'Devuelto', cantidad: 0 },
    ],
  },
  {
    titulo: 'Rechazos de firma',
    descripcion: 'Cayeron en la etapa de firma',
    icon: FileX,
    color: 'orange',
    estados: [
      { nombre: 'Firma Rechazada', cantidad: 0 },
      { nombre: 'Firma Cancelada', cantidad: 0 },
      { nombre: 'Firma Expirada', cantidad: 0 },
    ],
  },
  {
    titulo: 'Cierres manuales',
    descripcion: 'Salidas decididas por el asesor',
    icon: Ban,
    color: 'slate',
    estados: [
      { nombre: 'Descartado', cantidad: 0 },
      { nombre: 'Anulado', cantidad: 0 },
    ],
  },
]

function hidratarEtapas(counts: Record<string, number>): Etapa[] {
  return ETAPAS_ESQUELETO.map(e => ({
    ...e,
    estados: e.estados.map(s => ({ ...s, cantidad: counts[s.nombre] ?? 0 })),
  }))
}

function hidratarGrupos(counts: Record<string, number>): GrupoTerminal[] {
  return GRUPOS_TERMINALES_ESQUELETO.map(g => ({
    ...g,
    estados: g.estados.map(s => ({ ...s, cantidad: counts[s.nombre] ?? 0 })),
  }))
}

// Mapas de colores predefinidos para que Tailwind no los purgue
const COLOR_MAP: Record<string, { bg: string; bgSoft: string; text: string; border: string; ring: string; chip: string }> = {
  sky: { bg: 'bg-sky-500', bgSoft: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', ring: 'ring-sky-200', chip: 'bg-sky-100 text-sky-800 border-sky-200' },
  indigo: { bg: 'bg-indigo-500', bgSoft: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', ring: 'ring-indigo-200', chip: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  violet: { bg: 'bg-violet-500', bgSoft: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', ring: 'ring-violet-200', chip: 'bg-violet-100 text-violet-800 border-violet-200' },
  fuchsia: { bg: 'bg-fuchsia-500', bgSoft: 'bg-fuchsia-50', text: 'text-fuchsia-700', border: 'border-fuchsia-200', ring: 'ring-fuchsia-200', chip: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200' },
  amber: { bg: 'bg-amber-500', bgSoft: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', ring: 'ring-amber-200', chip: 'bg-amber-100 text-amber-800 border-amber-200' },
  lime: { bg: 'bg-lime-500', bgSoft: 'bg-lime-50', text: 'text-lime-700', border: 'border-lime-200', ring: 'ring-lime-200', chip: 'bg-lime-100 text-lime-800 border-lime-200' },
  emerald: { bg: 'bg-emerald-500', bgSoft: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', ring: 'ring-emerald-200', chip: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  rose: { bg: 'bg-rose-500', bgSoft: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', ring: 'ring-rose-200', chip: 'bg-rose-100 text-rose-800 border-rose-200' },
  orange: { bg: 'bg-orange-500', bgSoft: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', ring: 'ring-orange-200', chip: 'bg-orange-100 text-orange-800 border-orange-200' },
  slate: { bg: 'bg-slate-500', bgSoft: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', ring: 'ring-slate-200', chip: 'bg-slate-100 text-slate-800 border-slate-200' },
}

type FunnelResponse = {
  counts: Record<string, number>
  totalCruzados: number
  totalLeadsCrm: number
  rango: { desde: string; hastaIso: string }
}

export function ProspectsFunnelModule() {
  const [estadoSeleccionado, setEstadoSeleccionado] = useState<string | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [meta, setMeta] = useState<Pick<FunnelResponse, 'totalCruzados' | 'totalLeadsCrm' | 'rango'> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/prospects-funnel')
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as FunnelResponse
      })
      .then(data => {
        if (cancelled) return
        setCounts(data.counts ?? {})
        setMeta({ totalCruzados: data.totalCruzados, totalLeadsCrm: data.totalLeadsCrm, rango: data.rango })
      })
      .catch(e => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Error cargando funnel')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const etapas = useMemo(() => hidratarEtapas(counts), [counts])
  const grupos = useMemo(() => hidratarGrupos(counts), [counts])

  const totales = useMemo(() => {
    const enPipeline = etapas.reduce((sum, e) => sum + e.estados.reduce((s, x) => s + x.cantidad, 0), 0)
    const exitosos = etapas[6]?.estados.find((e) => e.nombre === 'Pago completo')?.cantidad ?? 0
    const caidos = grupos.reduce((sum, g) => sum + g.estados.reduce((s, x) => s + x.cantidad, 0), 0)
    return { total: enPipeline + caidos, enPipeline, exitosos, caidos }
  }, [etapas, grupos])

  const totalEtapa = (etapa: Etapa) => etapa.estados.reduce((s, x) => s + x.cantidad, 0)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-background border-b border-border p-4 md:p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Filter className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Funnel de Prospectos</h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Vista de pipeline back-office: dónde se queda cada prospecto en su gestión
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="max-w-[1400px] mx-auto space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <KpiCard
              label="Total prospectos"
              value={totales.total}
              icon={Users}
              accent="text-foreground"
              accentBg="bg-muted"
            />
            <KpiCard
              label="En pipeline"
              value={totales.enPipeline}
              icon={ClipboardCheck}
              accent="text-indigo-600"
              accentBg="bg-indigo-50"
            />
            <KpiCard
              label="Cerrados con éxito"
              value={totales.exitosos}
              icon={CheckCircle2}
              accent="text-emerald-600"
              accentBg="bg-emerald-50"
            />
            <KpiCard
              label="Caídos"
              value={totales.caidos}
              icon={TrendingDown}
              accent="text-rose-600"
              accentBg="bg-rose-50"
            />
          </div>

          {/* Pipeline */}
          <Card className="p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Pipeline activo</h2>
                <p className="text-xs text-muted-foreground">7 etapas secuenciales · clic en un estado para resaltarlo</p>
              </div>
              {estadoSeleccionado && (
                <button
                  onClick={() => setEstadoSeleccionado(null)}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Limpiar selección
                </button>
              )}
            </div>

            <div className="overflow-x-auto pb-2">
              <div className="flex items-stretch gap-2 min-w-max">
                {etapas.map((etapa, i) => (
                  <div key={etapa.numero} className="flex items-stretch gap-2">
                    {i > 0 && (
                      <div className="flex items-center">
                        <ChevronRight className="w-5 h-5 text-muted-foreground/50" />
                      </div>
                    )}
                    <EtapaColumn
                      etapa={etapa}
                      total={totalEtapa(etapa)}
                      estadoSeleccionado={estadoSeleccionado}
                      onSelect={setEstadoSeleccionado}
                    />
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Estados terminales */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold text-foreground">Salidas del funnel</h2>
              <span className="text-xs text-muted-foreground">(no avanzan)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {grupos.map((grupo) => (
                <GrupoTerminalCard
                  key={grupo.titulo}
                  grupo={grupo}
                  estadoSeleccionado={estadoSeleccionado}
                  onSelect={setEstadoSeleccionado}
                />
              ))}
            </div>
          </div>

          {/* Metadata del cruce */}
          <div className="text-xs text-muted-foreground italic text-center pt-2">
            {loading ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Cargando cruce con Prospectos_22…
              </span>
            ) : error ? (
              <span className="text-rose-600">Error cargando el funnel: {error}</span>
            ) : meta ? (
              <>
                Cruce Prospectos_22 · {meta.totalCruzados.toLocaleString('es-PE')} de{' '}
                {meta.totalLeadsCrm.toLocaleString('es-PE')} leads CRM con match (tel + Fecha Registro &gt; fecha de creación) ·
                rango desde {new Date(meta.rango.desde).toLocaleDateString('es-PE')} hasta hoy
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

// ====================== Subcomponentes ======================

function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
  accentBg,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  accent: string
  accentBg: string
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accentBg}`}>
          <Icon className={`w-5 h-5 ${accent}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-2xl font-bold ${accent}`}>{value}</p>
        </div>
      </div>
    </Card>
  )
}

function EtapaColumn({
  etapa,
  total,
  estadoSeleccionado,
  onSelect,
}: {
  etapa: Etapa
  total: number
  estadoSeleccionado: string | null
  onSelect: (s: string | null) => void
}) {
  const c = COLOR_MAP[etapa.color]
  const Icon = etapa.icon

  // Agrupar estados paralelos lado a lado
  const filas: EstadoChip[][] = []
  const grupos: Record<string, EstadoChip[]> = {}
  etapa.estados.forEach((est) => {
    if (est.parallelGroup) {
      if (!grupos[est.parallelGroup]) {
        grupos[est.parallelGroup] = []
        filas.push(grupos[est.parallelGroup])
      }
      grupos[est.parallelGroup].push(est)
    } else {
      filas.push([est])
    }
  })

  return (
    <div className={`w-44 md:w-48 rounded-lg border ${c.border} ${c.bgSoft} flex flex-col`}>
      {/* Cabecera de etapa */}
      <div className={`px-3 py-2.5 border-b ${c.border} flex items-center gap-2`}>
        <div className={`w-7 h-7 rounded-md ${c.bg} flex items-center justify-center`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">Etapa {etapa.numero}</p>
          <p className={`text-sm font-semibold ${c.text} leading-tight truncate`}>{etapa.titulo}</p>
        </div>
      </div>

      {/* Total etapa */}
      <div className="px-3 py-2 border-b border-dashed border-muted">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</span>
          <span className={`text-xl font-bold ${c.text}`}>{total}</span>
        </div>
      </div>

      {/* Chips de estados */}
      <div className="p-2 space-y-1.5 flex-1">
        {filas.map((fila, idx) => (
          <div key={idx} className={fila.length > 1 ? 'flex gap-1' : ''}>
            {fila.map((est) => {
              const isSelected = estadoSeleccionado === est.nombre
              const isDimmed = estadoSeleccionado !== null && !isSelected
              return (
                <button
                  key={est.nombre}
                  onClick={() => onSelect(isSelected ? null : est.nombre)}
                  className={`group relative w-full text-left rounded-md border px-2 py-1.5 transition-all ${c.chip} ${
                    isSelected ? `ring-2 ${c.ring} shadow-sm` : ''
                  } ${isDimmed ? 'opacity-40' : 'hover:shadow-sm'}`}
                  title={est.hint}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-medium leading-tight truncate">{est.nombre}</span>
                    <span className="text-xs font-bold tabular-nums">{est.cantidad}</span>
                  </div>
                  {est.hint && (
                    <span className="text-[9px] text-muted-foreground italic leading-tight block mt-0.5 truncate">
                      {est.hint}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
        {/* Indicador de "paralelos" */}
        {filas.some((f) => f.length > 1) && (
          <p className="text-[9px] text-muted-foreground italic text-center pt-1">↔ paralelos</p>
        )}
      </div>
    </div>
  )
}

function GrupoTerminalCard({
  grupo,
  estadoSeleccionado,
  onSelect,
}: {
  grupo: GrupoTerminal
  estadoSeleccionado: string | null
  onSelect: (s: string | null) => void
}) {
  const c = COLOR_MAP[grupo.color]
  const Icon = grupo.icon
  const total = grupo.estados.reduce((s, x) => s + x.cantidad, 0)

  return (
    <Card className={`p-4 border ${c.border}`}>
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-9 h-9 rounded-lg ${c.bgSoft} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${c.text}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground truncate">{grupo.titulo}</h3>
            <Badge variant="outline" className={`${c.text} ${c.border}`}>{total}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{grupo.descripcion}</p>
        </div>
      </div>
      <div className="space-y-1.5">
        {grupo.estados.map((est) => {
          const isSelected = estadoSeleccionado === est.nombre
          const isDimmed = estadoSeleccionado !== null && !isSelected
          return (
            <button
              key={est.nombre}
              onClick={() => onSelect(isSelected ? null : est.nombre)}
              className={`w-full flex items-center justify-between rounded-md border px-2.5 py-1.5 transition-all ${c.chip} ${
                isSelected ? `ring-2 ${c.ring} shadow-sm` : ''
              } ${isDimmed ? 'opacity-40' : 'hover:shadow-sm'}`}
            >
              <span className="text-xs font-medium">{est.nombre}</span>
              <span className="text-xs font-bold tabular-nums">{est.cantidad}</span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}
