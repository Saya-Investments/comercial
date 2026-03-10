'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X, Loader2 } from 'lucide-react'

interface Template {
  id: string
  name: string
  subject: string
  content: string
  createdDate: string
}

interface TemplateModalProps {
  template: Template | null
  onClose: () => void
  onSaved?: () => void
}

export function TemplateModal({ template, onClose, onSaved }: TemplateModalProps) {
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: template?.name || '',
    subject: template?.subject || '',
    content: template?.content || '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim() || !formData.content.trim()) return

    setSaving(true)
    try {
      if (template) {
        // Update
        const res = await fetch('/api/templates', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: template.id,
            name: formData.name,
            subject: formData.subject,
            content: formData.content,
          }),
        })
        if (!res.ok) throw new Error('Error updating template')
      } else {
        // Create
        const res = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            subject: formData.subject,
            content: formData.content,
          }),
        })
        if (!res.ok) throw new Error('Error creating template')
      }

      onSaved?.()
      onClose()
    } catch (err) {
      console.error('Error saving template:', err)
    } finally {
      setSaving(false)
    }
  }

  const insertVariable = (variable: string) => {
    setFormData(prev => ({
      ...prev,
      content: prev.content + variable,
    }))
  }

  // Extract variables from content for preview
  const vars = formData.content.match(/\{\{\d+\}\}/g)
  const uniqueVars = vars ? [...new Set(vars)] : []

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card className="w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-6 border-b border-border flex-shrink-0">
          <h2 className="text-xl font-bold text-foreground">
            {template ? 'Editar Plantilla' : 'Nueva Plantilla'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-lg transition-colors">
            <X className="w-5 h-5 text-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Nombre</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Ej: Bienvenida WhatsApp"
              className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Asunto</label>
            <input
              type="text"
              name="subject"
              value={formData.subject}
              onChange={handleChange}
              placeholder="Ej: Bienvenido a maqui+"
              className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Contenido</label>
            <textarea
              name="content"
              value={formData.content}
              onChange={handleChange}
              placeholder="Ej: Hola {{1}}, te escribimos de maqui+ para {{2}}..."
              className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary h-40 resize-none"
              required
            />
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">Insertar variable:</span>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => insertVariable(`{{${n}}}`)}
                  className="text-xs px-2 py-0.5 rounded bg-secondary hover:bg-secondary/80 text-foreground font-mono transition-colors"
                >
                  {`{{${n}}}`}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="bg-secondary/50 border border-border rounded-lg p-4">
            <p className="text-sm font-semibold text-foreground mb-2">Vista Previa</p>
            {formData.subject && (
              <p className="text-sm text-muted-foreground">Asunto: {formData.subject}</p>
            )}
            <p className="text-sm text-foreground mt-2 whitespace-pre-wrap">
              {formData.content || 'El contenido aparecerá aquí...'}
            </p>
            {uniqueVars.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Variables detectadas: {uniqueVars.join(', ')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Estas variables se asignarán a columnas de BigQuery al crear una campaña.
                </p>
              </div>
            )}
          </div>
        </form>

        <div className="p-6 border-t border-border flex justify-end gap-3 flex-shrink-0">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !formData.name.trim() || !formData.content.trim()}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Guardando...
              </span>
            ) : template ? 'Actualizar Plantilla' : 'Crear Plantilla'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
