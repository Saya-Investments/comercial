'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, TrendingUp, Phone, CheckCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ChartContainer, ChartTooltip, ChartLegend } from '@/components/ui/chart'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface AdvisorActivity {
  id: string
  name: string
  role: string
  calls: number
  tasksCompleted: number
  pending: number
  performance: 'excellent' | 'good' | 'average' | 'needs-improvement'
}

const mockAdvisors: AdvisorActivity[] = [
  {
    id: '1',
    name: 'Carlos Rodriguez',
    role: 'Asesor Senior',
    calls: 45,
    tasksCompleted: 23,
    pending: 5,
    performance: 'excellent',
  },
  {
    id: '2',
    name: 'Marina López',
    role: 'Asesor',
    calls: 38,
    tasksCompleted: 18,
    pending: 8,
    performance: 'good',
  },
  {
    id: '3',
    name: 'Juan Martínez',
    role: 'Asesor Junior',
    calls: 22,
    tasksCompleted: 12,
    pending: 4,
    performance: 'average',
  },
  {
    id: '4',
    name: 'Patricia González',
    role: 'Asesor',
    calls: 52,
    tasksCompleted: 31,
    pending: 3,
    performance: 'excellent',
  },
]

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

export function AdvisorsActivityModule() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedAdvisor, setSelectedAdvisor] = useState<AdvisorActivity | null>(null)

  const filteredAdvisors = mockAdvisors.filter(
    (advisor) =>
      advisor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      advisor.role.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalCalls = mockAdvisors.reduce((sum, a) => sum + a.calls, 0)
  const totalTasksCompleted = mockAdvisors.reduce((sum, a) => sum + a.tasksCompleted, 0)

  // Preparar datos para gráfica de barras
  const barChartData = mockAdvisors.map((advisor) => ({
    name: advisor.name.split(' ')[0], // Solo primer nombre
    calls: advisor.calls,
    completadas: advisor.tasksCompleted,
    pendientes: advisor.pending,
  }))

  // Preparar datos para gráfica de pastel (resumen general)
  const pieChartData = [
    { name: 'Llamadas', value: totalCalls },
    { name: 'Completadas', value: totalTasksCompleted },
    { name: 'Pendientes', value: mockAdvisors.reduce((sum, a) => sum + a.pending, 0) },
  ]

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b']

  return (
    <div className="flex flex-col h-full">
      <div className="bg-background border-b border-border p-4 md:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Actividad de Asesores</h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Dashboard de desempeño y actividad en tiempo real
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
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
                <p className="text-xl md:text-2xl font-bold text-foreground mt-1">{mockAdvisors.length}</p>
              </div>
              <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-accent flex-shrink-0" />
            </div>
          </Card>
        </div>

        {/* Search */}
        <div className="flex items-center bg-background border border-border rounded-lg px-3 py-2 md:max-w-md">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            placeholder="Buscar por nombre o rol..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent border-0 outline-none text-foreground placeholder-muted-foreground text-sm ml-2"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6">
          {/* Bar Chart */}
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
                <Bar dataKey="completadas" fill="#10b981" name="Completadas" />
                <Bar dataKey="pendientes" fill="#f59e0b" name="Pendientes" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Pie Chart */}
          <Card className="p-4 md:p-6">
            <h3 className="text-lg md:text-xl font-semibold text-foreground mb-4">Distribución General</h3>
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
                  {pieChartData.map((entry, index) => (
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

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                      <div className="bg-muted/50 rounded-lg p-2 md:p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Phone className="w-3 h-3 md:w-4 md:h-4 text-accent" />
                          <p className="text-xs text-muted-foreground">Llamadas</p>
                        </div>
                        <p className="text-lg md:text-xl font-bold text-foreground">{advisor.calls}</p>
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
      </div>
    </div>
  )
}
