'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { Card } from '@/components/ui/card'
import { Headphones, Users, Clock, PhoneCall } from 'lucide-react'

interface DashboardData {
  leadsEnCola: number
  leadsGestionados: number
  leadsDerivados: number
}

export function CallCenterDashboardModule() {
  const { user } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // TODO: Implementar API call-center-dashboard cuando esté lista
    // Por ahora mostramos datos visuales placeholder
    const timer = setTimeout(() => {
      setData({ leadsEnCola: 0, leadsGestionados: 0, leadsDerivados: 0 })
      setLoading(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [user?.id])

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">Cargando dashboard...</div>
  }

  const stats = [
    { label: 'En Cola', value: data?.leadsEnCola ?? 0, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50 border-amber-200' },
    { label: 'Gestionados', value: data?.leadsGestionados ?? 0, icon: PhoneCall, color: 'text-blue-500', bg: 'bg-blue-50 border-blue-200' },
    { label: 'Derivados a Asesor', value: data?.leadsDerivados ?? 0, icon: Users, color: 'text-green-500', bg: 'bg-green-50 border-green-200' },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="bg-background border-b border-border p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Headphones className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Call Center</h1>
            <p className="text-muted-foreground mt-0.5">
              Bienvenido, <span className="font-medium text-foreground">{user?.name || 'Operador'}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stats.map((stat) => {
              const Icon = stat.icon
              return (
                <Card key={stat.label} className={`p-5 border ${stat.bg}`}>
                  <div className="flex items-center gap-3">
                    <Icon className={`w-8 h-8 ${stat.color}`} />
                    <div>
                      <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>

          {/* Info card */}
          <Card className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Headphones className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-2">Tu rol como Call Center</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Gestionas leads calientes con alta intencion de compra. Tu objetivo es contactarlos
                  rapidamente y cerrar la venta o derivarlos a un asesor si es necesario.
                </p>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    Revisa tus leads asignados en la seccion <span className="font-medium text-foreground">Leads</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    Registra tus acciones comerciales (llamadas, citas)
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    Organiza tu agenda en el <span className="font-medium text-foreground">Calendario</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
