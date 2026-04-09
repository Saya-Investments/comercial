'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X, Loader2, UserCheck, CheckCircle, AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/contexts/auth-context'

interface ProspectModalProps {
  lead: {
    id: string
    name: string
    phone: string
    dni: string
  }
  onClose: () => void
  onProspectSaved?: () => void
}

export function ProspectModal({ lead, onClose, onProspectSaved }: ProspectModalProps) {
  const { user } = useAuth()
  const [step, setStep] = useState<'info' | 'confirm' | 'saved'>('info')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!user) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/registrar-prospecto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, userId: user.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error al registrar prospecto')
        setSaving(false)
        return
      }
      setSaving(false)
      setStep('saved')
      onProspectSaved?.()
    } catch {
      setError('Error de conexion al registrar prospecto')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card className="w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-4 p-6 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-foreground">Registrar como Prospecto</h2>
            <p className="text-sm text-muted-foreground mt-1">{lead.name}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1 hover:bg-secondary rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-foreground" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {step === 'saved' && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Prospecto Registrado</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                <strong>{lead.name}</strong> ha sido registrado como prospecto exitosamente.
              </p>
            </div>
          )}

          {step === 'confirm' && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                <AlertTriangle className="w-7 h-7 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">¿Estas seguro?</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Estas a punto de registrar a <strong>{lead.name}</strong> como prospecto. Esta accion no se puede deshacer.
              </p>
              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          )}

          {step === 'info' && (
            <div className="space-y-4">
              <div className="p-4 bg-secondary/50 rounded-lg border border-border">
                <div className="flex items-center gap-3 mb-3">
                  <UserCheck className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-foreground">Datos del lead</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Al registrar este lead como prospecto, se marcara como un cliente potencial calificado para seguimiento comercial.
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1 border-b border-border">
                    <span className="text-muted-foreground">Nombre</span>
                    <span className="font-medium text-foreground">{lead.name}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border">
                    <span className="text-muted-foreground">DNI</span>
                    <span className="font-medium text-foreground">{lead.dni}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Telefono</span>
                    <span className="font-medium text-foreground">{lead.phone}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border flex-shrink-0">
          {step === 'saved' && (
            <Button
              onClick={onClose}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Cerrar
            </Button>
          )}

          {step === 'confirm' && (
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={() => setStep('info')}
                disabled={saving}
                className="text-foreground hover:bg-secondary"
              >
                Volver
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={saving}
                className="bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Registrando...
                  </>
                ) : (
                  'Si, registrar'
                )}
              </Button>
            </div>
          )}

          {step === 'info' && (
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={onClose}
                className="text-foreground hover:bg-secondary"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => setStep('confirm')}
                className="bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                <UserCheck className="w-4 h-4 mr-2" />
                Registrar Prospecto
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
