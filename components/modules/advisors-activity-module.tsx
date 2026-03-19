'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Search, TrendingUp, CheckCircle, ArrowRight } from 'lucide-react'
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

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

const ESTADO_ASESOR_LABELS: Record<string, string> = {
  No_contesta: 'No contesta',
  Contactado: 'Contactado',
  Interesado: 'Interesado',
  Seguimiento: 'Seguimiento',
  Llamada_agendada: 'Llamada agendada',
  Venta_cerrada: 'Venta cerrada',
  No_interesado: 'No interesado',
}

const ESTADO_PIE_COLORS: Record<string, string> = {
  No_contesta: '#94a3b8',
  Contactado: '#3b82f6',
  Interesado: '#8b5cf6',
  Seguimiento: '#f59e0b',
  Llamada_agendada: '#6366f1',
  Venta_cerrada: '#22c55e',
  No_interesado: '#ef4444',
}

function ActivityTab({ advisors, searchTerm, setSearchTerm }: {
  advisors: AdvisorActivity[]
  searchTerm: string
  setSearchTerm: (v: string) => void
}) {
  const [estadoDistribution, setEstadoDistribution] = useState<EstadoDistribution[]>([])
  const [leadsEnrutados, setLeadsEnrutados] = useState(0)
  const [ranking, setRanking] = useState<RankingAdvisor[]>([])

  useEffect(() => {
    fetch('/api/advisors/estado-distribution')
      .then(res => res.json())
      .then(data => setEstadoDistribution(data))
      .catch(console.error)

    fetch('/api/advisors/leads-enrutados')
      .then(res => res.json())
      .then(data => setLeadsEnrutados(data.count))
      .catch(console.error)

    fetch('/api/advisors/ranking')
      .then(res => res.json())
      .then(data => setRanking(data))
      .catch(console.error)
  }, [])

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
            <span className="text-xs text-muted-foreground italic">Visualizar al final del dia</span>
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

    </>
  )
}

// ─── Funnel Tab ──────────────────────────────────────────────────────────────

interface FunnelsData {
  bot: { totalLeads: number; enGestion: number; asignados: number; descartados: number }
  gestion: { enrutados: number; gestionados: number; ventasCerradas: number }
}

function FunnelTab() {
  const [data, setData] = useState<FunnelsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/advisors/funnels')
      .then(res => res.json())
      .then(d => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

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

  const botConversionRate = data.bot.enGestion > 0
    ? ((data.bot.asignados / data.bot.enGestion) * 100).toFixed(1)
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
          {/* En Gestión */}
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-accent flex items-center justify-center">
              <span className="text-xl md:text-2xl font-bold text-white">{data.bot.enGestion}</span>
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
            <FunnelTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
