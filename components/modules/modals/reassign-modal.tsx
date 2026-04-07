'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X, ArrowRight, CheckCircle, Circle, AlertCircle, Loader2 } from 'lucide-react'

interface RankingEntry {
  id: number
  posicion: number
  idAsesor: string
  nombreAsesor: string
  scoreTotal: number | null
  asignado: boolean
  esActual: boolean
  disponibilidad: string
  leadsEnCola: number
  capacidadMaxima: number
}

interface ReassignModalProps {
  leadId: string
  leadName: string
  onClose: () => void
  onReassigned?: () => void
}

export function ReassignModal({ leadId, leadName, onClose, onReassigned }: ReassignModalProps) {
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [reassigning, setReassigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/leads/${leadId}/ranking`)
      .then(res => res.json())
      .then(data => setRanking(data))
      .catch(() => setError('Error al cargar el ranking'))
      .finally(() => setLoading(false))
  }, [leadId])

  const handleReassign = async (entry: RankingEntry) => {
    setReassigning(true)
    setError(null)

    try {
      const res = await fetch('/api/leads/reasignar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, rankingId: entry.id }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error al reasignar')
        return
      }

      setSuccess(`Lead reasignado a ${data.nuevoAsesor}`)
      onReassigned?.()

      setTimeout(() => onClose(), 1500)
    } catch {
      setError('Error de conexión')
    } finally {
      setReassigning(false)
    }
  }

  const currentIndex = ranking.findIndex(r => r.esActual)

  // Next available: first entry after current that is not assigned and has capacity
  const nextAvailable = ranking.find(
    (r, i) =>
      i > currentIndex &&
      !r.asignado &&
      r.disponibilidad === 'disponible' &&
      r.leadsEnCola < r.capacidadMaxima
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl flex flex-col max-h-[85vh]">
        <div className="flex justify-between items-center p-6 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-foreground">Reasignar Lead</h2>
            <p className="text-sm text-muted-foreground mt-1">{leadName}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-lg transition-colors">
            <X className="w-5 h-5 text-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : ranking.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No hay ranking de asesores para este lead</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}
              {success && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  {success}
                </div>
              )}

              <div className="mb-4">
                <p className="text-sm text-muted-foreground">
                  Ranking de asesores ordenado por compatibilidad. Selecciona al siguiente asesor para reasignar el lead.
                </p>
              </div>

              <div className="space-y-2">
                {ranking.map((entry, i) => {
                  const isPast = entry.asignado || (currentIndex >= 0 && i < currentIndex)
                  const isCurrent = entry.esActual
                  const isNext = nextAvailable?.id === entry.id
                  const isAvailable = !entry.asignado && !isCurrent && entry.disponibilidad === 'disponible' && entry.leadsEnCola < entry.capacidadMaxima
                  const noCapacity = !entry.asignado && !isCurrent && (entry.disponibilidad !== 'disponible' || entry.leadsEnCola >= entry.capacidadMaxima)

                  return (
                    <div
                      key={entry.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                        isCurrent
                          ? 'border-blue-300 bg-blue-50'
                          : isNext
                            ? 'border-green-300 bg-green-50'
                            : isPast
                              ? 'border-border bg-muted/50 opacity-60'
                              : noCapacity
                                ? 'border-border bg-muted/30 opacity-50'
                                : 'border-border bg-background hover:border-primary/50'
                      }`}
                    >
                      {/* Position indicator */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                        isCurrent
                          ? 'bg-blue-500 text-white'
                          : isPast
                            ? 'bg-muted text-muted-foreground'
                            : isNext
                              ? 'bg-green-500 text-white'
                              : 'bg-secondary text-foreground'
                      }`}>
                        {entry.posicion}
                      </div>

                      {/* Asesor info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground truncate">{entry.nombreAsesor}</span>
                          {isCurrent && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200 flex-shrink-0">
                              Actual
                            </span>
                          )}
                          {isNext && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200 flex-shrink-0">
                              Siguiente
                            </span>
                          )}
                          {entry.asignado && !isCurrent && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border flex-shrink-0">
                              Ya asignado
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {entry.scoreTotal !== null && (
                            <span>Score: {(entry.scoreTotal * 100).toFixed(0)}%</span>
                          )}
                          <span>Cola: {entry.leadsEnCola}/{entry.capacidadMaxima}</span>
                          <span className={`flex items-center gap-1 ${
                            entry.disponibilidad === 'disponible' ? 'text-green-600' : 'text-red-500'
                          }`}>
                            {entry.disponibilidad === 'disponible' ? (
                              <><Circle className="w-2 h-2 fill-current" /> Disponible</>
                            ) : (
                              <><Circle className="w-2 h-2 fill-current" /> No disponible</>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Action button */}
                      {isAvailable && !success && (
                        <Button
                          size="sm"
                          onClick={() => handleReassign(entry)}
                          disabled={reassigning}
                          className={`flex-shrink-0 ${
                            isNext
                              ? 'bg-green-600 hover:bg-green-700 text-white'
                              : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                          }`}
                        >
                          {reassigning ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <ArrowRight className="w-4 h-4 mr-1" />
                              Asignar
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-border flex justify-end flex-shrink-0">
          <Button variant="outline" onClick={onClose}>
            {success ? 'Cerrar' : 'Cancelar'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
