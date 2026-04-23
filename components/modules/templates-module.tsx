'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Eye, RefreshCw, Loader2 } from 'lucide-react'
import { TemplateModal } from './modals/template-modal'

interface Template {
  id: string
  name: string
  content: string
  metaId: string | null
  estadoMeta: string | null
  categoria: string | null
  idioma: string | null
  header: string | null
  footer: string | null
  botones: unknown
  headerType: string | null
  createdDate: string
  createdAt: string
}

const ESTADO_LABEL: Record<string, string> = {
  APPROVED: 'Aprobada',
  PENDING: 'Pendiente',
  REJECTED: 'Rechazada',
  PAUSED: 'Pausada',
  DISABLED: 'Deshabilitada',
  DELETED_IN_META: '⚠️ Eliminada en Meta',
}

const ESTADO_CLASS: Record<string, string> = {
  APPROVED: 'bg-green-100 text-green-800 border-green-300',
  PENDING: 'bg-amber-100 text-amber-800 border-amber-300',
  REJECTED: 'bg-red-100 text-red-800 border-red-300',
  PAUSED: 'bg-gray-100 text-gray-800 border-gray-300',
  DISABLED: 'bg-gray-100 text-gray-800 border-gray-300',
  DELETED_IN_META: 'bg-red-100 text-red-800 border-red-300',
}

export function TemplatesModule() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [viewTemplate, setViewTemplate] = useState<Template | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/templates')
      const data = await res.json()
      setTemplates(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Borrar plantilla "${name}"? También se eliminará de Meta.`)) return
    setFeedback(null)
    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' })
      const result = await res.json()
      if (!result.success) throw new Error(result.error ?? 'Error al borrar')
      setFeedback({
        type: 'success',
        message: `"${name}" eliminada${result.metaDeleted ? ' (BD + Meta)' : ' (solo BD, no estaba en Meta)'}`,
      })
      fetchTemplates()
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Error desconocido',
      })
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/templates/sync', { method: 'POST' })
      const result = await res.json()
      if (!result.success) throw new Error(result.error ?? 'Error en sync')
      const r = result.resumen
      const partes = [`${r.creadas} creadas`, `${r.actualizadas} actualizadas`]
      if (r.borradas > 0) partes.push(`${r.borradas} borradas`)
      if (r.marcadasComoEliminadas > 0)
        partes.push(`${r.marcadasComoEliminadas} marcadas como eliminadas`)
      if (r.errores > 0) partes.push(`${r.errores} errores`)
      setFeedback({ type: 'success', message: `Sincronizado: ${partes.join(', ')}` })
      fetchTemplates()
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Error desconocido',
      })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-background border-b border-border p-6">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Plantillas</h1>
            <p className="text-muted-foreground mt-1">
              Gestiona plantillas de WhatsApp Meta Business
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleSync}
              disabled={syncing}
              variant="outline"
              className="gap-2"
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Sincronizar con Meta
            </Button>
            <Button
              onClick={() => setShowModal(true)}
              className="bg-accent hover:bg-accent/90 text-accent-foreground gap-2"
            >
              <Plus className="w-4 h-4" />
              Nueva Plantilla
            </Button>
          </div>
        </div>

        {feedback && (
          <div
            className={`mt-4 p-3 rounded-md border text-sm ${
              feedback.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-destructive/10 border-destructive/20 text-destructive'
            }`}
          >
            {feedback.message}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground mb-4">
              No hay plantillas todavía. Sincronizá con Meta o creá una nueva.
            </p>
            <Button
              onClick={() => setShowModal(true)}
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              <Plus className="w-4 h-4 mr-2" />
              Crear Primera Plantilla
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((t) => (
              <Card
                key={t.id}
                className={`flex flex-col h-full ${
                  t.estadoMeta === 'DELETED_IN_META' ? 'opacity-60' : ''
                }`}
              >
                <div className="p-6 flex-1">
                  <div className="mb-3">
                    <h3 className="text-lg font-bold text-foreground font-mono break-all">
                      {t.name}
                    </h3>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {t.estadoMeta ? (
                        <Badge
                          variant="outline"
                          className={ESTADO_CLASS[t.estadoMeta] ?? ''}
                        >
                          {ESTADO_LABEL[t.estadoMeta] ?? t.estadoMeta}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-300">
                          Local (sin Meta)
                        </Badge>
                      )}
                      {t.categoria && <Badge variant="outline">{t.categoria}</Badge>}
                      {t.idioma && <Badge variant="outline">{t.idioma}</Badge>}
                    </div>
                  </div>

                  {t.header && t.headerType === 'TEXT' && (
                    <div className="mb-3">
                      <p className="text-xs text-muted-foreground">Header</p>
                      <p className="text-sm text-foreground font-medium mt-1">{t.header}</p>
                    </div>
                  )}

                  <div className="mb-3">
                    <p className="text-xs text-muted-foreground">Contenido</p>
                    <p className="text-sm text-foreground mt-1 line-clamp-3 whitespace-pre-wrap break-words">
                      {t.content}
                    </p>
                  </div>

                  {t.footer && (
                    <div className="mb-3">
                      <p className="text-xs text-muted-foreground">Footer</p>
                      <p className="text-xs text-muted-foreground italic mt-1">{t.footer}</p>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground pt-2">
                    Creada: {t.createdDate}
                  </p>
                </div>

                <div className="flex gap-2 p-4 border-t border-border">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewTemplate(t)}
                    className="flex-1"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Ver
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(t.id, t.name)}
                    className="text-accent hover:text-accent hover:bg-accent/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <TemplateModal
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false)
            setFeedback({
              type: 'success',
              message:
                'Plantilla enviada a Meta para aprobación. Puede tardar unos minutos. Usá "Sincronizar" para ver el estado actualizado.',
            })
            fetchTemplates()
          }}
        />
      )}

      {viewTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-foreground font-mono break-all">
                    {viewTemplate.name}
                  </h2>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {viewTemplate.estadoMeta && (
                      <Badge
                        variant="outline"
                        className={ESTADO_CLASS[viewTemplate.estadoMeta] ?? ''}
                      >
                        {ESTADO_LABEL[viewTemplate.estadoMeta] ?? viewTemplate.estadoMeta}
                      </Badge>
                    )}
                    {viewTemplate.categoria && <Badge variant="outline">{viewTemplate.categoria}</Badge>}
                    {viewTemplate.idioma && <Badge variant="outline">{viewTemplate.idioma}</Badge>}
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {viewTemplate.header && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">Header</p>
                  <p className="text-foreground mt-1 font-medium">{viewTemplate.header}</p>
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Contenido</p>
                <p className="text-foreground mt-1 whitespace-pre-wrap break-words">
                  {viewTemplate.content}
                </p>
              </div>
              {viewTemplate.footer && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">Footer</p>
                  <p className="text-muted-foreground italic mt-1">{viewTemplate.footer}</p>
                </div>
              )}
              {viewTemplate.metaId && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">Meta ID</p>
                  <p className="text-muted-foreground text-xs font-mono mt-1">{viewTemplate.metaId}</p>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-border flex justify-end">
              <Button onClick={() => setViewTemplate(null)} variant="outline">
                Cerrar
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
