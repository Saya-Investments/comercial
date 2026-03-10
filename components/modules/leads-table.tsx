'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Eye, MessageSquare, Briefcase } from 'lucide-react'
import { ActionModal } from './modals/action-modal'
import { ConversationModal } from './modals/conversation-modal'
import { LeadDetailModal } from './modals/lead-detail-modal'
import { useAuth } from '@/contexts/auth-context'

interface Lead {
  id: string
  dni: string
  name: string
  phone: string
  status: string
  assignedDate: string
  product: string
  priority: 'Alta' | 'Media' | 'Baja'
  score?: number
}

interface LeadsTableProps {
  searchTerm: string
  filterPriority?: string
  filterStatus?: string
  filterDate?: string
}

export function LeadsTable({ searchTerm, filterPriority = '', filterStatus = '', filterDate = '' }: LeadsTableProps) {
  const { user } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [modalType, setModalType] = useState<'action' | 'conversation' | 'detail' | null>(null)

  const fetchLeads = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (searchTerm) params.set('search', searchTerm)
      if (user?.id) params.set('userId', user.id)
      if (user?.role) params.set('role', user.role)
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
  }, [searchTerm, user?.id, user?.role])

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  const filteredLeads = leads.filter((lead) => {
    const matchesPriority = !filterPriority || lead.priority === filterPriority
    const matchesStatus = !filterStatus || lead.status === filterStatus
    const matchesDate = !filterDate || lead.assignedDate >= filterDate
    return matchesPriority && matchesStatus && matchesDate
  })

  const handleAction = (lead: Lead, type: 'action' | 'conversation' | 'detail') => {
    setSelectedLead(lead)
    setModalType(type)
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Alta': return 'bg-accent/10 text-accent border border-accent/20'
      case 'Media': return 'bg-primary/10 text-primary border border-primary/20'
      case 'Baja': return 'bg-muted text-muted-foreground border border-muted/50'
      default: return ''
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'asignado': return 'bg-green-50 text-green-700 border border-green-200'
      case 'en_gestion': return 'bg-yellow-50 text-yellow-700 border border-yellow-200'
      case 'descartado': return 'bg-red-50 text-red-700 border border-red-200'
      default: return 'bg-gray-50 text-gray-700 border border-gray-200'
    }
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
                <th className="px-6 py-3 text-right font-semibold text-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length > 0 ? filteredLeads.map((lead) => (
                <tr key={lead.id} className="border-b border-border hover:bg-secondary/50 transition-colors">
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
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleAction(lead, 'action')} className="text-foreground hover:bg-secondary" title="Acciones comerciales">
                        <Briefcase className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleAction(lead, 'conversation')} className="text-foreground hover:bg-secondary" title="Ver conversacion">
                        <MessageSquare className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleAction(lead, 'detail')} className="text-foreground hover:bg-secondary" title="Ver detalle">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">No se encontraron leads con los filtros aplicados</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {modalType === 'action' && selectedLead && <ActionModal lead={selectedLead} onClose={() => setModalType(null)} />}
      {modalType === 'conversation' && selectedLead && <ConversationModal lead={selectedLead} onClose={() => setModalType(null)} />}
      {modalType === 'detail' && selectedLead && <LeadDetailModal lead={selectedLead} onClose={() => setModalType(null)} />}
    </div>
  )
}
