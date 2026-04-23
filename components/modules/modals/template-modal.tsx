'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X, Loader2 } from 'lucide-react'

interface TemplateModalProps {
  onClose: () => void
  onSaved?: () => void
}

type Categoria = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'

export function TemplateModal({ onClose, onSaved }: TemplateModalProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [nombre, setNombre] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [categoria, setCategoria] = useState<Categoria>('MARKETING')
  const [idioma, setIdioma] = useState('es_PE')
  const [header, setHeader] = useState('')
  const [footer, setFooter] = useState('')
  const [ejemplosMensaje, setEjemplosMensaje] = useState('')
  const [ejemplosHeader, setEjemplosHeader] = useState('')

  // Detecta variables {{N}} en mensaje/header para mostrar campos de ejemplos
  const mensajeTieneVars = /\{\{\d+\}\}/.test(mensaje)
  const headerTieneVars = /\{\{\d+\}\}/.test(header)

  // Preview: extrae variables unicas del mensaje
  const vars = mensaje.match(/\{\{\d+\}\}/g)
  const uniqueVars = vars ? [...new Set(vars)] : []

  const insertVariable = (variable: string) => {
    setMensaje((prev) => prev + variable)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim() || !mensaje.trim()) {
      setError('Nombre y mensaje son requeridos')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const ejemplos_mensaje = ejemplosMensaje
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      const ejemplos_header = ejemplosHeader
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      const body = {
        nombre,
        mensaje,
        categoria,
        idioma,
        header: header.trim() || null,
        footer: footer.trim() || null,
        ejemplos_mensaje: ejemplos_mensaje.length > 0 ? ejemplos_mensaje : undefined,
        ejemplos_header: ejemplos_header.length > 0 ? ejemplos_header : undefined,
      }

      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await res.json()
      if (!result.success) throw new Error(result.error ?? 'Error creando plantilla')

      onSaved?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card className="w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-6 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-foreground">Nueva plantilla</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Se crea en Meta Business y queda pendiente de aprobación.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1 hover:bg-secondary rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              Nombre <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="ej: bienvenida_stock"
              className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Se normaliza a snake_case (Meta solo acepta a-z, 0-9, _).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Categoría</label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as Categoria)}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
              >
                <option value="MARKETING">Marketing</option>
                <option value="UTILITY">Utility</option>
                <option value="AUTHENTICATION">Authentication</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Idioma</label>
              <input
                type="text"
                value={idioma}
                onChange={(e) => setIdioma(e.target.value)}
                placeholder="es_PE"
                className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              Header (opcional, solo texto)
            </label>
            <input
              type="text"
              value={header}
              onChange={(e) => setHeader(e.target.value)}
              placeholder="Ej: Hola {{1}}"
              className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          {headerTieneVars && (
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                Ejemplos del header (separados por coma) <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={ejemplosHeader}
                onChange={(e) => setEjemplosHeader(e.target.value)}
                placeholder="Juan"
                className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              Mensaje <span className="text-destructive">*</span>
            </label>
            <textarea
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              placeholder="Ej: Hola {{1}}, te escribimos de maqui+ para {{2}}..."
              className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary h-40 resize-none"
              required
            />
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Insertar variable:</span>
              {[1, 2, 3, 4, 5].map((n) => (
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

          {mensajeTieneVars && (
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                Ejemplos del mensaje (separados por coma){' '}
                <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={ejemplosMensaje}
                onChange={(e) => setEjemplosMensaje(e.target.value)}
                placeholder="Juan, Maqui+"
                className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Meta requiere un ejemplo por cada {'{{N}}'} para aprobar la plantilla.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              Footer (opcional)
            </label>
            <input
              type="text"
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              placeholder="Equipo Maqui+"
              className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="bg-secondary/50 border border-border rounded-lg p-4">
            <p className="text-sm font-semibold text-foreground mb-2">Vista Previa</p>
            {header && <p className="text-sm text-foreground font-medium">{header}</p>}
            <p className="text-sm text-foreground mt-2 whitespace-pre-wrap">
              {mensaje || 'El mensaje aparecerá aquí...'}
            </p>
            {footer && <p className="text-xs text-muted-foreground italic mt-2">{footer}</p>}
            {uniqueVars.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Variables detectadas: {uniqueVars.join(', ')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Al crear una campaña con esta plantilla, se asignarán a columnas de BigQuery.
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-md border border-destructive/20 bg-destructive/10 text-sm text-destructive">
              {error}
            </div>
          )}
        </form>

        <div className="p-6 border-t border-border flex justify-end gap-3 flex-shrink-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !nombre.trim() || !mensaje.trim()}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Creando en Meta...
              </span>
            ) : (
              'Crear en Meta'
            )}
          </Button>
        </div>
      </Card>
    </div>
  )
}
