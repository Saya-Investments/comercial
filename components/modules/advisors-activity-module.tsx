'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Search, TrendingUp, Phone, CheckCircle, Briefcase, Filter, ChevronDown, ArrowRight, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, FunnelChart, Funnel, LabelList } from 'recharts'

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

interface FunnelStage {
  stage: string
  label: string
  count: number
}

interface FunnelConversion {
  from: string
  to: string
  rate: number
}

interface AsesorFunnel {
  id_asesor: string
  nombre: string
  stages: Record<string, number>
  total: number
}

interface FunnelData {
  totalLeads: number
  funnel: FunnelStage[]
  conversions: FunnelConversion[]
  dropout: { label: string; count: number }
  porAsesor: AsesorFunnel[]
}

// ─── Constants ───────────────────────────────────────────────────────────────

const performanceBadgeColors = {
  excellent: 'bg-green-100 text-green-800',
  good: 'bg-blue-100 text-blue-800',
  average: 'bg-yellow-100 text-yellow-800',
  'needs-improvement': 'bg-red-100 text-red-800',
}

const performanceLabels = {
  excellent: 'Excelente',
  good: 'Bueno',
  average: 'Promedio',
  'needs-improvement': 'Necesita mejorar',
}

const FUNNEL_COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#22c55e', '#ef4444']

const STAGE_COLORS: Record<string, string> = {
  No_contesta: '#94a3b8',
  Contactado: '#3b82f6',
  Interesado: '#8b5cf6',
  Seguimiento: '#f59e0b',
  Llamada_agendada: '#6366f1',
  Venta_cerrada: '#22c55e',
  No_interesado: '#ef4444',
}

// ─── Activity Tab (existing) ─────────────────────────────────────────────────

