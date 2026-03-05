'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Search, ChevronDown, ChevronUp, Users, Star } from 'lucide-react'

interface Asesor {
  id: string
  nombre: string
  cod: string
  especialidad: string
  disponibilidad: string
  leadsEnCola: number
  scoreTotal: number
  scoreK: number
  scoreC: number
  scoreV: number
  scoreP: number
  asignado: boolean
  fechaEvaluacion: string
}

interface LeadMatching {
  lead: {
    id: string
    dni: string
    name: string
    producto: string
    scoring: number
    estado: string
  }
  asesores: Asesor[]
}

export function RoutingRulesModule() {
  const [data, setData] = useState<LeadMatching[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedLead, setExpandedLead] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/routing')
      .then(res => res.json())
      .then(d => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = data.filter(item =>
    item.lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.lead.dni.includes(searchTerm) ||
    item.lead.producto.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-700 bg-green-50 border-green-200'
    if (score >= 40) return 'text-yellow-700 bg-yellow-50 border-yellow-200'
    return 'text-red-700 bg-red-50 border-red-200'
  }

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">Cargando datos de matching...</div>
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-background border-b border-border p-6">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Enrutamiento de Leads</h1>
            <p className="text-muted-foreground mt-1">
              Matching lead-asesor con scores de compatibilidad ({data.length} leads con asesores asignables)
            </p>
          </div>
          <div className="flex items-center bg-background border border-border rounded-lg px-3 py-2 md:w-80">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              placeholder="Buscar por nombre, DNI o producto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 bg-transparent border-0 outline-none text-foreground placeholder-muted-foreground text-sm ml-2"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground">No se encontraron resultados de matching</p>
            </div>
          ) : (
            filtered.map((item) => (
              <Card key={item.lead.id} className="overflow-hidden">
                <button
                  onClick={() => setExpandedLead(expandedLead === item.lead.id ? null : item.lead.id)}
                  className="w-full p-4 flex items-center justify-between hover:bg-secondary/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">{item.lead.name}</span>
                        <span className="text-xs font-mono text-muted-foreground">DNI: {item.lead.dni}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground">{item.lead.producto}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getScoreColor(item.lead.scoring)}`}>
                          Score: {item.lead.scoring}%
                        </span>
                        <span className="text-xs text-muted-foreground">{item.lead.estado}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Users className="w-4 h-4" />
                        <span>{item.asesores.length}</span>
                      </div>
                      {expandedLead === item.lead.id ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </button>

                {expandedLead === item.lead.id && (
                  <div className="border-t border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-secondary">
                          <th className="px-4 py-2 text-left font-semibold text-foreground">Asesor</th>
                          <th className="px-4 py-2 text-left font-semibold text-foreground">Especialidad</th>
                          <th className="px-4 py-2 text-center font-semibold text-foreground">Disponibilidad</th>
                          <th className="px-4 py-2 text-center font-semibold text-foreground">Cola</th>
                          <th className="px-4 py-2 text-center font-semibold text-foreground" title="Score Conocimiento">S.K</th>
                          <th className="px-4 py-2 text-center font-semibold text-foreground" title="Score Comercial">S.C</th>
                          <th className="px-4 py-2 text-center font-semibold text-foreground" title="Score Ventas">S.V</th>
                          <th className="px-4 py-2 text-center font-semibold text-foreground" title="Score Productividad">S.P</th>
                          <th className="px-4 py-2 text-center font-semibold text-foreground">Total</th>
                          <th className="px-4 py-2 text-center font-semibold text-foreground">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.asesores.map((asesor, idx) => (
                          <tr
                            key={asesor.id}
                            className={`border-t border-border hover:bg-secondary/30 transition-colors ${
                              asesor.asignado ? 'bg-green-50/50' : ''
                            }`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {idx === 0 && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />}
                                <div>
                                  <p className="font-medium text-foreground">{asesor.nombre}</p>
                                  <p className="text-xs text-muted-foreground">{asesor.cod}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{asesor.especialidad}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                asesor.disponibilidad === 'disponible'
                                  ? 'bg-green-50 text-green-700 border border-green-200'
                                  : 'bg-red-50 text-red-700 border border-red-200'
                              }`}>
                                {asesor.disponibilidad}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center font-mono text-foreground">{asesor.leadsEnCola}</td>
                            <td className="px-4 py-3 text-center font-mono text-foreground">{asesor.scoreK}</td>
                            <td className="px-4 py-3 text-center font-mono text-foreground">{asesor.scoreC}</td>
                            <td className="px-4 py-3 text-center font-mono text-foreground">{asesor.scoreV}</td>
                            <td className="px-4 py-3 text-center font-mono text-foreground">{asesor.scoreP}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-1 rounded-full text-xs font-bold border ${getScoreColor(asesor.scoreTotal)}`}>
                                {asesor.scoreTotal}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {asesor.asignado ? (
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                                  Asignado
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Candidato</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
