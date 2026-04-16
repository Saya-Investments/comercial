'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Search, TrendingUp, CheckCircle, ArrowRight } from 'lucide-react'
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { useAuth } from '@/contexts/auth-context'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdvisorActivity {
  id: string
  name: string
  role: string
  calls: number
  tasksCompleted: number
  pending: number
  accionesComerciales: number
  performance: 'excellent' | 'good' | 'average' | 'needs-improvement'
}

// ─── Activity Tab ────────────────────────────────────────────────────────────

interface EstadoDistribution {
  name: string
  value: number
}

interface RankingAdvisor {
  id: string
  name: string
  recibidos: number
  gestionados: number
}

interface AsesorReassignment {
  id: string
  name: string
  disponibilidad: string
  quitados: number
  asignados: number
}

const ESTADO_ASESOR_LABELS: Record<string, string> = {
  No_contesta: 'No contesta',
  Contactado: 'Contactado',
  Interesado: 'Interesado',
  Seguimiento: 'Seguimiento',
  Llamada_agendada: 'Llamada agendada',
  Cita_agendada: 'Cita agendada',
  Venta_cerrada: 'Venta cerrada',
  No_interesado: 'No interesado',
  Prospecto: 'Prospecto',
}

const ESTADO_PIE_COLORS: Record<string, string> = {
  No_contesta: '#94a3b8',
  Contactado: '#3b82f6',
  Interesado: '#8b5cf6',
  Seguimiento: '#f59e0b',
  Llamada_agendada: '#6366f1',
  Cita_agendada: '#06b6d4',
  Venta_cerrada: '#22c55e',
  No_interesado: '#ef4444',
  Prospecto: '#10b981',
}

