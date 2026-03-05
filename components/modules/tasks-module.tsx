'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Eye, MessageSquare, Briefcase } from 'lucide-react'
import { useState, useEffect } from 'react'
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
}

export function TasksModule() {
  const { user } = useAuth()
  const [allLeads, setAllLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [modalType, setModalType] = useState<'action' | 'conversation' | 'detail' | null>(null)
  const [selectedPriority, setSelectedPriority] = useState<'Alta' | 'Media' | 'Baja' | null>(null)
  const [expandedPriority, setExpandedPriority] = useState<'Alta' | 'Media' | 'Baja' | null>(null)

  useEffect(() => {
    const params = new URLSearchParams()
    if (user?.id) params.set('userId', user.id)
    if (user?.role) params.set('role', user.role)

    fetch(`/api/tasks?${params}`)
      .then(res => res.json())
      .then(data => {
        setAllLeads(data.map((t: Record<string, unknown>) => ({
          id: t.id as string,
          dni: t.dni as string,
          name: t.name as string,
          phone: t.phone as string,
          status: t.status as string,
          assignedDate: t.assignedDate as string,
          product: t.product as string,
          priority: t.priority as 'Alta' | 'Media' | 'Baja',
        })))
      })
      .catch(() => {
        // Fallback: fetch leads directly
        fetch(`/api/leads?${params}`)
          .then(res => res.json())
          .then(data => setAllLeads(data))
      })
      .finally(() => setLoading(false))
  }, [user?.id, user?.role])

  const handleAction = (lead: Lead, type: 'action' | 'conversation' | 'detail') => {
    setSelectedLead(lead)
    setModalType(type)
  }

  const handlePriorityClick = (priority: 'Alta' | 'Media' | 'Baja') => {
    setSelectedPriority(priority)
  }

  const handleBack = () => {
    setSelectedPriority(null)
  }

  const altaLeads = allLeads.filter(l => l.priority === 'Alta')
  const mediaLeads = allLeads.filter(l => l.priority === 'Media')
  const bajaLeads = allLeads.filter(l => l.priority === 'Baja')

  const altaCompletados = Math.floor(altaLeads.length * 0.4)
  const mediaCompletados = Math.floor(mediaLeads.length * 0.3)
  const bajaCompletados = Math.floor(bajaLeads.length * 0.2)

  const PriorityBox = ({ 
    title, 
    color, 
    leads, 
    completed, 
    priority 
  }: { 
    title: string
    color: string
    leads: Lead[]
    completed: number
    priority: 'Alta' | 'Media' | 'Baja'
  }) => {
    return (
      <button
        onClick={() => handlePriorityClick(priority)}
        className={`${color} border-2 p-6 rounded-lg transition-all hover:shadow-lg text-left w-full`}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-4 h-4 rounded-full" style={{
            backgroundColor: color === 'bg-accent/5' ? 'rgb(230, 57, 70)' : 
                             color === 'bg-primary/5' ? 'rgb(13, 107, 125)' : 'rgb(180, 180, 180)'
          }} />
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
        </div>
        
        <div className="flex gap-4">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold text-foreground">{leads.length}</p>
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">Completados</p>
            <p className="text-2xl font-bold text-green-600">{completed}</p>
            <p className="text-xs text-muted-foreground">{leads.length > 0 ? Math.round((completed / leads.length) * 100) : 0}%</p>
          </div>
        </div>
      </button>
    )
  }

  const PriorityTableView = ({ priority, leads }: { priority: 'Alta' | 'Media' | 'Baja', leads: Lead[] }) => (
    <div className="p-6 h-full overflow-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button
            onClick={handleBack}
            variant="outline"
            className="text-foreground hover:bg-secondary bg-transparent"
          >
            ← Atrás
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Leads con Prioridad {priority}</h1>
            <p className="text-muted-foreground mt-1">{leads.length} leads asignados</p>
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary">
                  <th className="px-6 py-4 text-left font-semibold text-foreground">DNI</th>
                  <th className="px-6 py-4 text-left font-semibold text-foreground">Nombre</th>
                  <th className="px-6 py-4 text-left font-semibold text-foreground">Teléfono</th>
                  <th className="px-6 py-4 text-left font-semibold text-foreground">Estado</th>
                  <th className="px-6 py-4 text-left font-semibold text-foreground">Producto</th>
                  <th className="px-6 py-4 text-left font-semibold text-foreground">Asignada</th>
                  <th className="px-6 py-4 text-right font-semibold text-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {leads.length > 0 ? (
                  leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-border hover:bg-secondary/50 transition-colors">
                      <td className="px-6 py-4 font-mono text-foreground">{lead.dni}</td>
                      <td className="px-6 py-4 font-medium text-foreground">{lead.name}</td>
                      <td className="px-6 py-4 text-foreground">{lead.phone}</td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                          {lead.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-foreground">{lead.product}</td>
                      <td className="px-6 py-4 text-foreground">{lead.assignedDate}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAction(lead, 'action')}
                            className="h-8 w-8 p-0 text-foreground hover:bg-secondary"
                            title="Acciones comerciales"
                          >
                            <Briefcase className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAction(lead, 'conversation')}
                            className="h-8 w-8 p-0 text-foreground hover:bg-secondary"
                            title="Ver conversación"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAction(lead, 'detail')}
                            className="h-8 w-8 p-0 text-foreground hover:bg-secondary"
                            title="Ver detalle"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                      No hay leads con esta priorización
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )

  if (selectedPriority) {
    const leadsForPriority = allLeads.filter(l => l.priority === selectedPriority)
    return (
      <>
        <PriorityTableView priority={selectedPriority} leads={leadsForPriority} />
        {selectedLead && modalType === 'action' && <ActionModal lead={selectedLead} onClose={() => setModalType(null)} />}
        {selectedLead && modalType === 'conversation' && <ConversationModal lead={selectedLead} onClose={() => setModalType(null)} />}
        {selectedLead && modalType === 'detail' && <LeadDetailModal lead={selectedLead} onClose={() => setModalType(null)} />}
      </>
    )
  }

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Tareas por Prioridad</h1>
          <p className="text-muted-foreground mt-1">Haz clic en una caja para ver los leads asignados</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <PriorityBox 
            title="Alta Prioridad"
            color="bg-accent/5"
            leads={altaLeads}
            completed={altaCompletados}
            priority="Alta"
          />
          <PriorityBox 
            title="Media Prioridad"
            color="bg-primary/5"
            leads={mediaLeads}
            completed={mediaCompletados}
            priority="Media"
          />
          <PriorityBox 
            title="Baja Prioridad"
            color="bg-muted"
            leads={bajaLeads}
            completed={bajaCompletados}
            priority="Baja"
          />
        </div>
      </div>

      {modalType === 'action' && selectedLead && (
        <ActionModal lead={selectedLead} onClose={() => setModalType(null)} />
      )}
      {modalType === 'conversation' && selectedLead && (
        <ConversationModal lead={selectedLead} onClose={() => setModalType(null)} />
      )}
      {modalType === 'detail' && selectedLead && (
        <LeadDetailModal lead={selectedLead} onClose={() => setModalType(null)} />
      )}
    </div>
  )
}
