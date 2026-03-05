'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X, Phone, CalendarClock, Handshake, ArrowRight, Loader2 } from 'lucide-react'
import { useState, useEffect } from 'react'

interface LeadDetailModalProps {
  lead: {
    id: string
    dni: string
    name: string
    phone: string
    status: string
    assignedDate: string
    product: string
    priority: string
  }
  onClose: () => void
}

interface AccionComercial {
  id: string
  userName: string
  tipoAccion: string
  estadoAsesor: string
  observaciones: string | null
  cita: { fecha: string; hora: string; estado: string } | null
  fecha: string
}

interface HistEstado {
  id: string
  estadoAnterior: string | null
  estadoNuevo: string
  fecha: string
  usuario: string
  tipoAccion: string
  observaciones: string | null
}

const ESTADO_LABELS: Record<string, string> = {
  No_contesta: 'No contesta',
  No_interesado: 'No interesado',
  Interesado: 'Interesado',
  Llamada_agendada: 'Llamada agendada',
  Contactado: 'Contactado',
  Seguimiento: 'Seguimiento',
  Venta_cerrada: 'Venta cerrada',
}

const TIPO_LABELS: Record<string, string> = {
  Llamada: 'Llamada',
  Agendar_llamada: 'Agendar llamada',
  Cita: 'Cita',
}

const TIPO_ICONS: Record<string, typeof Phone> = {
  Llamada: Phone,
  Agendar_llamada: CalendarClock,
  Cita: Handshake,
}

const ESTADO_COLORS: Record<string, string> = {
  No_contesta: 'bg-gray-100 text-gray-700 border-gray-200',
  No_interesado: 'bg-red-50 text-red-700 border-red-200',
  Interesado: 'bg-green-50 text-green-700 border-green-200',
  Llamada_agendada: 'bg-blue-50 text-blue-700 border-blue-200',
  Contactado: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  Seguimiento: 'bg-purple-50 text-purple-700 border-purple-200',
  Venta_cerrada: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

export function LeadDetailModal({ lead, onClose }: LeadDetailModalProps) {
  const [tab, setTab] = useState<'info' | 'acciones' | 'historial'>('info')
  const [acciones, setAcciones] = useState<AccionComercial[]>([])
  const [historial, setHistorial] = useState<HistEstado[]>([])
  const [loadingAcciones, setLoadingAcciones] = useState(false)
  const [loadingHistorial, setLoadingHistorial] = useState(false)

  useEffect(() => {
    if (tab === 'acciones' && acciones.length === 0) {
      setLoadingAcciones(true)
      fetch(`/api/acciones-comerciales?leadId=${lead.id}`)
        .then((r) => r.json())
        .then(setAcciones)
        .finally(() => setLoadingAcciones(false))
    }
    if (tab === 'historial' && historial.length === 0) {
      setLoadingHistorial(true)
      fetch(`/api/hist-estado-asesor?leadId=${lead.id}`)
        .then((r) => r.json())
        .then(setHistorial)
        .finally(() => setLoadingHistorial(false))
    }
  }, [tab, lead.id, acciones.length, historial.length])

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card className="w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-6 border-b border-border flex-shrink-0">
          <h2 className="text-xl font-bold text-foreground">Detalle del Lead</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-secondary rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-foreground" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border flex-shrink-0">
          {(['info', 'acciones', 'historial'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                tab === t
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'info' ? 'Informacion' : t === 'acciones' ? 'Acciones Comerciales' : 'Historial Estado'}
            </button>
          ))}
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {/* TAB: Info */}
          {tab === 'info' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-semibold text-muted-foreground">DNI</label>
                  <p className="text-foreground font-mono mt-1">{lead.dni}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-muted-foreground">Nombre</label>
                  <p className="text-foreground mt-1">{lead.name}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-muted-foreground">Telefono</label>
                  <p className="text-foreground mt-1">{lead.phone}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-muted-foreground">Estado</label>
                  <p className="text-foreground mt-1">{lead.status}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-muted-foreground">Fecha Asignacion</label>
                  <p className="text-foreground mt-1">{lead.assignedDate}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-muted-foreground">Producto de Interes</label>
                  <p className="text-foreground mt-1">{lead.product}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-muted-foreground">Prioridad</label>
                  <p className="text-foreground mt-1 font-semibold">{lead.priority}</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Acciones Comerciales */}
          {tab === 'acciones' && (
            <div className="space-y-3">
              {loadingAcciones ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : acciones.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No hay acciones comerciales registradas</p>
              ) : (
                acciones.map((a) => {
                  const Icon = TIPO_ICONS[a.tipoAccion] || Phone
                  return (
                    <div key={a.id} className="p-4 border border-border rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium text-foreground text-sm">
                            {TIPO_LABELS[a.tipoAccion] || a.tipoAccion}
                          </span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${ESTADO_COLORS[a.estadoAsesor] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                          {ESTADO_LABELS[a.estadoAsesor] || a.estadoAsesor}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {a.userName} - {formatDate(a.fecha)}
                      </div>
                      {a.observaciones && (
                        <p className="text-sm text-foreground bg-secondary/50 p-2 rounded">{a.observaciones}</p>
                      )}
                      {a.cita && (
                        <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded border border-blue-100">
                          Cita: {a.cita.fecha} a las {a.cita.hora} ({a.cita.estado})
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* TAB: Historial Estado Asesor */}
          {tab === 'historial' && (
            <div className="space-y-3">
              {loadingHistorial ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : historial.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No hay historial de estados</p>
              ) : (
                historial.map((h) => (
                  <div key={h.id} className="p-4 border border-border rounded-lg space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${ESTADO_COLORS[h.estadoAnterior || ''] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {h.estadoAnterior ? (ESTADO_LABELS[h.estadoAnterior] || h.estadoAnterior) : 'Sin estado'}
                      </span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${ESTADO_COLORS[h.estadoNuevo] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                        {ESTADO_LABELS[h.estadoNuevo] || h.estadoNuevo}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {h.usuario} via {TIPO_LABELS[h.tipoAccion] || h.tipoAccion} - {formatDate(h.fecha)}
                    </div>
                    {h.observaciones && (
                      <p className="text-sm text-foreground bg-secondary/50 p-2 rounded">{h.observaciones}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border flex justify-end gap-3 flex-shrink-0">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </Card>
    </div>
  )
}
