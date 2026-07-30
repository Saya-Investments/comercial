'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw, Flame, CheckCircle2, Clock, TrendingUp, Info, Eye } from 'lucide-react'
import { ETIQUETA_ESCALON, type EscalonTibia } from '@/lib/tibia-constants'
import { LeadDetailModal } from './modals/lead-detail-modal'

type Lead = {
  idLead: string
  nombre: string | null
  numero: string | null
  dni: string | null
  fechaCreacion: string | null
  escalon: string
  ola: number
  asesor: string | null
  accionesPost: number
  primeraPost: string | null
  ultimaAccion: string | null
  ultimoEstado: string | null
  estadoInicial: string | null
}

type PorAsesor = { asesor: string; asignados: number; gestionados: number; acciones: number }

type ApiResponse = {
  live: string
  resumen: {
    priorizados: number
    gestionados: number
    pendientes: number
    acciones: number
    control: { leads: number; gestionados: number }
  }
  porAsesor: PorAsesor[]
  leads: Lead[]
  olas: { escalon: string; ola: number; activo: boolean; n: number }[]
}

const fmt = (n: number) => n.toLocaleString('es-PE')
const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0)
const pctTxt = (n: number, d: number) => (d > 0 ? `${pct(n, d).toFixed(0)}%` : '—')

const fmtFechaHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('es-PE', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

const fmtFecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

const diasDesde = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}

function Kpi({
  icon: Icon,
  label,
  value,
  detalle,
  tono = 'neutro',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  detalle?: string
  tono?: 'neutro' | 'bueno' | 'alerta' | 'destacado'
}) {
  const tonos = {
    neutro: 'bg-secondary text-foreground',
    bueno: 'bg-emerald-100 text-emerald-700',
    alerta: 'bg-amber-100 text-amber-700',
    destacado: 'bg-blue-100 text-blue-700',
  }
  return (
    <Card className="flex items-start gap-3 p-4">
      <div className={`rounded-lg p-2 ${tonos[tono]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-2xl font-bold leading-none text-foreground">{value}</p>
        {detalle && <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>}
      </div>
    </Card>
  )
}

// Verde a partir de la mitad, ámbar si arrancó, gris si nadie lo tocó.
function Barra({ valor, total }: { valor: number; total: number }) {
  const p = pct(valor, total)
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${p}%`, backgroundColor: p >= 50 ? '#10b981' : p > 0 ? '#f59e0b' : '#e5e7eb' }}
      />
    </div>
  )
}

