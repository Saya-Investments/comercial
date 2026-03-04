'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X } from 'lucide-react'

interface Appointment {
  id: string
  title: string
  leadName: string
  date: string
  time: string
  location?: string
  description?: string
  type: 'llamada' | 'reunion' | 'video'
  status: 'active' | 'cancelled'
}

interface AppointmentModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (appointment: Appointment) => void
  appointment?: Appointment
}

export function AppointmentModal({ isOpen, onClose, onSave, appointment }: AppointmentModalProps) {
  const [formData, setFormData] = useState<Appointment>({
    id: appointment?.id || Date.now().toString(),
    title: appointment?.title || '',
    leadName: appointment?.leadName || '',
    date: appointment?.date || new Date().toISOString().split('T')[0],
    time: appointment?.time || '10:00',
    location: appointment?.location || '',
    description: appointment?.description || '',
    type: appointment?.type || 'llamada',
    status: appointment?.status || 'active'
  })

  useEffect(() => {
    if (appointment) {
      setFormData(appointment)
    }
  }, [appointment])

  const handleChange = (field: keyof Appointment, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = () => {
    if (!formData.title || !formData.leadName || !formData.date || !formData.time) {
      alert('Por favor completa los campos obligatorios')
      return
    }
    onSave(formData)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card className="w-full max-w-md bg-card flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-foreground">
              {appointment ? 'Editar Cita' : 'Nueva Cita'}
            </h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                Título de la Cita *
              </label>
              <Input
                value={formData.title}
                onChange={(e) => handleChange('title', e.target.value)}
                placeholder="Ej: Seguimiento de propuesta"
                className="w-full"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                Lead / Contacto *
              </label>
              <Input
                value={formData.leadName}
                onChange={(e) => handleChange('leadName', e.target.value)}
                placeholder="Nombre del cliente"
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  Fecha *
                </label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleChange('date', e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  Hora *
                </label>
                <Input
                  type="time"
                  value={formData.time}
                  onChange={(e) => handleChange('time', e.target.value)}
                  className="w-full"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                Tipo de Cita
              </label>
              <select
                value={formData.type}
                onChange={(e) => handleChange('type', e.target.value as 'llamada' | 'reunion' | 'video')}
                className="w-full px-3 py-2 border border-border rounded-md bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="llamada">Llamada Telefónica</option>
                <option value="reunion">Reunión Presencial</option>
                <option value="video">Videollamada</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                Ubicación
              </label>
              <Input
                value={formData.location}
                onChange={(e) => handleChange('location', e.target.value)}
                placeholder="Ej: Oficina Principal"
                className="w-full"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                Descripción
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder="Notas adicionales..."
                rows={3}
                className="w-full px-3 py-2 border border-border rounded-md bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                onClick={onClose}
                variant="outline"
                className="flex-1 bg-transparent"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {appointment ? 'Actualizar' : 'Programar'} Cita
              </Button>
            </div>
        </div>

        <div className="p-6 border-t border-border flex justify-end gap-3 flex-shrink-0">
          <Button
            onClick={onClose}
            variant="outline"
            className="bg-transparent"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {appointment ? 'Actualizar' : 'Programar'} Cita
          </Button>
        </div>
      </Card>
    </div>
  )
}
