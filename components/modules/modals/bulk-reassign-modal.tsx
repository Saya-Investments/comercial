'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X, AlertTriangle, ListOrdered, UserCog, Loader2, CheckCircle, ArrowLeft } from 'lucide-react'

interface AsesorOption {
  idAsesor: string
  nombreAsesor: string
  disponibilidad: string
  leadsEnCola: number
  capacidadMaxima: number
}

interface BulkReassignModalProps {
  asesorId: string
  asesorNombre: string
  totalLeads: number
  supervisorId?: string
  onClose: () => void
  onReassigned?: () => void
}

type Step = 'choose' | 'ranking-confirm' | 'manual-select' | 'manual-confirm' | 'processing' | 'result'
type Mode = 'ranking' | 'manual'

interface ReassignResult {
  totalLeads: number
  reasignados: number
  errores?: string[]
}

export function BulkReassignModal({
  asesorId,
  asesorNombre,
  totalLeads,
  supervisorId,
  onClose,
  onReassigned,
}: BulkReassignModalProps) {
  const [step, setStep] = useState<Step>('choose')
  const [mode, setMode] = useState<Mode | null>(null)
  const [asesoresDisponibles, setAsesoresDisponibles] = useState<AsesorOption[]>([])
  const [selectedAsesorId, setSelectedAsesorId] = useState<string>('')
  const [loadingAsesores, setLoadingAsesores] = useState(false)
  const [result, setResult] = useState<ReassignResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load asesores list when entering manual selection step
  useEffect(() => {
    if (step !== 'manual-select' || asesoresDisponibles.length > 0) return

    setLoadingAsesores(true)
    const url = supervisorId ? `/api/asesores-leads?supervisorId=${supervisorId}` : '/api/asesores-leads'
    fetch(url)
      .then((res) => res.json())
      .then((data: AsesorOption[]) => {
        // Exclude the source asesor
        setAsesoresDisponibles(data.filter((a) => a.idAsesor !== asesorId))
      })
      .catch(() => setError('Error al cargar asesores'))
      .finally(() => setLoadingAsesores(false))
  }, [step, asesoresDisponibles.length, supervisorId, asesorId])

  const executeReassign = async (selectedMode: Mode, targetId?: string) => {
    setStep('processing')
    setError(null)

    try {
      const res = await fetch('/api/asesores-leads/reasignar-todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idAsesor: asesorId,
          mode: selectedMode,
          targetAsesorId: targetId,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error al reasignar')
        setStep(selectedMode === 'ranking' ? 'ranking-confirm' : 'manual-confirm')
        return
      }

      setResult({
        totalLeads: data.totalLeads || 0,
        reasignados: data.reasignados || 0,
        errores: data.errores,
      })
      setStep('result')
      onReassigned?.()
    } catch {
      setError('Error de conexión')
      setStep(selectedMode === 'ranking' ? 'ranking-confirm' : 'manual-confirm')
    }
  }

  const targetAsesor = asesoresDisponibles.find((a) => a.idAsesor === selectedAsesorId)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-6 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-foreground">Reasignar Leads</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {asesorNombre} · {totalLeads} {totalLeads === 1 ? 'lead' : 'leads'}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={step === 'processing'}
            className="p-1 hover:bg-secondary rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5 text-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* STEP: Choose option */}
          {step === 'choose' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground mb-4">
                Selecciona cómo quieres reasignar los {totalLeads} {totalLeads === 1 ? 'lead' : 'leads'} de este asesor:
              </p>

              <button
                onClick={() => {
                  setMode('ranking')
                  setStep('ranking-confirm')
                }}
                className="w-full text-left p-4 border-2 border-border rounded-lg hover:border-primary hover:bg-secondary/50 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <ListOrdered className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">Por ranking de cada lead</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Cada lead se reasignará al siguiente asesor disponible según su ranking individual.
                    </p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  setMode('manual')
                  setStep('manual-select')
                }}
                className="w-full text-left p-4 border-2 border-border rounded-lg hover:border-primary hover:bg-secondary/50 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <UserCog className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">A un asesor específico</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Tú eliges a qué asesor se reasignarán todos los leads.
                    </p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* STEP: Ranking confirmation with warning */}
          {step === 'ranking-confirm' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold text-amber-900 mb-1">Reasignación por ranking</p>
                  <p className="text-amber-800">
                    Cada uno de los <strong>{totalLeads}</strong> leads se reasignará al <strong>siguiente asesor disponible</strong> según su ranking individual.
                  </p>
                  <p className="text-amber-800 mt-2">
                    Si algún lead no tiene un siguiente asesor disponible (sin capacidad o no disponible), se omitirá y se reportará en el resultado.
                  </p>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* STEP: Manual selection */}
          {step === 'manual-select' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Selecciona el asesor al que se reasignarán los {totalLeads} {totalLeads === 1 ? 'lead' : 'leads'}:
              </p>

              {loadingAsesores ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : asesoresDisponibles.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No hay otros asesores disponibles</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {asesoresDisponibles.map((a) => {
                    const isSelected = selectedAsesorId === a.idAsesor
                    const sinCapacidad = a.leadsEnCola + totalLeads > a.capacidadMaxima
                    const noDisponible = a.disponibilidad !== 'disponible'

                    return (
                      <button
                        key={a.idAsesor}
                        onClick={() => setSelectedAsesorId(a.idAsesor)}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50 hover:bg-secondary/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground truncate">{a.nombreAsesor}</span>
                              {noDisponible && (
                                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600 border border-red-200">
                                  No disponible
                                </span>
                              )}
                              {sinCapacidad && (
                                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                  Excede capacidad
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Cola actual: {a.leadsEnCola}/{a.capacidadMaxima}
                              {' · '}
                              Quedaría en: {a.leadsEnCola + totalLeads}/{a.capacidadMaxima}
                            </p>
                          </div>
                          {isSelected && <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* STEP: Manual confirmation */}
          {step === 'manual-confirm' && targetAsesor && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <UserCog className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold text-purple-900 mb-1">Confirmar reasignación</p>
                  <p className="text-purple-800">
                    Los <strong>{totalLeads}</strong> leads de <strong>{asesorNombre}</strong> serán reasignados a:
                  </p>
                  <p className="text-purple-900 font-semibold mt-2">{targetAsesor.nombreAsesor}</p>
                  <p className="text-purple-700 text-xs mt-1">
                    Cola del destino quedaría en: {targetAsesor.leadsEnCola + totalLeads}/{targetAsesor.capacidadMaxima}
                  </p>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* STEP: Processing */}
          {step === 'processing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
              <p className="text-foreground font-medium">Reasignando leads...</p>
              <p className="text-sm text-muted-foreground mt-1">Esto puede tomar unos segundos</p>
            </div>
          )}

          {/* STEP: Result */}
          {step === 'result' && result && (
            <div className="space-y-4">
              <div
                className={`flex items-start gap-3 p-4 rounded-lg border ${
                  result.reasignados === result.totalLeads
                    ? 'bg-green-50 border-green-200'
                    : 'bg-amber-50 border-amber-200'
                }`}
              >
                {result.reasignados === result.totalLeads ? (
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 text-sm">
                  <p className={`font-semibold mb-1 ${
                    result.reasignados === result.totalLeads ? 'text-green-900' : 'text-amber-900'
                  }`}>
                    {result.reasignados} de {result.totalLeads} leads reasignados
                  </p>
                  {result.reasignados < result.totalLeads && (
                    <p className="text-amber-800">
                      {result.totalLeads - result.reasignados} {result.totalLeads - result.reasignados === 1 ? 'lead no pudo' : 'leads no pudieron'} reasignarse.
                    </p>
                  )}
                </div>
              </div>

              {result.errores && result.errores.length > 0 && (
                <div className="bg-secondary/50 border border-border rounded-lg p-3">
                  <p className="text-xs font-semibold text-foreground mb-2">Detalles:</p>
                  <ul className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                    {result.errores.map((err, i) => (
                      <li key={i}>• {err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-border flex justify-between gap-3 flex-shrink-0">
          {step === 'choose' && (
            <>
              <div />
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
            </>
          )}

          {step === 'ranking-confirm' && (
            <>
              <Button
                variant="outline"
                onClick={() => { setStep('choose'); setError(null) }}
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Volver
              </Button>
              <Button
                onClick={() => executeReassign('ranking')}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Confirmar reasignación
              </Button>
            </>
          )}

          {step === 'manual-select' && (
            <>
              <Button
                variant="outline"
                onClick={() => { setStep('choose'); setSelectedAsesorId('') }}
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Volver
              </Button>
              <Button
                onClick={() => setStep('manual-confirm')}
                disabled={!selectedAsesorId}
                className="bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50"
              >
                Continuar
              </Button>
            </>
          )}

          {step === 'manual-confirm' && (
            <>
              <Button
                variant="outline"
                onClick={() => { setStep('manual-select'); setError(null) }}
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Volver
              </Button>
              <Button
                onClick={() => executeReassign('manual', selectedAsesorId)}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                Confirmar reasignación
              </Button>
            </>
          )}

          {step === 'processing' && (
            <>
              <div />
              <Button disabled variant="outline">Procesando...</Button>
            </>
          )}

          {step === 'result' && (
            <>
              <div />
              <Button onClick={onClose} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                Cerrar
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
