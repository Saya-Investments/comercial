'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Eye, MessageSquare, Briefcase, UserCheck, Clock, CheckCircle2, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { ActionModal } from './modals/action-modal'
import { ProspectModal } from './modals/prospect-modal'
import { ConversationModal } from './modals/conversation-modal'
import { LeadDetailModal } from './modals/lead-detail-modal'
import { CallButtons } from '@/components/calls/call-dock'
import { puedeUsarLlamadas } from '@/lib/demo-access'
import { useAuth } from '@/contexts/auth-context'

interface Lead {
  id: string
  dni: string
  nombre?: string
  apellido?: string
  name: string
  phone: string
  email?: string
  base?: string
  bucket?: string
  status: string
  assignedDate: string
  product: string
  priority: 'Alta' | 'Media' | 'Baja'
  score?: number
  estadoAsesor?: string
  fechaAsignacion?: string | null
  ultimoMensajeLead?: string | null
  gestionado?: boolean
  estadoFunnel?: string | null
  reactivacion?: { escalon: string; ola: number } | null
  ciclo?: 'nuevo' | 'reactivado' | 'archivado' | null
  motivoReactivacion?: { tipo: string; detalle: string } | null
  enCampana?: boolean
  esperando?: boolean
}

type Tab = 'activos' | 'archivados'

// Para el asesor solo existen estas palabras. El motivo de cada reactivacion
// (base tibia, campana, reasignacion) se muestra solo a admin/supervisor.
const CICLO_LABEL: Record<string, string> = {
  nuevo: 'Nuevo',
  reactivado: 'Reactivado',
  archivado: 'Archivado',
}

const CICLO_COLOR: Record<string, string> = {
  nuevo: 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/30 dark:text-sky-200 dark:border-sky-800',
  reactivado: 'bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700',
  archivado: 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
}

interface LeadsTableProps {
  searchTerm: string
  filterPriority?: string
  filterStatus?: string
  filterDate?: string
  filterDateTo?: string
  filterMsgDate?: string
  filterMsgDateTo?: string
  filterAsesor?: string
  filterCallCenter?: string
  filterBase?: string
  filterEstadoAsesor?: string
  filterFunnelEstado?: string
  onEstadoAsesorOptionsChange?: (options: string[]) => void
}

