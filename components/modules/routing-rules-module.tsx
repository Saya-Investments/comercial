 'use client'

import { Card } from '@/components/ui/card'

export function RoutingRulesModule() {
  const rules = [
    { id: 1, name: 'Priorizar clientes premium', expr: 'if customer.tier == "premium" then route to VIP queue' },
    { id: 2, name: 'Horario laboral', expr: 'if time in 09:00-18:00 then route to agents else schedule' },
    { id: 3, name: 'Fallback por canal', expr: 'if whatsapp fails then fallback to SMS' },
  ]

  return (
    <Card className="p-6">
      <h3 className="text-lg font-bold mb-2">Reglas de enrutamiento</h3>
      <p className="text-sm text-muted-foreground mb-4">Listado informativo de reglas aplicadas en el enrutamiento de leads</p>
      <div className="space-y-3">
        {rules.map(r => (
          <div key={r.id} className="bg-secondary p-3 rounded-md border border-border">
            <div className="font-medium text-foreground">{r.name}</div>
            <div className="text-sm text-muted-foreground mt-1 font-mono">{r.expr}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}
