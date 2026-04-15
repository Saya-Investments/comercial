'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X, Phone, CalendarClock, ArrowRight, Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react'
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
  cita: { fecha: string; hora: string; estado: string; tipo?: string; ubicacion?: string | null } | null
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

interface HistScoring {
  id: string
  scoringAnterior: number | null
  scoringNuevo: number | null
  deltaScoring: number | null
  eventoTrigger: string | null
  nivelInteres: number | null
  sentimiento: string | null
  contactabilidad: number | null
  timestamp: string
}

const ESTADO_LABELS: Record<string, string> = {
  No_contesta: 'No contesta',
  No_interesado: 'No interesado',
  Interesado: 'Interesado',
  Llamada_agendada: 'Llamada agendada',
  Cita_agendada: 'Cita agendada',
  Contactado: 'Contactado',
  Seguimiento: 'Seguimiento',
  Venta_cerrada: 'Venta cerrada',
  Prospecto: 'Prospecto',
}

const TIPO_LABELS: Record<string, string> = {
  Llamada: 'Llamada',
  Agendar_llamada: 'Agendar llamada',
  Cita: 'Cita presencial',
}

const TIPO_ICONS: Record<string, typeof Phone> = {
  Llamada: Phone,
  Agendar_llamada: CalendarClock,
  Cita: CalendarClock,
}

const EVENTO_LABELS: Record<string, string> = {
  respuesta_bot: 'Respuesta Bot',
  decaimiento: 'Decaimiento',
  nlp_update: 'NLP Update',
  campana: 'Campaña',
  manual: 'Manual',
  reciclaje: 'Reciclaje',
}

const EVENTO_COLORS: Record<string, string> = {
  respuesta_bot: 'bg-blue-500',
  decaimiento: 'bg-red-500',
  nlp_update: 'bg-purple-500',
  campana: 'bg-amber-500',
  manual: 'bg-gray-500',
  reciclaje: 'bg-cyan-500',
}

const SENTIMIENTO_COLORS: Record<string, string> = {
  positivo: 'text-green-600',
  neutral: 'text-gray-600',
  negativo: 'text-red-600',
}

const ESTADO_COLORS: Record<string, string> = {
  No_contesta: 'bg-gray-100 text-gray-700 border-gray-200',
  No_interesado: 'bg-red-50 text-red-700 border-red-200',
  Interesado: 'bg-green-50 text-green-700 border-green-200',
  Llamada_agendada: 'bg-blue-50 text-blue-700 border-blue-200',
  Cita_agendada: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  Contactado: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  Seguimiento: 'bg-purple-50 text-purple-700 border-purple-200',
  Venta_cerrada: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Prospecto: 'bg-emerald-100 text-emerald-800 border-emerald-300',
}

export function LeadDetailModal({ lead, onClose }: LeadDetailModalProps) {
  const [tab, setTab] = useState<'info' | 'acciones' | 'historial' | 'scoring'>('info')
  const [acciones, setAcciones] = useState<AccionComercial[]>([])
  const [historial, setHistorial] = useState<HistEstado[]>([])
  const [histScoring, setHistScoring] = useState<HistScoring[]>([])
  const [loadingAcciones, setLoadingAcciones] = useState(false)
  const [loadingHistorial, setLoadingHistorial] = useState(false)
  const [loadingScoring, setLoadingScoring] = useState(false)

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
    if (tab === 'scoring' && histScoring.length === 0) {
      setLoadingScoring(true)
      fetch(`/api/hist-scoring?leadId=${lead.id}`)
        .then((r) => r.json())
        .then(setHistScoring)
        .finally(() => setLoadingScoring(false))
    }
  }, [tab, lead.id, acciones.length, historial.length, histScoring.length])

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card className="w-full max-w-3xl flex flex-col max-h-[90vh]">
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
          {(['info', 'acciones', 'historial', 'scoring'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                tab === t
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'info' ? 'Informacion' : t === 'acciones' ? 'Acciones Comerciales' : t === 'historial' ? 'Historial Estado' : 'Historial Scoring'}
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
                          {a.cita.tipo ? ` - ${a.cita.tipo}` : ''}
                          {a.cita.ubicacion ? ` - ${a.cita.ubicacion}` : ''}
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

          {/* TAB: Historial Scoring */}
          {tab === 'scoring' && (
            <div>
              {loadingScoring ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : histScoring.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No hay historial de scoring</p>
              ) : (
                <div className="relative">
                  {/* Linea vertical de la timeline */}
                  <div className="absolute left-[18px] top-2 bottom-2 w-0.5 bg-border" />

                  <div className="space-y-0">
                    {histScoring.map((s) => {
                      const delta = s.deltaScoring ?? 0
                      const isUp = delta > 0
                      const isDown = delta < 0
                      const DeltaIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus
                      const dotColor = isUp ? 'bg-green-500' : isDown ? 'bg-red-500' : 'bg-gray-400'
                      const deltaColor = isUp ? 'text-green-600' : isDown ? 'text-red-600' : 'text-gray-500'
                      const eventColor = EVENTO_COLORS[s.eventoTrigger || ''] || 'bg-gray-500'

                      return (
                        <div key={s.id} className="relative flex gap-4 pb-6 last:pb-0">
                          {/* Dot del timeline */}
                          <div className="relative z-10 flex-shrink-0 mt-1">
                            <div className={`w-[10px] h-[10px] rounded-full ${dotColor} ring-4 ring-background`} />
                          </div>

                          {/* Contenido */}
                          <div className="flex-1 min-w-0 pb-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-foreground text-lg tabular-nums">
                                  {s.scoringNuevo !== null ? (s.scoringNuevo * 100).toFixed(1) + '%' : '-'}
                                </span>
                                {delta !== 0 && (
                                  <span className={`flex items-center gap-0.5 text-xs font-medium ${deltaColor}`}>
                                    <DeltaIcon className="w-3 h-3" />
                                    {isUp ? '+' : ''}{(delta * 100).toFixed(1)}%
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(s.timestamp)}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold text-white ${eventColor}`}>
                                {EVENTO_LABELS[s.eventoTrigger || ''] || s.eventoTrigger || 'Desconocido'}
                              </span>
                              {s.sentimiento && (
                                <span className={`text-xs font-medium ${SENTIMIENTO_COLORS[s.sentimiento] || 'text-gray-500'}`}>
                                  {s.sentimiento.charAt(0).toUpperCase() + s.sentimiento.slice(1)}
                                </span>
                              )}
                            </div>

                            {(s.nivelInteres !== null || s.contactabilidad !== null) && (
                              <div className="flex gap-4 mt-1.5 text-xs text-muted-foreground">
                                {s.nivelInteres !== null && (
                                  <span>Interes: <span className="font-medium text-foreground">{(s.nivelInteres * 100).toFixed(0)}%</span></span>
                                )}
                                {s.contactabilidad !== null && (
                                  <span>Contactabilidad: <span className="font-medium text-foreground">{(s.contactabilidad * 100).toFixed(0)}%</span></span>
                                )}
                              </div>
                            )}

                            {/* Barra visual del scoring */}
                            {s.scoringNuevo !== null && (
                              <div className="mt-2 h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    s.scoringNuevo >= 0.7 ? 'bg-green-500' : s.scoringNuevo >= 0.4 ? 'bg-amber-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${Math.min(s.scoringNuevo * 100, 100)}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
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
