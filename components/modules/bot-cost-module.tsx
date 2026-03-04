 'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function BotCostModule({ initialLeads = 100 }: { initialLeads?: number }) {
  const [leads, setLeads] = useState(initialLeads)
  const [messagesPerLead, setMessagesPerLead] = useState(3)
  const costPerMessage = 0.07 // ejemplo en USD

  const estimatedCost = (leads * messagesPerLead * costPerMessage)

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold">Costo de procesamiento del bot</h3>
          <p className="text-sm text-muted-foreground">Estimación simple del costo de envío/procesamiento</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 items-end">
        <div>
          <label className="text-sm text-muted-foreground">Leads</label>
          <input type="number" value={leads} onChange={(e)=>setLeads(Number(e.target.value))} className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground" />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Mensajes por lead</label>
          <input type="number" value={messagesPerLead} onChange={(e)=>setMessagesPerLead(Number(e.target.value))} className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground" />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Costo por mensaje (USD)</label>
          <p className="font-mono mt-1">{costPerMessage.toFixed(4)}</p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Costo estimado</p>
          <p className="text-2xl font-bold">${estimatedCost.toFixed(2)}</p>
        </div>
        <div>
          <Button onClick={()=>navigator.clipboard?.writeText(estimatedCost.toFixed(2))}>Copiar</Button>
        </div>
      </div>
    </Card>
  )
}
