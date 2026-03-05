'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X, ChevronLeft, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/contexts/auth-context'

interface ActionModalProps {
  lead: {
    id: string
    name: string
    phone: string
    dni: string
  }
  onClose: () => void
  onActionSaved?: () => void
}

const ESTADO_ASESOR_LLAMADA = [
  { value: 'No_contesta', label: 'No contesta' },
  { value: 'No_interesado', label: 'No interesado' },
  { value: 'Interesado', label: 'Interesado' },
  { value: 'Contactado', label: 'Contactado' },
  { value: 'Seguimiento', label: 'Seguimiento' },
  { value: 'Venta_cerrada', label: 'Venta cerrada' },
]

export function ActionModal({ lead, onClose, onActionSaved }: ActionModalProps) {
  const { user } = useAuth()
  const [selectedAction, setSelectedAction] = useState<string | null>(null)
  const [callNotes, setCallNotes] = useState('')
  const [callEstado, setCallEstado] = useState('')
  const [saving, setSaving] = useState(false)
  const [appointmentData, setAppointmentData] = useState({
    date: '',
    time: '',
    notes: '',
  })

  const actions = [
    {
      id: 'call',
      title: 'Llamada Telefonica',
      description: 'Registra notas de una llamada con el lead',
      icon: '☎️',
    },
    {
      id: 'schedule',
      title: 'Agendar Llamada',
      description: 'Programa una llamada para una fecha especifica',
      icon: '📅',
    },
    {
      id: 'cita',
      title: 'Cita',
      description: 'Agenda una cita presencial o virtual con el lead',
      icon: '🤝',
    },
  ]

  const handleCallSubmit = async () => {
    if (!user || !callEstado) return
    setSaving(true)
    try {
      const res = await fetch('/api/acciones-comerciales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          userId: user.id,
          tipoAccion: 'Llamada',
          estadoAsesor: callEstado,
          observaciones: callNotes,
        }),
      })
      if (res.ok) {
        onActionSaved?.()
        onClose()
      }
    } finally {
      setSaving(false)
    }
  }

  const handleScheduleSubmit = async () => {
    if (!user) return
    setSaving(true)
    try {
      const res = await fetch('/api/acciones-comerciales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          userId: user.id,
          tipoAccion: 'Agendar_llamada',
          estadoAsesor: 'Llamada_agendada',
          observaciones: appointmentData.notes,
          cita: {
            date: appointmentData.date,
            time: appointmentData.time,
            leadName: lead.name,
          },
        }),
      })
      if (res.ok) {
        onActionSaved?.()
        onClose()
      }
    } finally {
      setSaving(false)
    }
  }

  const handleCitaSubmit = async () => {
    if (!user) return
    setSaving(true)
    try {
      // Create cita via calendar API
      const citaRes = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Cita - ${lead.name}`,
          leadId: lead.id,
          leadName: lead.name,
          userId: user.id,
          date: appointmentData.date,
          time: appointmentData.time,
          type: 'reunion',
          description: appointmentData.notes,
        }),
      })
      if (!citaRes.ok) return

      const citaData = await citaRes.json()

      // Register accion comercial linked to the cita
      await fetch('/api/acciones-comerciales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          userId: user.id,
          tipoAccion: 'Cita',
          estadoAsesor: 'Seguimiento',
          observaciones: appointmentData.notes,
          citaId: citaData.id,
        }),
      })

      onActionSaved?.()
      onClose()
    } finally {
      setSaving(false)
    }
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
              <h2 className="text-xl font-bold text-foreground">Llamada Telefonica</h2>
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
              <label className="block text-sm font-semibold text-foreground mb-2">Estado Asesor *</label>
              <select
                value={callEstado}
                onChange={(e) => setCallEstado(e.target.value)}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
              >
                <option value="">Seleccionar estado...</option>
                {ESTADO_ASESOR_LLAMADA.map((e) => (
                  <option key={e.value} value={e.value}>{e.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Notas de la Llamada</label>
              <textarea
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                placeholder="Escribe aqui las notas de la llamada..."
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
                disabled={!callEstado || saving}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
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
              disabled={!appointmentData.date || !appointmentData.time || saving}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Agendar
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  if (selectedAction === 'cita') {
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
              <h2 className="text-xl font-bold text-foreground">Agendar Cita</h2>
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
              onClick={handleCitaSubmit}
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
              disabled={!appointmentData.date || !appointmentData.time || saving}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Agendar Cita
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
            {user && (
              <p className="text-xs text-muted-foreground mt-0.5">Asesor: {user.name}</p>
            )}
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
