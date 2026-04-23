'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Eye, MessageSquare, Briefcase, UserCheck, Clock, CheckCircle2 } from 'lucide-react'
import { ActionModal } from './modals/action-modal'
import { ProspectModal } from './modals/prospect-modal'
import { ConversationModal } from './modals/conversation-modal'
import { LeadDetailModal } from './modals/lead-detail-modal'
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
  gestionado?: boolean
}

interface LeadsTableProps {
  searchTerm: string
  filterPriority?: string
  filterStatus?: string
  filterDate?: string
  filterDateTo?: string
  filterAsesor?: string
  filterBase?: string
  filterEstadoAsesor?: string
  onEstadoAsesorOptionsChange?: (options: string[]) => void
}

export function LeadsTable({
  searchTerm,
  filterPriority = '',
  filterStatus = '',
  filterDate = '',
  filterDateTo = '',
  filterAsesor = '',
  filterBase = '',
  filterEstadoAsesor = '',
  onEstadoAsesorOptionsChange,
}: LeadsTableProps) {
  const { user } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [modalType, setModalType] = useState<'action' | 'conversation' | 'detail' | 'prospect' | null>(null)

  const fetchLeads = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (searchTerm) params.set('search', searchTerm)
      if (user?.id) params.set('userId', user.id)
      if (user?.role) params.set('role', user.role)
      if (filterAsesor) params.set('asesorId', filterAsesor)
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
  }, [searchTerm, user?.id, user?.role, filterAsesor])

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

  const filteredLeads = leads.filter((lead) => {
    const matchesPriority = !filterPriority || lead.priority === filterPriority
    const matchesStatus = !filterStatus || lead.status === filterStatus
    const matchesDate = !filterDate || lead.assignedDate >= filterDate
    const matchesDateTo = !filterDateTo || lead.assignedDate <= filterDateTo
    const matchesBase = !filterBase || (lead.base || 'Caliente') === filterBase
    const matchesEstadoAsesor = !filterEstadoAsesor || lead.estadoAsesor === filterEstadoAsesor
    return matchesPriority && matchesStatus && matchesDate && matchesDateTo && matchesBase && matchesEstadoAsesor
  })

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

  const getCountdown = (fechaAsignacion?: string | null) => {
    if (!fechaAsignacion) return null
    const asignado = new Date(fechaAsignacion).getTime()
    const limite = asignado + 24 * 60 * 60 * 1000
    const restante = limite - Date.now()

    if (restante <= 0) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 border border-red-300"><Clock className="w-3 h-3" />Vencido</span>
    }

    const horas = Math.floor(restante / (1000 * 60 * 60))
    const minutos = Math.floor((restante % (1000 * 60 * 60)) / (1000 * 60))

    const color = horas < 4
      ? 'bg-red-50 text-red-600 border border-red-200'
      : horas < 12
        ? 'bg-amber-50 text-amber-600 border border-amber-200'
        : 'bg-green-50 text-green-600 border border-green-200'

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${color}`}>
        <Clock className="w-3 h-3" />
        {horas}h {minutos}m
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

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">Cargando leads...</div>
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-muted-foreground">{filteredLeads.length} leads encontrados</div>
        <Button size="sm" variant="outline" onClick={() => exportCSV(filteredLeads)} className="text-muted-foreground">
          Exportar data
        </Button>
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
                <th className="px-6 py-3 text-left font-semibold text-foreground">Producto</th>
                <th className="px-6 py-3 text-left font-semibold text-foreground">Prioridad</th>
                <th className="px-6 py-3 text-left font-semibold text-foreground">Base</th>
                <th className="px-6 py-3 text-center font-semibold text-foreground">Reasignacion</th>
                <th className="px-6 py-3 text-center font-semibold text-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length > 0 ? filteredLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className={`border-b border-border transition-colors ${
                    isProspect(lead)
                      ? 'bg-emerald-50/80 hover:bg-emerald-100/80'
                      : 'hover:bg-secondary/50'
                  }`}
                >
                  <td className="px-6 py-4 font-mono text-foreground">{lead.dni}</td>
                  <td className="px-6 py-4 font-medium text-foreground">{lead.name}</td>
                  <td className="px-6 py-4 text-foreground">{lead.phone}</td>
                  <td className="px-6 py-4">{getScoreBadge(lead.score)}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(lead.status)}`}>{lead.status}</span>
                  </td>
                  <td className="px-6 py-4 text-foreground">{lead.assignedDate}</td>
                  <td className="px-6 py-4 text-foreground">{lead.product}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(lead.priority)}`}>{lead.priority}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getBaseColor(lead.base || 'Caliente')}`}>{lead.base || 'Caliente'}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {lead.gestionado ? (
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
                      <Button variant="ghost" size="sm" onClick={() => handleAction(lead, 'detail')} className="text-foreground hover:bg-secondary" title="Ver detalle">
                        <Eye className="w-4 h-4" />
                      </Button>
                      {user?.role === 'asesor' && (
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
              )) : (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-muted-foreground">No se encontraron leads con los filtros aplicados</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {modalType === 'action' && selectedLead && <ActionModal lead={selectedLead} onClose={() => setModalType(null)} onActionSaved={() => { setModalType(null); fetchLeads() }} />}
      {modalType === 'conversation' && selectedLead && <ConversationModal lead={selectedLead} onClose={() => setModalType(null)} />}
      {modalType === 'detail' && selectedLead && <LeadDetailModal lead={selectedLead} onClose={() => setModalType(null)} />}
      {modalType === 'prospect' && selectedLead && <ProspectModal lead={selectedLead} onClose={() => setModalType(null)} onProspectSaved={() => { setModalType(null); fetchLeads() }} />}
    </div>
  )
}