function ActivityTab({ advisors, searchTerm, setSearchTerm }: {
  advisors: AdvisorActivity[]
  searchTerm: string
  setSearchTerm: (v: string) => void
}) {
  const [selectedAdvisor, setSelectedAdvisor] = useState<AdvisorActivity | null>(null)

  const filteredAdvisors = advisors.filter(
    (advisor) =>
      advisor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      advisor.role.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalCalls = advisors.reduce((sum, a) => sum + a.calls, 0)
  const totalTasksCompleted = advisors.reduce((sum, a) => sum + a.tasksCompleted, 0)
  const totalAcciones = advisors.reduce((sum, a) => sum + (a.accionesComerciales || 0), 0)

  const barChartData = advisors.map((advisor) => ({
    name: advisor.name.split(' ')[0],
    calls: advisor.calls,
    acciones: advisor.accionesComerciales || 0,
    completadas: advisor.tasksCompleted,
    pendientes: advisor.pending,
  }))

  const pieChartData = [
    { name: 'Llamadas', value: totalCalls },
    { name: 'Acc. Comerciales', value: totalAcciones },
    { name: 'Completadas', value: totalTasksCompleted },
    { name: 'Pendientes', value: advisors.reduce((sum, a) => sum + a.pending, 0) },
  ]

  const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b']

  return (
    <>
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <Card className="p-3 md:p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs md:text-sm text-muted-foreground">Total Llamadas</p>
              <p className="text-xl md:text-2xl font-bold text-foreground mt-1">{totalCalls}</p>
            </div>
            <Phone className="w-4 h-4 md:w-5 md:h-5 text-accent flex-shrink-0" />
          </div>
        </Card>

        <Card className="p-3 md:p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs md:text-sm text-muted-foreground">Acciones Comerciales</p>
              <p className="text-xl md:text-2xl font-bold text-foreground mt-1">{totalAcciones}</p>
            </div>
            <Briefcase className="w-4 h-4 md:w-5 md:h-5 text-accent flex-shrink-0" />
          </div>
        </Card>

        <Card className="p-3 md:p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs md:text-sm text-muted-foreground">Tareas Completadas</p>
              <p className="text-xl md:text-2xl font-bold text-foreground mt-1">{totalTasksCompleted}</p>
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

      {/* Search */}
      <div className="flex items-center bg-background border border-border rounded-lg px-3 py-2 md:max-w-md mb-6">
        <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <input
          type="text"
          placeholder="Buscar por nombre o rol..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 bg-transparent border-0 outline-none text-foreground placeholder-muted-foreground text-sm ml-2"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6">
        <Card className="p-4 md:p-6">
          <h3 className="text-lg md:text-xl font-semibold text-foreground mb-4">Actividad por Asesor</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
              <XAxis dataKey="name" stroke="var(--color-muted-foreground, #6b7280)" />
              <YAxis stroke="var(--color-muted-foreground, #6b7280)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-background, #ffffff)',
                  border: '1px solid var(--color-border, #e5e7eb)',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: 'var(--color-foreground, #000000)' }}
              />
              <Legend />
              <Bar dataKey="calls" fill="#3b82f6" name="Llamadas" />
              <Bar dataKey="acciones" fill="#8b5cf6" name="Acc. Comerciales" />
              <Bar dataKey="completadas" fill="#10b981" name="Completadas" />
              <Bar dataKey="pendientes" fill="#f59e0b" name="Pendientes" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4 md:p-6">
          <h3 className="text-lg md:text-xl font-semibold text-foreground mb-4">Distribucion General</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieChartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieChartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-background, #ffffff)',
                  border: '1px solid var(--color-border, #e5e7eb)',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: 'var(--color-foreground, #000000)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Cards Section */}
      <div className="mb-4">
        <h3 className="text-lg md:text-xl font-semibold text-foreground mb-4">Detalle de Asesores</h3>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredAdvisors.length > 0 ? (
          filteredAdvisors.map((advisor) => (
            <Card
              key={advisor.id}
              className={`p-4 md:p-6 cursor-pointer transition-all hover:shadow-lg ${
                selectedAdvisor?.id === advisor.id ? 'ring-2 ring-accent' : ''
              }`}
              onClick={() => setSelectedAdvisor(advisor)}
            >
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-lg md:text-xl font-semibold text-foreground">{advisor.name}</h3>
                      <p className="text-xs md:text-sm text-muted-foreground">{advisor.role}</p>
                    </div>
                    <Badge className={`${performanceBadgeColors[advisor.performance]} text-xs md:text-sm px-2 md:px-3 py-1`}>
                      {performanceLabels[advisor.performance]}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="bg-muted/50 rounded-lg p-2 md:p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Phone className="w-3 h-3 md:w-4 md:h-4 text-accent" />
                        <p className="text-xs text-muted-foreground">Llamadas</p>
                      </div>
                      <p className="text-lg md:text-xl font-bold text-foreground">{advisor.calls}</p>
                    </div>

                    <div className="bg-muted/50 rounded-lg p-2 md:p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Briefcase className="w-3 h-3 md:w-4 md:h-4 text-accent" />
                        <p className="text-xs text-muted-foreground">Acc. Comerciales</p>
                      </div>
                      <p className="text-lg md:text-xl font-bold text-foreground">{advisor.accionesComerciales || 0}</p>
                    </div>

                    <div className="bg-muted/50 rounded-lg p-2 md:p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle className="w-3 h-3 md:w-4 md:h-4 text-accent" />
                        <p className="text-xs text-muted-foreground">Completadas</p>
                      </div>
                      <p className="text-lg md:text-xl font-bold text-foreground">{advisor.tasksCompleted}</p>
                    </div>

                    <div className="bg-muted/50 rounded-lg p-2 md:p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="w-3 h-3 md:w-4 md:h-4 text-accent" />
                        <p className="text-xs text-muted-foreground">Pendientes</p>
                      </div>
                      <p className="text-lg md:text-xl font-bold text-foreground">{advisor.pending}</p>
                    </div>
                  </div>
                </div>
              </div>

              {selectedAdvisor?.id === advisor.id && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="text-xs md:text-sm">
                      Ver Detalle
                    </Button>
                    <Button variant="outline" className="text-xs md:text-sm">
                      Exportar Reporte
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))
        ) : (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">No se encontraron asesores</p>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Funnel Tab ──────────────────────────────────────────────────────────────

function FunnelTab({ advisors }: { advisors: AdvisorActivity[] }) {
  const [funnelData, setFunnelData] = useState<FunnelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedAsesor, setSelectedAsesor] = useState<string>('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const fetchFunnel = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (selectedAsesor) params.set('id_asesor', selectedAsesor)
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)

    try {
      const res = await fetch(`/api/advisors/funnel?${params.toString()}`)
      const data = await res.json()
      setFunnelData(data)
    } catch (err) {
      console.error('Error fetching funnel:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedAsesor, desde, hasta])

  useEffect(() => {
    fetchFunnel()
  }, [fetchFunnel])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    )
  }

  if (!funnelData) return null

  // Data for horizontal bar funnel
  const funnelBarData = funnelData.funnel.map((s, i) => ({
    ...s,
    fill: FUNNEL_COLORS[i] || '#6b7280',
  }))

  // Data for recharts Funnel
  const rechartsFunnelData = funnelData.funnel.map((s, i) => ({
    name: s.label,
    value: s.count,
    fill: FUNNEL_COLORS[i] || '#6b7280',
  }))

  // Per-advisor comparison bar data
  const asesorBarData = funnelData.porAsesor
    .filter((a) => a.total > 0)
    .map((a) => ({
      name: a.nombre.split(' ')[0],
      ...a.stages,
    }))

  const selectedAsesorName = selectedAsesor
    ? advisors.find((a) => a.id === selectedAsesor)?.name || 'Asesor'
    : 'Todos los asesores'

  return (
    <>
      {/* Filters */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="md:w-auto w-full"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filtros
            <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </Button>

          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{selectedAsesorName}</span>
            <Badge variant="outline" className="text-xs">
              {funnelData.totalLeads} leads
            </Badge>
          </div>
        </div>

        {showFilters && (
          <Card className="p-4 mt-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Asesor</label>
                <select
                  value={selectedAsesor}
                  onChange={(e) => setSelectedAsesor(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Todos los asesores</option>
                  {advisors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Desde</label>
                <input
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Hasta</label>
                <input
                  type="date"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <Card className="p-3 md:p-4">
          <p className="text-xs text-muted-foreground">Total Leads</p>
          <p className="text-xl md:text-2xl font-bold text-foreground mt-1">{funnelData.totalLeads}</p>
        </Card>
        <Card className="p-3 md:p-4">
          <p className="text-xs text-muted-foreground">Ventas Cerradas</p>
          <p className="text-xl md:text-2xl font-bold text-green-600 mt-1">
            {funnelData.funnel.find((s) => s.stage === 'Venta_cerrada')?.count || 0}
          </p>
        </Card>
        <Card className="p-3 md:p-4">
          <p className="text-xs text-muted-foreground">No Interesados</p>
          <p className="text-xl md:text-2xl font-bold text-red-500 mt-1">{funnelData.dropout.count}</p>
        </Card>
        <Card className="p-3 md:p-4">
          <p className="text-xs text-muted-foreground">Tasa Global</p>
          <p className="text-xl md:text-2xl font-bold text-foreground mt-1">
            {funnelData.totalLeads > 0
              ? (
                  ((funnelData.funnel.find((s) => s.stage === 'Venta_cerrada')?.count || 0) /
                    funnelData.totalLeads) *
                  100
                ).toFixed(1)
              : '0'}
            %
          </p>
        </Card>
      </div>

      {/* Funnel Chart + Conversions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6">
        {/* Funnel Visual */}
        <Card className="p-4 md:p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Funnel de Gestion</h3>
          <ResponsiveContainer width="100%" height={350}>
            <FunnelChart>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-background, #ffffff)',
                  border: '1px solid var(--color-border, #e5e7eb)',
                  borderRadius: '8px',
                }}
                formatter={(value: number, name: string) => [`${value} leads`, name]}
              />
              <Funnel dataKey="value" data={rechartsFunnelData} isAnimationActive>
                <LabelList
                  position="right"
                  fill="var(--color-foreground, #000)"
                  stroke="none"
                  dataKey="name"
                  className="text-xs md:text-sm"
                />
                <LabelList
                  position="center"
                  fill="#fff"
                  stroke="none"
                  dataKey="value"
                  className="text-xs md:text-sm font-bold"
                />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </Card>

        {/* Conversion Rates */}
        <Card className="p-4 md:p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Tasas de Conversion</h3>
          <div className="space-y-3">
            {funnelData.conversions.map((c, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="truncate font-medium text-foreground">{c.from}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <span className="truncate font-medium text-foreground">{c.to}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(c.rate, 100)}%`,
                        backgroundColor: c.rate >= 50 ? '#22c55e' : c.rate >= 25 ? '#f59e0b' : '#ef4444',
                      }}
                    />
                  </div>
                  <span className="text-sm font-bold text-foreground w-14 text-right">{c.rate}%</span>
                </div>
              </div>
            ))}

            {/* Dropout rate */}
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-red-500">Tasa de abandono (No interesados)</span>
                <span className="text-sm font-bold text-red-500">
                  {funnelData.totalLeads > 0
                    ? ((funnelData.dropout.count / funnelData.totalLeads) * 100).toFixed(1)
                    : '0'}
                  %
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Breakdown Table */}
      <Card className="p-4 md:p-6 mb-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Detalle por Etapa</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 text-muted-foreground font-medium">Etapa</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium">Leads</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium">% del total</th>
              </tr>
            </thead>
            <tbody>
              {funnelBarData.map((s) => (
                <tr key={s.stage} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.fill }} />
                      <span className="font-medium text-foreground">{s.label}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-medium text-foreground">{s.count}</td>
                  <td className="py-2.5 px-3 text-right text-muted-foreground">
                    {funnelData.totalLeads > 0 ? ((s.count / funnelData.totalLeads) * 100).toFixed(1) : '0'}%
                  </td>
                </tr>
              ))}
              {/* Dropout row */}
              <tr className="hover:bg-muted/30">
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="font-medium text-red-500">{funnelData.dropout.label}</span>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-right font-medium text-red-500">{funnelData.dropout.count}</td>
                <td className="py-2.5 px-3 text-right text-red-400">{funnelData.dropout.count}</td>
                <td className="py-2.5 px-3 text-right text-red-400">
                  {funnelData.totalLeads > 0
                    ? ((funnelData.dropout.count / funnelData.totalLeads) * 100).toFixed(1)
                    : '0'}
                  %
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Per-Advisor Comparison (only when no filter) */}
      {!selectedAsesor && asesorBarData.length > 0 && (
        <Card className="p-4 md:p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Comparativa por Asesor</h3>
          <ResponsiveContainer width="100%" height={Math.max(300, asesorBarData.length * 50)}>
            <BarChart data={asesorBarData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
              <XAxis type="number" stroke="var(--color-muted-foreground, #6b7280)" />
              <YAxis
                dataKey="name"
                type="category"
                width={80}
                stroke="var(--color-muted-foreground, #6b7280)"
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-background, #ffffff)',
                  border: '1px solid var(--color-border, #e5e7eb)',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: 'var(--color-foreground, #000000)' }}
              />
              <Legend />
              <Bar dataKey="Contactado" stackId="a" fill={STAGE_COLORS.Contactado} name="Contactado" />
              <Bar dataKey="Interesado" stackId="a" fill={STAGE_COLORS.Interesado} name="Interesado" />
              <Bar dataKey="Seguimiento" stackId="a" fill={STAGE_COLORS.Seguimiento} name="Seguimiento" />
              <Bar dataKey="Llamada_agendada" stackId="a" fill={STAGE_COLORS.Llamada_agendada} name="Llamada agendada" />
              <Bar dataKey="Venta_cerrada" stackId="a" fill={STAGE_COLORS.Venta_cerrada} name="Venta cerrada" />
              <Bar dataKey="No_interesado" stackId="a" fill={STAGE_COLORS.No_interesado} name="No interesado" />
              <Bar dataKey="No_contesta" stackId="a" fill={STAGE_COLORS.No_contesta} name="No contesta" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </>
  )
}

// ─── Main Module ─────────────────────────────────────────────────────────────

export function AdvisorsActivityModule() {
  const [advisors, setAdvisors] = useState<AdvisorActivity[]>([])
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetch('/api/advisors')
      .then((res) => res.json())
      .then((data) => setAdvisors(data))
      .catch(console.error)
  }, [])

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
            <ActivityTab advisors={advisors} searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
          </TabsContent>

          <TabsContent value="funnel">
            <FunnelTab advisors={advisors} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