export function LeadsTable({
  searchTerm,
  filterPriority = '',
  filterStatus = '',
  filterDate = '',
  filterDateTo = '',
  filterMsgDate = '',
  filterMsgDateTo = '',
  filterAsesor = '',
  filterCallCenter = '',
  filterBase = '',
  filterEstadoAsesor = '',
  filterFunnelEstado = '',
  onEstadoAsesorOptionsChange,
}: LeadsTableProps) {
  const { user } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [modalType, setModalType] = useState<'action' | 'conversation' | 'detail' | 'prospect' | null>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [tab, setTab] = useState<Tab>('activos')
  const PAGE_SIZE = 15
  const verDetalle = user?.role === 'admin' || user?.role === 'supervisor'

  const fetchLeads = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (searchTerm) params.set('search', searchTerm)
      if (user?.id) params.set('userId', user.id)
      if (user?.role) params.set('role', user.role)
      if (filterAsesor) params.set('asesorId', filterAsesor)
      if (filterCallCenter) params.set('callCenterId', filterCallCenter)
      const res = await fetch(`/api/leads?${params}`)
      if (res.ok) {
        const data = await res.json()
        setLeads(data)
      }
    } catch (e) {
      console.error('Error fetching leads:', e)
    } finally {
      setLoading(false)
    }
  }, [searchTerm, user?.id, user?.role, filterAsesor, filterCallCenter])

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  // Timer que fuerza re-render cada minuto para actualizar countdowns
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!onEstadoAsesorOptionsChange) return
    const unique = Array.from(
      new Set(leads.map((l) => l.estadoAsesor).filter((e): e is string => !!e))
    ).sort()
    onEstadoAsesorOptionsChange(unique)
  }, [leads, onEstadoAsesorOptionsChange])

  // Sin ciclo (call center) no hay tabs: se ve la lista completa como antes.
  const conCiclo = leads.some((l) => !!l.ciclo)
  // El buscador encuentra en toda la cartera (tambien los archivados), asi el
  // asesor ubica a un cliente de hace meses que lo llama directo.
  const buscando = searchTerm.trim().length > 0
  const esActivo = (l: Lead) => l.ciclo === 'nuevo' || l.ciclo === 'reactivado'
  // Archivados del asesor: sin los que una campana acaba de contactar, para que
  // no lo llame a la vez que el bot. Admin/supervisor los ven todos.
  const enArchivados = (l: Lead) => l.ciclo === 'archivado' && (verDetalle || !l.enCampana)
  const totalActivos = leads.filter(esActivo).length
  const totalArchivados = leads.filter(enArchivados).length

  const filteredLeads = leads.filter((lead) => {
    if (conCiclo && !buscando) {
      if (tab === 'activos' && !esActivo(lead)) return false
      if (tab === 'archivados' && !enArchivados(lead)) return false
    }
    const matchesPriority = !filterPriority || lead.priority === filterPriority
    const matchesStatus = !filterStatus || lead.status === filterStatus
    const matchesDate = !filterDate || lead.assignedDate >= filterDate
    const matchesDateTo = !filterDateTo || lead.assignedDate <= filterDateTo
    const matchesBase = !filterBase || (lead.base || 'Caliente') === filterBase
    const matchesEstadoAsesor = !filterEstadoAsesor || lead.estadoAsesor === filterEstadoAsesor
    const matchesFunnelEstado = !filterFunnelEstado || lead.estadoFunnel === filterFunnelEstado
    const msgDay = lead.ultimoMensajeLead ? lead.ultimoMensajeLead.slice(0, 10) : ''
    const matchesMsgDate = !filterMsgDate || (msgDay && msgDay >= filterMsgDate)
    const matchesMsgDateTo = !filterMsgDateTo || (msgDay && msgDay <= filterMsgDateTo)
    return matchesPriority && matchesStatus && matchesDate && matchesDateTo && matchesBase && matchesEstadoAsesor && matchesFunnelEstado && matchesMsgDate && matchesMsgDateTo
  })

  useEffect(() => {
    setCurrentPage(0)
  }, [searchTerm, filterPriority, filterStatus, filterDate, filterDateTo, filterMsgDate, filterMsgDateTo, filterAsesor, filterCallCenter, filterBase, filterEstadoAsesor, filterFunnelEstado, tab])

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages - 1)
  const pagedLeads = filteredLeads.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const handleAction = (lead: Lead, type: 'action' | 'conversation' | 'detail' | 'prospect') => {
    setSelectedLead(lead)
    setModalType(type)
  }

  const isProspect = (lead: Lead) => lead.estadoAsesor === 'Prospecto'

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Alta': return 'bg-green-100 text-green-700 border border-green-300'
      case 'Media': return 'bg-yellow-100 text-yellow-700 border border-yellow-300'
      case 'Baja': return 'bg-red-100 text-red-700 border border-red-300'
      default: return ''
    }
  }

  const getBaseColor = (base: string) => {
    return base === 'Caliente'
      ? 'bg-orange-100 text-orange-700 border border-orange-300'
      : 'bg-blue-100 text-blue-700 border border-blue-300'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'asignado': return 'bg-green-50 text-green-700 border border-green-200'
      case 'en_gestion': return 'bg-yellow-50 text-yellow-700 border border-yellow-200'
      case 'descartado': return 'bg-red-50 text-red-700 border border-red-200'
      default: return 'bg-gray-50 text-gray-700 border border-gray-200'
    }
  }

  // Tiene que ser el MISMO valor que HORAS_LIMITE en
  // app/api/cron/reasignaciones/route.ts. Estaba fijo en 24 cuando el cron
  // paso a 48: el lead se pintaba "Vencido" y despues seguia un dia entero en
  // la lista, asi que los asesores veian alarmas de leads que nadie les iba a
  // quitar. Si se cambia alla, cambiar aca.
  const HORAS_LIMITE = 48

  const getCountdown = (fechaAsignacion?: string | null) => {
    if (!fechaAsignacion) return null
    const asignado = new Date(fechaAsignacion).getTime()
    const limite = asignado + HORAS_LIMITE * 60 * 60 * 1000
    const restante = limite - Date.now()

    if (restante <= 0) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 border border-red-300"><Clock className="w-3 h-3" />Vencido</span>
    }

    const horas = Math.floor(restante / (1000 * 60 * 60))
    const minutos = Math.floor((restante % (1000 * 60 * 60)) / (1000 * 60))

    // Los cortes de color son proporcionales a la ventana: rojo en el ultimo
    // sexto, ambar en la ultima mitad. Estaban fijos en 4h y 12h, calibrados
    // para una ventana de 24h.
    const color = horas < HORAS_LIMITE / 6
      ? 'bg-red-50 text-red-600 border border-red-200'
      : horas < HORAS_LIMITE / 2
        ? 'bg-amber-50 text-amber-600 border border-amber-200'
        : 'bg-green-50 text-green-600 border border-green-200'

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${color}`}>
        <Clock className="w-3 h-3" />
        {horas}h {minutos}m
      </span>
    )
  }

  const formatUltimoMensaje = (iso?: string | null) => {
    if (!iso) return <span className="text-xs text-muted-foreground">--</span>
    const d = new Date(iso)
    if (isNaN(d.getTime())) return <span className="text-xs text-muted-foreground">--</span>
    const fecha = d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const hora = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
    return (
      <span className="text-foreground">
        {fecha} <span className="text-muted-foreground">{hora}</span>
      </span>
    )
  }

  const getScoreBadge = (score?: number) => {
    if (score === undefined) return <span className="text-sm text-muted-foreground">--</span>
    if (score >= 70) return <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">{score}</span>
    if (score >= 40) return <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">{score}</span>
    return <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">{score}</span>
  }

  const exportCSV = (leads: Lead[]) => {
    const headers = ['id','dni','name','phone','status','assignedDate','product','priority','score']
    const rows = leads.map(l => [l.id,l.dni,l.name,l.phone,l.status,l.assignedDate,l.product,l.priority,(l.score ?? '')])
    const csv = [headers.join(','), ...rows.map(r => r.map(String).map(s => `"${s.replace(/"/g,'""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads_export_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchLeads()
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">Cargando leads...</div>
  }

  return (
    <div className="p-6">
      {conCiclo && (
        <div className="flex items-end gap-1 mb-4 border-b border-border">
          {([
            ['activos', 'Activos', totalActivos],
            ['archivados', 'Archivados', totalArchivados],
          ] as const).map(([key, label, total]) => {
            const activa = !buscando && tab === key
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-4 py-2 -mb-px text-sm font-medium border-b-2 transition-colors ${
                  activa
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
                <span className={`ml-2 inline-flex items-center justify-center rounded-full px-2 text-xs ${
                  activa ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                }`}>
                  {total.toLocaleString()}
                </span>
              </button>
            )
          })}
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-muted-foreground">
          {conCiclo && buscando
            ? `${filteredLeads.length} leads encontrados en todos tus leads`
            : conCiclo
              ? `${filteredLeads.length} leads ${tab === 'activos' ? 'activos' : 'archivados'}`
              : `${filteredLeads.length} leads encontrados`}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-muted-foreground"
            title="Recargar leads (mantiene filtros)"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Actualizando...' : 'Actualizar'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportCSV(filteredLeads)} className="text-muted-foreground">
            Exportar data
          </Button>
        </div>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary">
                <th className="px-6 py-3 text-left font-semibold text-foreground">DNI</th>
                <th className="px-6 py-3 text-left font-semibold text-foreground">Nombre</th>
                <th className="px-6 py-3 text-left font-semibold text-foreground">Telefono</th>
                <th className="px-6 py-3 text-left font-semibold text-foreground">Scoring</th>
                <th className="px-6 py-3 text-left font-semibold text-foreground">Estado</th>
                <th className="px-6 py-3 text-left font-semibold text-foreground">Fecha</th>
                <th className="px-6 py-3 text-left font-semibold text-foreground">Último mensaje lead</th>
                <th className="px-6 py-3 text-left font-semibold text-foreground">Estado Funnel</th>
                <th className="px-6 py-3 text-left font-semibold text-foreground">Prioridad</th>
                {user?.role === 'admin' && <th className="px-6 py-3 text-left font-semibold text-foreground">Base</th>}
                <th className="px-6 py-3 text-center font-semibold text-foreground">Reasignacion</th>
                <th className="px-6 py-3 text-center font-semibold text-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pagedLeads.length > 0 ? pagedLeads.map((lead) => {
                // En la pestana Archivados todos son archivados: la etiqueta solo
                // aporta en Activos y en los resultados del buscador.
                const mostrarCiclo = !!lead.ciclo && (buscando || lead.ciclo !== 'archivado')
                const tituloCiclo = verDetalle
                  ? lead.motivoReactivacion?.detalle ?? (lead.enCampana ? 'Contactado por una campaña en los últimos días' : undefined)
                  : undefined
                return (
                <Fragment key={lead.id}>
                <tr
                  className={`border-b border-border transition-colors ${
                    isProspect(lead)
                      ? 'bg-emerald-50/80 hover:bg-emerald-100/80'
                      : 'hover:bg-secondary/50'
                  }`}
                >
                  <td className="px-6 py-4 font-mono text-foreground">{lead.dni}</td>
                  <td className="px-6 py-4 font-medium text-foreground">
                    {lead.name}
                    {mostrarCiclo && (
                      <span
                        title={tituloCiclo}
                        className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold align-middle ${CICLO_COLOR[lead.ciclo as string]} ${tituloCiclo ? 'cursor-help' : ''}`}
                      >
                        {CICLO_LABEL[lead.ciclo as string]}
                      </span>
                    )}
                    {verDetalle && lead.ciclo === 'archivado' && lead.enCampana && (
                      <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium align-middle bg-violet-50 text-violet-700 border border-violet-200">
                        En campaña
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-foreground">{lead.phone}</td>
                  <td className="px-6 py-4">
                    {lead.reactivacion
                      ? <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">Alta</span>
                      : getScoreBadge(lead.score)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(lead.status)}`}>{lead.status}</span>
                  </td>
                  <td className="px-6 py-4 text-foreground">{lead.assignedDate}</td>
                  <td className="px-6 py-4">{formatUltimoMensaje(lead.ultimoMensajeLead)}</td>
                  <td className="px-6 py-4">
                    {lead.estadoFunnel
                      ? <span className="px-2 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap">{lead.estadoFunnel}</span>
                      : lead.status === 'en_gestion'
                        ? <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">Gestión Bot</span>
                        : lead.status === 'asignado' && lead.gestionado
                          ? <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap">Gestionado Asesor</span>
                          : lead.status === 'asignado'
                            ? <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">Asignado</span>
                            : lead.status === 'descartado'
                              ? <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">Descartado</span>
                              : <span className="text-xs text-muted-foreground">—</span>
                    }
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(lead.reactivacion ? 'Alta' : lead.priority)}`}>{lead.reactivacion ? 'Alta' : lead.priority}</span>
                  </td>
                  {user?.role === 'admin' && (
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getBaseColor(lead.base || 'Caliente')}`}>{lead.base || 'Caliente'}</span>
                    </td>
                  )}
                  <td className="px-6 py-4 text-center">
                    {lead.ciclo === 'archivado' || lead.esperando ? (
                      // Archivado: sin actividad hace +30 dias, no hay plazo que correr.
                      // Esperando: el bot lo reactivo y registro una accion a nombre del
                      // asesor; mostrar "Gestionado" seria falso (nadie lo atendio aun).
                      <span className="text-xs text-muted-foreground">--</span>
                    ) : lead.gestionado ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
                        Gestionado
                      </span>
                    ) : (
                      getCountdown(lead.fechaAsignacion) || <span className="text-xs text-muted-foreground">--</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAction(lead, 'action')}
                        className={isProspect(lead)
                          ? 'text-muted-foreground opacity-40 cursor-not-allowed hover:bg-transparent'
                          : 'text-foreground hover:bg-secondary'
                        }
                        title={isProspect(lead) ? 'No disponible: lead registrado como prospecto' : 'Acciones comerciales'}
                        disabled={isProspect(lead)}
                      >
                        <Briefcase className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleAction(lead, 'conversation')} className="text-foreground hover:bg-secondary" title="Ver conversacion">
                        <MessageSquare className="w-4 h-4" />
                      </Button>
                      {/* Llamar / videollamar sin salir de la lista (abre el dock) */}
                      {puedeUsarLlamadas(user) && (
                        <CallButtons lead={{ id: lead.id, name: lead.name, phone: lead.phone }} />
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleAction(lead, 'detail')} className="text-foreground hover:bg-secondary" title="Ver detalle">
                        <Eye className="w-4 h-4" />
                      </Button>
                      {(user?.role === 'asesor' || user?.role === 'call center') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAction(lead, 'prospect')}
                          className={lead.estadoAsesor === 'Venta_cerrada' && !isProspect(lead)
                            ? 'text-green-600 hover:bg-green-50'
                            : 'text-muted-foreground opacity-50 cursor-not-allowed'
                          }
                          disabled={lead.estadoAsesor !== 'Venta_cerrada' || isProspect(lead)}
                          title={isProspect(lead)
                            ? 'Lead ya registrado como prospecto'
                            : lead.estadoAsesor === 'Venta_cerrada'
                              ? 'Registrar como prospecto'
                              : 'Requiere estado "Venta cerrada"'}
                        >
                          <UserCheck className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
                </Fragment>
                )
              }) : (
                <tr>
                  <td colSpan={12} className="px-6 py-12 text-center text-muted-foreground">No se encontraron leads con los filtros aplicados</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {filteredLeads.length > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-muted-foreground">
            Mostrando {safePage * PAGE_SIZE + 1}-{Math.min((safePage + 1) * PAGE_SIZE, filteredLeads.length)} de {filteredLeads.length.toLocaleString()} leads
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={safePage === 0}
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              Página {safePage + 1} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={safePage >= totalPages - 1}
              onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {modalType === 'action' && selectedLead && <ActionModal lead={selectedLead} onClose={() => setModalType(null)} onActionSaved={() => { setModalType(null); fetchLeads() }} />}
      {modalType === 'conversation' && selectedLead && <ConversationModal lead={selectedLead} onClose={() => setModalType(null)} />}
      {modalType === 'detail' && selectedLead && <LeadDetailModal lead={selectedLead} onClose={() => setModalType(null)} />}
      {modalType === 'prospect' && selectedLead && <ProspectModal lead={selectedLead} onClose={() => setModalType(null)} onProspectSaved={() => { setModalType(null); fetchLeads() }} />}
    </div>
  )
}
