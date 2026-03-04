'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Clock, MapPin, User, X } from 'lucide-react'
import { AppointmentModal } from './modals/appointment-modal'

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

export function CalendarModule() {
  const [appointments, setAppointments] = useState<Appointment[]>([
    {
      id: '1',
      title: 'Seguimiento de propuesta',
      leadName: 'Juan González',
      date: '2026-02-10',
      time: '10:00',
      location: 'Oficina Principal',
      description: 'Seguimiento a propuesta enviada',
      type: 'reunion',
      status: 'active'
    },
    {
      id: '2',
      title: 'Llamada de ventas',
      leadName: 'María Rodriguez',
      date: '2026-02-11',
      time: '14:00',
      description: 'Llamada para cerrar venta',
      type: 'llamada',
      status: 'active'
    },
  ])

  const [showModal, setShowModal] = useState(false)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null)

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay()
  }

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ]
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sab']

  const daysInMonth = getDaysInMonth(currentDate)
  const firstDay = getFirstDayOfMonth(currentDate)
  const days = Array(firstDay).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1))

  const handleAddAppointment = (appointment: Appointment) => {
    if (editingAppointment) {
      setAppointments(appointments.map(a => a.id === editingAppointment.id ? appointment : a))
      setEditingAppointment(null)
    } else {
      setAppointments([...appointments, appointment])
    }
    setShowModal(false)
  }

  const handleDelete = (id: string) => {
    setAppointments(appointments.filter(a => a.id !== id))
  }

  const handleEdit = (appointment: Appointment) => {
    setEditingAppointment(appointment)
    setShowModal(true)
  }

  const handleToggleCancel = (id: string) => {
    setAppointments(appointments.map(a => 
      a.id === id ? { ...a, status: a.status === 'active' ? 'cancelled' : 'active' } : a
    ))
  }

  const appointmentsToday = appointments.filter(a => a.date === currentDate.toISOString().split('T')[0])

  const appointmentsByDate = (date: number) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`
    return appointments.filter(a => a.date === dateStr)
  }

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-foreground">Calendario de Citas</h1>
          <Button 
            onClick={() => {
              setEditingAppointment(null)
              setShowModal(true)
            }}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nueva Cita
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-foreground">
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}
                  className="px-3"
                >
                  ←
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setCurrentDate(new Date())}
                  className="px-4"
                >
                  Hoy
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}
                  className="px-3"
                >
                  →
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {dayNames.map(day => (
                <div key={day} className="text-center font-semibold text-sm text-muted-foreground py-2">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {days.map((day, idx) => (
                <div
                  key={idx}
                  className={`aspect-square p-1 border rounded-lg ${
                    day === null ? 'bg-secondary' : 'border-border bg-card hover:bg-secondary cursor-pointer'
                  }`}
                >
                  {day && (
                    <div className="h-full flex flex-col">
                      <span className="text-xs font-semibold text-foreground">{day}</span>
                      <div className="flex-1 flex flex-col gap-0.5 mt-1 overflow-y-auto">
                        {appointmentsByDate(day as number).map(apt => (
                          <div
                            key={apt.id}
                            className={`text-xs px-1 py-0.5 rounded cursor-pointer hover:opacity-80 transition-opacity ${
                              apt.status === 'cancelled' ? 'opacity-50' : 'opacity-100'
                            } ${
                              apt.type === 'llamada' ? 'bg-blue-500' :
                              apt.type === 'reunion' ? 'bg-primary' : 'bg-purple-500'
                            } text-white font-medium truncate`}
                            onClick={() => handleEdit(apt)}
                            title={`${apt.time} - ${apt.title}${apt.status === 'cancelled' ? ' (CANCELADO)' : ''}`}
                          >
                            <span className={apt.status === 'cancelled' ? 'line-through' : ''}>
                              {apt.time} {apt.title.slice(0, 10)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Próximas Citas</h3>
            <div className="space-y-3 max-h-96 overflow-auto">
              {appointments.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">No hay citas programadas</p>
              ) : (
                appointments
                  .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
                  .slice(0, 10)
                  .map(apt => (
                    <div key={apt.id} className={`p-3 bg-secondary rounded-lg border transition-all ${
                      apt.status === 'cancelled' 
                        ? 'border-red-500/30 opacity-60' 
                        : 'border-border hover:border-primary'
                    }`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className={`font-semibold text-sm text-foreground ${
                            apt.status === 'cancelled' ? 'line-through text-muted-foreground' : ''
                          }`}>{apt.title}</p>
                          {apt.status === 'cancelled' && (
                            <p className="text-xs font-semibold text-red-600 mt-1">CANCELADO</p>
                          )}
                          <div className="space-y-1 mt-2">
                            <div className="flex items-center text-xs text-muted-foreground gap-2">
                              <User className="w-3 h-3" />
                              {apt.leadName}
                            </div>
                            <div className="flex items-center text-xs text-muted-foreground gap-2">
                              <Clock className="w-3 h-3" />
                              {apt.date} {apt.time}
                            </div>
                            {apt.location && (
                              <div className="flex items-center text-xs text-muted-foreground gap-2">
                                <MapPin className="w-3 h-3" />
                                {apt.location}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 flex-col">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEdit(apt)}
                            className="text-xs h-7"
                          >
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleCancel(apt.id)}
                            className={`text-xs h-7 ${
                              apt.status === 'cancelled' 
                                ? 'text-green-600 hover:text-green-700' 
                                : 'text-red-600 hover:text-red-700'
                            }`}
                          >
                            {apt.status === 'cancelled' ? 'Reactivar' : 'Cancelar'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </Card>
        </div>
      </div>

      {showModal && (
        <AppointmentModal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false)
            setEditingAppointment(null)
          }}
          onSave={handleAddAppointment}
          appointment={editingAppointment || undefined}
        />
      )}
    </div>
  )
}
