'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RefreshCw, ChevronDown, ChevronRight, Loader2, Users } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { BulkReassignModal } from './modals/bulk-reassign-modal'

interface LeadItem {
  idLead: string
  nombre: string
  producto: string
  scoring: number
  telefono: string
  estado: string
  fechaAsignacion: string | null
}

interface AsesorWithLeads {
  idAsesor: string
  nombreAsesor: string
  disponibilidad: string
  leadsEnCola: number
  capacidadMaxima: number
  leads: LeadItem[]
}

export function ReassignmentModule() {
  const { user } = useAuth()
  const [asesores, setAsesores] = useState<AsesorWithLeads[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [modalAsesor, setModalAsesor] = useState<AsesorWithLeads | null>(null)

  const isSupervisor = user?.role === 'supervisor'

  const fetchAsesores = useCallback(() => {
    const url = isSupervisor
      ? `/api/asesores-leads?supervisorId=${user?.id}`
      : '/api/asesores-leads'
    setLoading(true)
    fetch(url)
      .then((res) => res.json())
      .then((data) => setAsesores(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [isSupervisor, user?.id])

  useEffect(() => {
    fetchAsesores()
  }, [fetchAsesores])

  const toggleExpanded = (asesorId: string) => {
    const next = new Set(expanded)
    if (next.has(asesorId)) next.delete(asesorId)
    else next.add(asesorId)
    setExpanded(next)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-background border-b border-border p-4 md:p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Reasignación Manual</h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Reasigna todos los leads de un asesor al siguiente disponible según el ranking
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : asesores.length === 0 ? (
          <Card className="p-12 text-center">
            <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No hay asesores disponibles</p>
          </Card>
        ) : (
          <div className="space-y-3 max-w-4xl mx-auto">
            {asesores.map((asesor) => {
              const isExpanded = expanded.has(asesor.idAsesor)
              const hasLeads = asesor.leads.length > 0

              return (
                <Card key={asesor.idAsesor} className="overflow-hidden">
                  <div className="p-4 flex items-center gap-3">
                    <button
                      onClick={() => hasLeads && toggleExpanded(asesor.idAsesor)}
                      className={`p-1 rounded hover:bg-secondary ${!hasLeads ? 'invisible' : ''}`}
                      disabled={!hasLeads}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground truncate">{asesor.nombreAsesor}</h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            asesor.disponibilidad === 'disponible'
                              ? 'bg-green-50 text-green-700 border border-green-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {asesor.disponibilidad}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>
                          <strong className="text-foreground">{asesor.leads.length}</strong> leads asignados
                        </span>
                        <span>
                          Cola: {asesor.leadsEnCola}/{asesor.capacidadMaxima}
                        </span>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => setModalAsesor(asesor)}
                      disabled={!hasLeads}
                      className="bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50"
                      title={hasLeads ? 'Reasignar leads' : 'Sin leads para reasignar'}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Reasignar
                    </Button>
                  </div>

                  {/* Expanded leads list */}
                  {isExpanded && hasLeads && (
                    <div className="border-t border-border bg-secondary/30">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-left">
                            <th className="px-4 py-2 font-medium text-muted-foreground">Lead</th>
                            <th className="px-4 py-2 font-medium text-muted-foreground">Producto</th>
                            <th className="px-4 py-2 font-medium text-muted-foreground">Teléfono</th>
                            <th className="px-4 py-2 font-medium text-muted-foreground text-center">Score</th>
                            <th className="px-4 py-2 font-medium text-muted-foreground">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {asesor.leads.map((lead) => (
                            <tr key={lead.idLead} className="border-b border-border/50 last:border-0">
                              <td className="px-4 py-2 font-medium text-foreground">{lead.nombre}</td>
                              <td className="px-4 py-2 text-foreground">{lead.producto || '—'}</td>
                              <td className="px-4 py-2 text-muted-foreground">{lead.telefono || '—'}</td>
                              <td className="px-4 py-2 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                    lead.scoring >= 70
                                      ? 'bg-green-50 text-green-700 border border-green-200'
                                      : lead.scoring >= 40
                                        ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                                        : 'bg-red-50 text-red-700 border border-red-200'
                                  }`}
                                >
                                  {lead.scoring}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-muted-foreground">{lead.estado || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {modalAsesor && (
        <BulkReassignModal
          asesorId={modalAsesor.idAsesor}
          asesorNombre={modalAsesor.nombreAsesor}
          totalLeads={modalAsesor.leads.length}
          onClose={() => setModalAsesor(null)}
          onReassigned={() => fetchAsesores()}
        />
      )}
    </div>
  )
}