export function ReactivacionTibiaModule() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<'todos' | 'gestionados' | 'pendientes'>('todos')
  const [asesorSel, setAsesorSel] = useState<string | null>(null)
  const [leadDetalle, setLeadDetalle] = useState<Lead | null>(null)

  const cargar = useCallback(() => {
    setLoading(true)
    fetch('/api/reactivacion-tibia')
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(cargar, [cargar])

  if (loading && !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Cargando seguimiento...</span>
      </div>
    )
  }

  if (!data) {
    return <div className="p-6 text-muted-foreground">No se pudo cargar el seguimiento.</div>
  }

  const { resumen, porAsesor, leads, olas, live } = data
  const ctrlPct = pct(resumen.control.gestionados, resumen.control.leads)
  const priPct = pct(resumen.gestionados, resumen.priorizados)
  const lift = ctrlPct > 0 ? priPct / ctrlPct : 0

  const leadsFiltrados = leads
    .filter((l) =>
      filtro === 'gestionados' ? l.accionesPost > 0 : filtro === 'pendientes' ? l.accionesPost === 0 : true
    )
    .filter((l) => !asesorSel || (l.asesor || 'Sin asesor asignado') === asesorSel)

  const pendientesOlas = olas.filter((o) => !o.activo).reduce((a, o) => a + o.n, 0)

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Flame className="h-6 w-6 text-amber-500" />
            Reactivación de base tibia
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Leads marcados como <span className="font-medium text-foreground">Gestionar primero</span> en la
            bandeja del asesor. Mide cuántos se trabajaron desde que la vista salió a producción, el{' '}
            {fmtFechaHora(live)} ({diasDesde(live)} días).
          </p>
        </div>
        <Button variant="outline" onClick={cargar} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Flame} label="Priorizados" value={fmt(resumen.priorizados)} detalle="Ola 1 · P1 proforma pendiente" />
        <Kpi
          icon={CheckCircle2}
          label="Gestionados"
          value={`${fmt(resumen.gestionados)} · ${pctTxt(resumen.gestionados, resumen.priorizados)}`}
          detalle={`${fmt(resumen.acciones)} acciones registradas`}
          tono="bueno"
        />
        <Kpi
          icon={Clock}
          label="Sin tocar"
          value={fmt(resumen.pendientes)}
          detalle="Aún no tienen gestión posterior"
          tono="alerta"
        />
        <Kpi
          icon={TrendingUp}
          label="Vs. resto de bandeja"
          value={lift >= 1 ? `${lift.toFixed(1)}×` : '—'}
          detalle={`El resto va en ${ctrlPct.toFixed(1)}% (${fmt(resumen.control.leads)} leads)`}
          tono="destacado"
        />
      </div>

      {/* Avance global */}
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-foreground">Avance de la Ola 1</span>
          <span className="text-muted-foreground">
            {fmt(resumen.gestionados)} de {fmt(resumen.priorizados)}
          </span>
        </div>
        <Barra valor={resumen.gestionados} total={resumen.priorizados} />
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          Gestionado significa que quedó una acción registrada en el CRM después del despliegue. Por el
          subregistro conocido, es un piso: puede haberse contactado a más leads sin que figure.
        </p>
      </Card>

      {/* Por asesor */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Por asesor</h2>
          {asesorSel && (
            <Button variant="outline" size="sm" onClick={() => setAsesorSel(null)}>
              Quitar filtro
            </Button>
          )}
        </div>
        <div className="divide-y divide-border">
          {porAsesor.map((a) => {
            const activo = asesorSel === a.asesor
            return (
              <button
                key={a.asesor}
                onClick={() => setAsesorSel(activo ? null : a.asesor)}
                className={`flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-secondary/40 ${
                  activo ? 'bg-secondary/60' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{a.asesor}</p>
                  <div className="mt-1.5 max-w-md">
                    <Barra valor={a.gestionados} total={a.asignados} />
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-sm font-bold text-foreground">
                    {a.gestionados}/{a.asignados}
                  </p>
                  <p className="text-xs text-muted-foreground">{pctTxt(a.gestionados, a.asignados)}</p>
                </div>
              </button>
            )
          })}
        </div>
      </Card>

      {/* Detalle de leads */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            Detalle {asesorSel && <span className="font-normal text-muted-foreground">· {asesorSel}</span>}
          </h2>
          <div className="flex gap-1">
            {(['todos', 'gestionados', 'pendientes'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  filtro === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:bg-secondary/70'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/60">
                <th className="px-4 py-2 text-left font-semibold text-foreground">Lead</th>
                <th className="px-4 py-2 text-left font-semibold text-foreground">Asesor</th>
                <th className="px-4 py-2 text-left font-semibold text-foreground">Situación</th>
                <th className="px-4 py-2 text-center font-semibold text-foreground">Estado</th>
                <th className="px-4 py-2 text-left font-semibold text-foreground">Primera gestión</th>
                <th className="px-4 py-2 text-left font-semibold text-foreground">Última acción</th>
                <th className="px-4 py-2 text-center font-semibold text-foreground">Ver</th>
              </tr>
            </thead>
            <tbody>
              {leadsFiltrados.map((l) => (
                <tr key={l.idLead} className="border-b border-border last:border-0 hover:bg-secondary/30">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-foreground">{l.nombre || 'Sin nombre'}</p>
                    <p className="text-xs text-muted-foreground">{l.numero}</p>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{l.asesor || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {ETIQUETA_ESCALON[l.escalon as EscalonTibia] ?? l.escalon}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {l.accionesPost > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        {l.accionesPost} {l.accionesPost === 1 ? 'acción' : 'acciones'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Pendiente
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{fmtFechaHora(l.primeraPost)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{fmtFecha(l.ultimaAccion)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <button
                      onClick={() => setLeadDetalle(l)}
                      title="Ver detalle del lead"
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {leadsFiltrados.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No hay leads con este filtro
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Olas siguientes */}
      {pendientesOlas > 0 && (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Olas siguientes (marcadas, aún inactivas)</h2>
          <div className="flex flex-wrap gap-2">
            {olas
              .filter((o) => !o.activo)
              .map((o) => (
                <div key={`${o.escalon}-${o.ola}`} className="rounded-lg border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    Ola {o.ola} · {ETIQUETA_ESCALON[o.escalon as EscalonTibia] ?? o.escalon}
                  </p>
                  <p className="text-lg font-bold text-foreground">{fmt(o.n)}</p>
                </div>
              ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {fmt(pendientesOlas)} leads más ya están clasificados y esperando activación.
          </p>
        </Card>
      )}

      {leadDetalle && (
        <LeadDetailModal
          lead={{
            id: leadDetalle.idLead,
            dni: leadDetalle.dni ?? '',
            name: leadDetalle.nombre || '(sin nombre)',
            phone: leadDetalle.numero ?? '',
            status: leadDetalle.ultimoEstado ?? '',
            assignedDate: leadDetalle.fechaCreacion ?? '',
            product: '',
            priority: ETIQUETA_ESCALON[leadDetalle.escalon as EscalonTibia] ?? leadDetalle.escalon,
          }}
          onClose={() => setLeadDetalle(null)}
        />
      )}
    </div>
  )
}
