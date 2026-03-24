'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { Card } from '@/components/ui/card'
import { ArrowRight, TrendingUp } from 'lucide-react'

interface FunnelData {
  recibidos: number
  gestionados: number
  ventaCerrada: number
}

export function AdvisorDashboardModule() {
  const { user } = useAuth()
  const [funnel, setFunnel] = useState<FunnelData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    fetch(`/api/advisor-dashboard?userId=${user.id}`)
      .then(res => res.json())
      .then(data => setFunnel(data.funnel))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [user?.id])

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">Cargando dashboard...</div>
  }

  const steps = [
    { label: 'Recibidos', value: funnel?.recibidos ?? 0, color: 'bg-blue-500', desc: 'Leads enrutados' },
    { label: 'Gestionados', value: funnel?.gestionados ?? 0, color: 'bg-amber-500', desc: 'Con acción comercial' },
    { label: 'Venta Cerrada', value: funnel?.ventaCerrada ?? 0, color: 'bg-green-500', desc: 'Estado final' },
  ]

  const total = funnel?.recibidos ?? 0

  return (
    <div className="flex flex-col h-full">
      <div className="bg-background border-b border-border p-6">
        <h1 className="text-3xl font-bold text-foreground">Mi Actividad</h1>
        <p className="text-muted-foreground mt-1">Resumen de tu gestión de leads</p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Funnel de Gestión */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Mi Funnel de Gestión</h2>
            </div>

            <div className="flex items-center justify-center gap-4 md:gap-8">
              {steps.map((step, i) => (
                <div key={step.label} className="flex items-center gap-4 md:gap-8">
                  {i > 0 && <ArrowRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />}
                  <div className="flex flex-col items-center">
                    <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full ${step.color} flex items-center justify-center text-white font-bold text-lg md:text-2xl shadow-lg`}>
                      {step.value}
                    </div>
                    <span className="text-sm font-semibold text-foreground mt-2">{step.label}</span>
                    <span className="text-xs text-muted-foreground">{step.desc}</span>
                    {total > 0 && (
                      <span className="text-xs font-medium text-muted-foreground mt-1">
                        {Math.round((step.value / total) * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Tasas de conversión */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-5">
              <p className="text-sm text-muted-foreground mb-1">Tasa de Gestión</p>
              <p className="text-3xl font-bold text-amber-600">
                {total > 0 ? Math.round(((funnel?.gestionados ?? 0) / total) * 100) : 0}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">Recibidos → Gestionados</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-muted-foreground mb-1">Tasa de Cierre</p>
              <p className="text-3xl font-bold text-green-600">
                {(funnel?.gestionados ?? 0) > 0 ? Math.round(((funnel?.ventaCerrada ?? 0) / (funnel?.gestionados ?? 1)) * 100) : 0}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">Gestionados → Venta Cerrada</p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
