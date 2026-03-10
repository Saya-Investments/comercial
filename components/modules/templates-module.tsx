'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Plus, Edit2, Trash2, Eye } from 'lucide-react'
import { TemplateModal } from './modals/template-modal'

interface Template {
  id: string
  name: string
  subject: string
  content: string
  createdDate: string
}

export function TemplatesModule() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [showModal, setShowModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [viewTemplate, setViewTemplate] = useState<Template | null>(null)

  const fetchTemplates = () => {
    fetch('/api/templates')
      .then(res => res.json())
      .then(data => setTemplates(data))
      .catch(console.error)
  }

  useEffect(() => { fetchTemplates() }, [])

  const handleDelete = async (id: string) => {
    await fetch(`/api/templates?id=${id}`, { method: 'DELETE' })
    setTemplates(templates.filter((t) => t.id !== id))
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-background border-b border-border p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Plantillas</h1>
            <p className="text-muted-foreground mt-1">Gestiona plantillas de mensajes para campañas</p>
          </div>
          <Button
            onClick={() => {
              setSelectedTemplate(null)
              setShowModal(true)
            }}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nueva Plantilla
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <Card key={template.id} className="flex flex-col h-full">
              <div className="p-6 flex-1">
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-foreground">{template.name}</h3>
                </div>

                {template.subject && (
                  <div className="mb-4">
                    <p className="text-xs text-muted-foreground">Asunto</p>
                    <p className="text-sm text-foreground font-medium mt-1">{template.subject}</p>
                  </div>
                )}

                <div className="mb-4">
                  <p className="text-xs text-muted-foreground">Contenido</p>
                  <p className="text-sm text-foreground mt-1 line-clamp-3">{template.content}</p>
                </div>

                <p className="text-xs text-muted-foreground">Creada: {template.createdDate}</p>
              </div>

              <div className="flex gap-2 p-6 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewTemplate(template)}
                  className="flex-1"
                >
                  <Eye className="w-4 h-4 mr-1" />
                  Ver
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedTemplate(template)
                    setShowModal(true)
                  }}
                  className="flex-1"
                >
                  <Edit2 className="w-4 h-4 mr-1" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(template.id)}
                  className="text-accent hover:text-accent hover:bg-accent/10"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {templates.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground mb-4">No hay plantillas creadas</p>
            <Button onClick={() => setShowModal(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              <Plus className="w-4 h-4 mr-2" />
              Crear Primera Plantilla
            </Button>
          </div>
        )}
      </div>

      {showModal && (
        <TemplateModal
          template={selectedTemplate}
          onClose={() => {
            setShowModal(false)
            setSelectedTemplate(null)
          }}
          onSaved={() => fetchTemplates()}
        />
      )}

      {viewTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl">
            <div className="p-6 border-b border-border">
              <h2 className="text-xl font-bold text-foreground">{viewTemplate.name}</h2>
            </div>
            <div className="p-6 space-y-4">
              {viewTemplate.subject && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">Asunto</p>
                  <p className="text-foreground mt-1">{viewTemplate.subject}</p>
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Contenido</p>
                <p className="text-foreground mt-1 whitespace-pre-wrap">{viewTemplate.content}</p>
              </div>

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
