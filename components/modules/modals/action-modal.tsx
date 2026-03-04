'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X, ChevronLeft } from 'lucide-react'
import { useState } from 'react'

interface ActionModalProps {
  lead: {
    id: string
    name: string
    phone: string
    dni: string
  }
  onClose: () => void
}

export function ActionModal({ lead, onClose }: ActionModalProps) {
  const [selectedAction, setSelectedAction] = useState<string | null>(null)
  const [callNotes, setCallNotes] = useState('')
  const [appointmentData, setAppointmentData] = useState({
    date: '',
    time: '',
    notes: '',
  })

  const actions = [
    {
      id: 'call',
      title: 'Llamada Telefónica',
      description: 'Registra notas de una llamada con el lead',
      icon: '☎️',
    },
    {
      id: 'schedule',
      title: 'Agendar Llamada',
      description: 'Programa una llamada para una fecha específica',
      icon: '📅',
    },
  ]

  const handleCallSubmit = () => {
    console.log('Llamada registrada:', { lead: lead.name, notes: callNotes })
    setCallNotes('')
    setSelectedAction(null)
    onClose()
  }

  const handleScheduleSubmit = () => {
    console.log('Llamada agendada:', { lead: lead.name, date: appointmentData.date, time: appointmentData.time })
    setAppointmentData({ date: '', time: '', notes: '' })
    setSelectedAction(null)
    onClose()
  }

  if (selectedAction === 'call') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
        <Card className="w-full max-w-lg flex flex-col max-h-[90vh]">
          <div className="flex items-center gap-4 p-6 border-b border-border flex-shrink-0">
            <button
              onClick={() => setSelectedAction(null)}
              className="p-1 hover:bg-secondary rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-foreground" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-foreground">Llamada Telefónica</h2>
              <p className="text-sm text-muted-foreground mt-1">{lead.name}</p>
            </div>
            <button
              onClick={onClose}
              className="ml-auto p-1 hover:bg-secondary rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-foreground" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Notas de la Llamada</label>
              <textarea
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                placeholder="Escribe aquí las notas de la llamada..."
                className="w-full px-4 py-3 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary resize-none"
                rows={6}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4 flex-shrink-0">
              <Button
                variant="outline"
                onClick={() => setSelectedAction(null)}
                className="text-foreground hover:bg-secondary"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCallSubmit}
                className="bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                Guardar Llamada
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  if (selectedAction === 'schedule') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
        <Card className="w-full max-w-lg flex flex-col max-h-[90vh]">
          <div className="flex items-center gap-4 p-6 border-b border-border flex-shrink-0">
            <button
              onClick={() => setSelectedAction(null)}
              className="p-1 hover:bg-secondary rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-foreground" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-foreground">Agendar Llamada</h2>
              <p className="text-sm text-muted-foreground mt-1">{lead.name}</p>
            </div>
            <button
              onClick={onClose}
              className="ml-auto p-1 hover:bg-secondary rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-foreground" />
            </button>
          </div>

          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Fecha</label>
              <input
                type="date"
                value={appointmentData.date}
                onChange={(e) => setAppointmentData({ ...appointmentData, date: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Hora</label>
              <input
                type="time"
                value={appointmentData.time}
                onChange={(e) => setAppointmentData({ ...appointmentData, time: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Notas (Opcional)</label>
              <textarea
                value={appointmentData.notes}
                onChange={(e) => setAppointmentData({ ...appointmentData, notes: e.target.value })}
                placeholder="Notas adicionales..."
                className="w-full px-4 py-3 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary resize-none"
                rows={4}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 p-6 border-t border-border flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => setSelectedAction(null)}
              className="text-foreground hover:bg-secondary"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleScheduleSubmit}
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
              disabled={!appointmentData.date || !appointmentData.time}
            >
              Agendar
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card className="w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-6 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-foreground">Acciones Comerciales</h2>
            <p className="text-sm text-muted-foreground mt-1">{lead.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-secondary rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-foreground" />
          </button>
        </div>

        <div className="p-6 space-y-3 overflow-y-auto flex-1">
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => setSelectedAction(action.id)}
              className="w-full p-4 border border-border rounded-lg hover:border-primary hover:bg-secondary transition-all text-left"
            >
              <div className="flex items-start">
                <span className="text-2xl mr-3">{action.icon}</span>
                <div>
                  <h3 className="font-semibold text-foreground">{action.title}</h3>
                  <p className="text-sm text-muted-foreground">{action.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="p-6 border-t border-border flex justify-end flex-shrink-0">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </Card>
    </div>
  )
}