function ActivityTab({ advisors, searchTerm, setSearchTerm, supervisorId }: {
  advisors: AdvisorActivity[]
  searchTerm: string
  setSearchTerm: (v: string) => void
  supervisorId?: string
}) {
  const [estadoDistribution, setEstadoDistribution] = useState<EstadoDistribution[]>([])
  const [leadsEnrutados, setLeadsEnrutados] = useState(0)
  const [ranking, setRanking] = useState<RankingAdvisor[]>([])

  // Filtro de fecha para el Ranking de Actividad.
  // `rankingMode`: 'day' muestra solo el dia seleccionado | 'all' muestra acumulado historico.
  // `rankingDate`: fecha en formato YYYY-MM-DD, default = hoy en zona horaria Lima.
  const todayLima = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
  const [rankingMode, setRankingMode] = useState<'day' | 'all'>('day')
  const [rankingDate, setRankingDate] = useState<string>(todayLima)

  // Seccion Reasignaciones: tab Quitados/Asignados + mismo patron de filtro de fecha.
  const [reassignments, setReassignments] = useState<AsesorReassignment[]>([])
  const [reassignMode, setReassignMode] = useState<'day' | 'all'>('all')
  const [reassignDate, setReassignDate] = useState<string>(todayLima)
  const [reassignTab, setReassignTab] = useState<'quitados' | 'asignados'>('quitados')

  useEffect(() => {
    const qs = supervisorId ? `?supervisorId=${supervisorId}` : ''

    fetch(`/api/advisors/estado-distribution${qs}`)
      .then(res => res.json())
      .then(data => setEstadoDistribution(data))
      .catch(console.error)

    fetch(`/api/advisors/leads-enrutados${qs}`)
      .then(res => res.json())
      .then(data => setLeadsEnrutados(data.count))
      .catch(console.error)
  }, [supervisorId])

  // Ranking se recarga cuando cambia el filtro de fecha/modo
  useEffect(() => {
    const params = new URLSearchParams()
    if (supervisorId) params.set('supervisorId', supervisorId)
    if (rankingMode === 'day') params.set('date', rankingDate)
    const qs = params.toString() ? `?${params.toString()}` : ''
    fetch(`/api/advisors/ranking${qs}`)
      .then(res => res.json())
      .then(data => setRanking(data))
      .catch(console.error)
  }, [supervisorId, rankingMode, rankingDate])

  // Reasignaciones se recarga cuando cambia el filtro de fecha/modo
  useEffect(() => {
    const params = new URLSearchParams()
    if (supervisorId) params.set('supervisorId', supervisorId)
    if (reassignMode === 'day') params.set('date', reassignDate)
    const qs = params.toString() ? `?${params.toString()}` : ''
    fetch(`/api/advisors/reasignaciones${qs}`)
      .then(res => res.json())
      .then(data => setReassignments(data))
      .catch(console.error)
  }, [supervisorId, reassignMode, reassignDate])

  const filteredRanking = ranking.filter(
    (a) => a.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const maxRecibidos = filteredRanking.length > 0 ? Math.max(...filteredRanking.map(a => a.recibidos), 1) : 1

  return (
    <>
      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 mb-6">
        <Card className="p-3 md:p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs md:text-sm text-muted-foreground">Leads Enrutados</p>
              <p className="text-xl md:text-2xl font-bold text-foreground mt-1">{leadsEnrutados}</p>
            </div>
            <CheckCircle className="w-4 h-4 md:w-5 md:h-5 text-accent flex-shrink-0" />
          </div>
        </Card>

        <Card className="p-3 md:p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs md:text-sm text-muted-foreground">Asesores Activos</p>
              <p className="text-xl md:text-2xl font-bold text-foreground mt-1">{advisors.length}</p>
            </div>
            <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-accent flex-shrink-0" />
          </div>
        </Card>
      </div>

      {/* Pie Chart + Ranking Table side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6">
        {/* Ranking Table */}
        <Card className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg md:text-xl font-semibold text-foreground">Ranking de Actividad</h3>
          </div>
          {/* Filtro de fecha */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
              <button
                onClick={() => setRankingMode('day')}
                className={`px-3 py-1.5 transition-colors ${
                  rankingMode === 'day'
                    ? 'bg-accent text-white'
                    : 'bg-background text-muted-foreground hover:bg-secondary'
                }`}
              >
                Por dia
              </button>
              <button
                onClick={() => setRankingMode('all')}
                className={`px-3 py-1.5 border-l border-border transition-colors ${
                  rankingMode === 'all'
                    ? 'bg-accent text-white'
                    : 'bg-background text-muted-foreground hover:bg-secondary'
                }`}
              >
                Acumulado
              </button>
            </div>
            {rankingMode === 'day' && (
              <input
                type="date"
                value={rankingDate}
                max={todayLima}
                onChange={(e) => setRankingDate(e.target.value)}
                className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-accent"
              />
            )}
            <span className="text-xs text-muted-foreground italic ml-auto">
              {rankingMode === 'day'
                ? 'Leads asignados ese dia y gestionados'
                : 'Acumulado historico'}
            </span>
          </div>
          {/* Search */}
          <div className="flex items-center bg-background border border-border rounded-lg px-3 py-2 mb-4">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              placeholder="Buscar por nombre"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 bg-transparent border-0 outline-none text-foreground placeholder-muted-foreground text-sm ml-2"
            />
          </div>
          <div className="overflow-y-auto max-h-[300px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium w-8">#</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">Asesor</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium">Recibidos</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium">Gestionados</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium w-24"></th>
                </tr>
              </thead>
              <tbody>
                {filteredRanking.map((advisor, i) => {
                  const pct = maxRecibidos > 0 ? (advisor.recibidos / maxRecibidos) * 100 : 0
                  return (
                    <tr key={advisor.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 px-2 text-muted-foreground font-medium">{i + 1}</td>
                      <td className="py-2 px-2 font-medium text-foreground truncate max-w-[150px]">{advisor.name}</td>
                      <td className="py-2 px-2 text-right font-bold text-blue-600">{advisor.recibidos}</td>
                      <td className="py-2 px-2 text-right font-bold text-green-600">{advisor.gestionados}</td>
                      <td className="py-2 px-2">
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filteredRanking.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">No se encontraron asesores</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-4 md:p-6">
          <h3 className="text-lg md:text-xl font-semibold text-foreground mb-4">Distribucion por Estado Asesor</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={estadoDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }: { name: string; value: number }) => `${ESTADO_ASESOR_LABELS[name] || name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {estadoDistribution.map((entry: EstadoDistribution, index: number) => (
                  <Cell key={`cell-${index}`} fill={ESTADO_PIE_COLORS[entry.name] || '#6b7280'} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-background, #ffffff)',
                  border: '1px solid var(--color-border, #e5e7eb)',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: 'var(--color-foreground, #000000)' }}
                formatter={(value: number, name: string) => [value, ESTADO_ASESOR_LABELS[name] || name]}
              />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Reasignaciones — Quitados / Asignados por dia */}
      <Card className="p-4 md:p-6 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-lg md:text-xl font-semibold text-foreground">Reasignaciones</h3>
          <span className="text-xs text-muted-foreground italic">
            {reassignTab === 'quitados'
              ? 'Leads que se le quitaron al asesor por reasignacion'
              : 'Leads que el asesor recibio producto de una reasignacion'}
          </span>
        </div>

        {/* Controles: tab + filtro de fecha */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
            <button
              onClick={() => setReassignTab('quitados')}
              className={`px-3 py-1.5 transition-colors ${
                reassignTab === 'quitados'
                  ? 'bg-accent text-white'
                  : 'bg-background text-muted-foreground hover:bg-secondary'
              }`}
            >
              Quitados
            </button>
            <button
              onClick={() => setReassignTab('asignados')}
              className={`px-3 py-1.5 border-l border-border transition-colors ${
                reassignTab === 'asignados'
                  ? 'bg-accent text-white'
                  : 'bg-background text-muted-foreground hover:bg-secondary'
              }`}
            >
              Asignados
            </button>
          </div>

          <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs ml-2">
            <button
              onClick={() => setReassignMode('day')}
              className={`px-3 py-1.5 transition-colors ${
                reassignMode === 'day'
                  ? 'bg-accent text-white'
                  : 'bg-background text-muted-foreground hover:bg-secondary'
              }`}
            >
              Por dia
            </button>
            <button
              onClick={() => setReassignMode('all')}
              className={`px-3 py-1.5 border-l border-border transition-colors ${
                reassignMode === 'all'
                  ? 'bg-accent text-white'
                  : 'bg-background text-muted-foreground hover:bg-secondary'
              }`}
            >
              Acumulado
            </button>
          </div>

          {reassignMode === 'day' && (
            <input
              type="date"
              value={reassignDate}
              max={todayLima}
              onChange={(e) => setReassignDate(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-accent"
            />
          )}
        </div>

        {/* Lista de asesores con su stat del tab activo */}
        <div className="overflow-y-auto max-h-[300px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 text-muted-foreground font-medium w-8">#</th>
                <th className="text-left py-2 px-2 text-muted-foreground font-medium">Asesor</th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">
                  {reassignTab === 'quitados' ? 'Quitados' : 'Asignados'}
                </th>
                <th className="text-right py-2 px-2 text-muted-foreground font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const sorted = [...reassignments].sort((a, b) => {
                  const av = reassignTab === 'quitados' ? a.quitados : a.asignados
                  const bv = reassignTab === 'quitados' ? b.quitados : b.asignados
                  return bv - av
                })
                if (sorted.length === 0) {
                  return (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-muted-foreground">
                        No hay reasignaciones en este periodo
                      </td>
                    </tr>
                  )
                }
                return sorted.map((a, i) => {
                  const value = reassignTab === 'quitados' ? a.quitados : a.asignados
                  const color = reassignTab === 'quitados' ? 'text-red-600' : 'text-green-600'
                  return (
                    <tr key={a.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 px-2 text-muted-foreground font-medium">{i + 1}</td>
                      <td className="py-2 px-2 font-medium text-foreground truncate max-w-[220px]">{a.name}</td>
                      <td className={`py-2 px-2 text-right font-bold ${color}`}>{value}</td>
                      <td className="py-2 px-2 text-right">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            a.disponibilidad === 'disponible'
                              ? 'bg-green-50 text-green-700 border border-green-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {a.disponibilidad}
                        </span>
                      </td>
                    </tr>
                  )
                })
              })()}
            </tbody>
          </table>
        </div>
      </Card>

    </>
  )
}

// ─── Funnel Tab ──────────────────────────────────────────────────────────────

interface FunnelsData {
  bot: { totalLeads: number; enGestion: number; asignados: number; descartados: number }
  gestion: { enrutados: number; gestionados: number; ventasCerradas: number }
}

function FunnelTab({ supervisorId }: { supervisorId?: string }) {
  const [data, setData] = useState<FunnelsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const qs = supervisorId ? `?supervisorId=${supervisorId}` : ''
    fetch(`/api/advisors/funnels${qs}`)
      .then(res => res.json())
      .then(d => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [supervisorId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    )
  }

  if (!data) return null

  const botFunnelData = [
    { name: 'En Gestion', value: data.bot.enGestion, fill: '#3b82f6' },
    { name: 'Asignados', value: data.bot.asignados, fill: '#22c55e' },
  ]

  const gestionFunnelData = [
    { name: 'Enrutados', value: data.gestion.enrutados, fill: '#3b82f6' },
    { name: 'Gestionados', value: data.gestion.gestionados, fill: '#8b5cf6' },
    { name: 'Venta Cerrada', value: data.gestion.ventasCerradas, fill: '#22c55e' },
  ]

  // En Gestion = leads activos bajo gestion del bot O ya enrutados a asesor
  // (estados mutuamente excluyentes en BD, por eso sumamos). Descartados no cuentan.
  const botEnGestionTotal = data.bot.enGestion + data.bot.asignados
  const botConversionRate = botEnGestionTotal > 0
    ? ((data.bot.asignados / botEnGestionTotal) * 100).toFixed(1)
    : '0'

  const gestionConversionRate = data.gestion.enrutados > 0
    ? ((data.gestion.ventasCerradas / data.gestion.enrutados) * 100).toFixed(1)
    : '0'

  return (
    <>
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <Card className="p-3 md:p-4">
          <p className="text-xs text-muted-foreground">Total Leads</p>
          <p className="text-xl md:text-2xl font-bold text-foreground mt-1">{data.bot.totalLeads}</p>
        </Card>
        <Card className="p-3 md:p-4">
          <p className="text-xs text-muted-foreground">Descartados (Bot)</p>
          <p className="text-xl md:text-2xl font-bold text-red-500 mt-1">{data.bot.descartados}</p>
        </Card>
        <Card className="p-3 md:p-4">
          <p className="text-xs text-muted-foreground">Ventas Cerradas</p>
          <p className="text-xl md:text-2xl font-bold text-green-600 mt-1">{data.gestion.ventasCerradas}</p>
        </Card>
        <Card className="p-3 md:p-4">
          <p className="text-xs text-muted-foreground">Tasa Global</p>
          <p className="text-xl md:text-2xl font-bold text-foreground mt-1">{gestionConversionRate}%</p>
        </Card>
      </div>

      {/* Funnel del Bot - horizontal flow */}
      <Card className="p-4 md:p-6 mb-6">
        <h3 className="text-lg font-semibold text-foreground mb-1">Embudo de Conversion: En Gestion → Asignado</h3>
        <p className="text-xs text-muted-foreground mb-6">Primera flecha: Bot</p>

        <div className="flex items-center justify-center gap-4 md:gap-8 mb-6">
          {/* En Gestión (en gestion por bot + ya asignados a asesor) */}
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-accent flex items-center justify-center">
              <span className="text-xl md:text-2xl font-bold text-white">{botEnGestionTotal}</span>
            </div>
            <p className="text-sm font-semibold text-foreground mt-2">En Gestion</p>
            <p className="text-xs text-muted-foreground">100%</p>
          </div>

          {/* Arrow */}
          <ArrowRight className="w-6 h-6 text-muted-foreground flex-shrink-0" />

          {/* Asignados */}
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-accent flex items-center justify-center">
              <span className="text-xl md:text-2xl font-bold text-white">{data.bot.asignados}</span>
            </div>
            <p className="text-sm font-semibold text-foreground mt-2">Asignados</p>
            <p className="text-xs text-muted-foreground">{botConversionRate}%</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-sm font-semibold text-foreground">Eficiencia del Bot</p>
            <p className="text-2xl font-bold text-accent mt-1">{botConversionRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">En Gestion → Asignado</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-sm font-semibold text-foreground">Descartados</p>
            <p className="text-2xl font-bold text-red-500 mt-1">{data.bot.descartados}</p>
            <p className="text-xs text-muted-foreground mt-1">Leads descartados por bot</p>
          </div>
        </div>
      </Card>

      {/* Funnel de Gestión - horizontal flow */}
      <Card className="p-4 md:p-6 mb-6">
        <h3 className="text-lg font-semibold text-foreground mb-1">Embudo de Gestion: Enrutado → Gestionado → Venta</h3>
        <p className="text-xs text-muted-foreground mb-6">Flujo del asesor</p>

        <div className="flex items-center justify-center gap-4 md:gap-8 mb-6">
          {/* Enrutados */}
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-blue-500 flex items-center justify-center">
              <span className="text-xl md:text-2xl font-bold text-white">{data.gestion.enrutados}</span>
            </div>
            <p className="text-sm font-semibold text-foreground mt-2">Enrutados</p>
            <p className="text-xs text-muted-foreground">100%</p>
          </div>

          <ArrowRight className="w-6 h-6 text-muted-foreground flex-shrink-0" />

          {/* Gestionados */}
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-purple-500 flex items-center justify-center">
              <span className="text-xl md:text-2xl font-bold text-white">{data.gestion.gestionados}</span>
            </div>
            <p className="text-sm font-semibold text-foreground mt-2">Gestionados</p>
            <p className="text-xs text-muted-foreground">
              {data.gestion.enrutados > 0 ? ((data.gestion.gestionados / data.gestion.enrutados) * 100).toFixed(1) : '0'}%
            </p>
          </div>

          <ArrowRight className="w-6 h-6 text-muted-foreground flex-shrink-0" />

          {/* Venta Cerrada */}
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-green-500 flex items-center justify-center">
              <span className="text-xl md:text-2xl font-bold text-white">{data.gestion.ventasCerradas}</span>
            </div>
            <p className="text-sm font-semibold text-foreground mt-2">Venta Cerrada</p>
            <p className="text-xs text-muted-foreground">{gestionConversionRate}%</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-sm font-semibold text-foreground">Eficiencia del Asesor</p>
            <p className="text-2xl font-bold text-purple-500 mt-1">
              {data.gestion.enrutados > 0 ? ((data.gestion.gestionados / data.gestion.enrutados) * 100).toFixed(1) : '0'}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">Enrutado → Gestionado</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-sm font-semibold text-foreground">Tasa de Cierre</p>
            <p className="text-2xl font-bold text-green-500 mt-1">{gestionConversionRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">Enrutado → Venta Cerrada</p>
          </div>
        </div>
      </Card>
    </>
  )
}

// ─── Main Module ─────────────────────────────────────────────────────────────

export function AdvisorsActivityModule() {
  const { user } = useAuth()
  const [advisors, setAdvisors] = useState<AdvisorActivity[]>([])
  const [searchTerm, setSearchTerm] = useState('')

  const isSupervisor = user?.role === 'supervisor'

  useEffect(() => {
    const url = isSupervisor ? `/api/advisors?supervisorId=${user?.id}` : '/api/advisors'
    fetch(url)
      .then((res) => res.json())
      .then((data) => setAdvisors(data))
      .catch(console.error)
  }, [isSupervisor, user?.id])

  return (
    <div className="flex flex-col h-full">
      <div className="bg-background border-b border-border p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Actividad de Asesores</h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Dashboard de desempeno y actividad en tiempo real
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        <Tabs defaultValue="actividad" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="actividad">Actividad</TabsTrigger>
            <TabsTrigger value="funnel">Funnel</TabsTrigger>
          </TabsList>

          <TabsContent value="actividad">
            <ActivityTab advisors={advisors} searchTerm={searchTerm} setSearchTerm={setSearchTerm} supervisorId={isSupervisor ? user?.id : undefined} />
          </TabsContent>

          <TabsContent value="funnel">
            <FunnelTab supervisorId={isSupervisor ? user?.id : undefined} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
