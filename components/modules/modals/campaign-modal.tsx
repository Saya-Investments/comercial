'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X, Loader2, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react'

interface Template {
  id: string
  name: string
  subject: string
  content: string
}

interface BQColumn {
  name: string
  type: string
}

interface CampaignModalProps {
  onClose: () => void
  onCreated?: () => void
}

// Extract {{1}}, {{2}}, etc. from template content
function extractVariables(content: string): string[] {
  const matches = content.match(/\{\{\d+\}\}/g)
  if (!matches) return []
  return [...new Set(matches)].sort()
}

export function CampaignModal({ onClose, onCreated }: CampaignModalProps) {
  const [step, setStep] = useState<'basic' | 'config' | 'preview'>('basic')
  const [saving, setSaving] = useState(false)
  const [importResult, setImportResult] = useState<{
    id: string; leadsImported: number; totalBQ?: number;
    skippedNoPhone?: number; skippedDuplicate?: number; errors?: number;
  } | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    table: '',
    sedes: [] as string[],
    subOrigenes: [] as string[],
    templateId: '',
  })

  // Variable mapping: { "{{1}}": "Nombres", "{{2}}": "Telefono" }
  const [variableMapping, setVariableMapping] = useState<Record<string, string>>({})

  // Dynamic filter options from BigQuery
  const [sedeOptions, setSedeOptions] = useState<string[]>([])
  const [subOrigenOptions, setSubOrigenOptions] = useState<string[]>([])
  const [loadingFilters, setLoadingFilters] = useState(false)

  // Templates from DB
  const [templates, setTemplates] = useState<Template[]>([])

  // Columns from BigQuery table
  const [columns, setColumns] = useState<BQColumn[]>([])

  // Lead count preview
  const [leadCount, setLeadCount] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState(false)

  // Leads preview data
  const [previewLeads, setPreviewLeads] = useState<Record<string, unknown>[]>([])
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewPage, setPreviewPage] = useState(0)
  const previewPageSize = 10

  // Dynamic tables from BigQuery
  const [tables, setTables] = useState<string[]>([])

  // Fetch tables and templates on mount
  useEffect(() => {
    fetch('/api/bigquery?action=tables')
      .then(res => res.json())
      .then(data => {
        const t = data.tables || []
        setTables(t)
        if (t.length > 0 && !t.includes(formData.table)) {
          setFormData(prev => ({ ...prev, table: t[0] }))
        }
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    fetch('/api/templates')
      .then(res => res.json())
      .then((data: Template[]) => setTemplates(data))
      .catch(console.error)
  }, [])

  // Fetch columns when table changes
  useEffect(() => {
    fetch(`/api/bigquery?action=columns&table=${formData.table}`)
      .then(res => res.json())
      .then(data => setColumns(data.columns || []))
      .catch(console.error)
  }, [formData.table])

  // Fetch filter options when table changes & step is config
  useEffect(() => {
    if (step !== 'config') return
    setLoadingFilters(true)
    setSedeOptions([])
    setSubOrigenOptions([])
    setFormData(prev => ({ ...prev, sedes: [], subOrigenes: [] }))

    fetch(`/api/bigquery?action=filters&table=${formData.table}`)
      .then(res => res.json())
      .then(data => {
        setSedeOptions(data.sedes || [])
        setSubOrigenOptions(data.subOrigenes || [])
      })
      .catch(console.error)
      .finally(() => setLoadingFilters(false))
  }, [formData.table, step])

  // Build filter query params helper
  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams()
    params.set('table', formData.table)
    formData.sedes.forEach(s => params.append('sede', s))
    formData.subOrigenes.forEach(s => params.append('suborigen', s))
    return params
  }, [formData.table, formData.sedes, formData.subOrigenes])

  // Fetch lead count when filters change
  useEffect(() => {
    if (step !== 'config' && step !== 'preview') return
    setLoadingCount(true)

    const params = buildFilterParams()
    params.set('action', 'count')

    fetch(`/api/bigquery?${params}`)
      .then(res => res.json())
      .then(data => setLeadCount(data.total ?? null))
      .catch(() => setLeadCount(null))
      .finally(() => setLoadingCount(false))
  }, [buildFilterParams, step])

  // Fetch preview leads when entering preview step
  useEffect(() => {
    if (step !== 'preview') return
    setLoadingPreview(true)
    setPreviewPage(0)

    const params = buildFilterParams()
    params.set('action', 'leads')
    params.set('limit', '100')

    fetch(`/api/bigquery?${params}`)
      .then(res => res.json())
      .then(data => setPreviewLeads(data.leads || []))
      .catch(console.error)
      .finally(() => setLoadingPreview(false))
  }, [buildFilterParams, step])

  // Derive template variables
  const selectedTemplate = templates.find(t => t.id === formData.templateId)
  const templateVars = selectedTemplate ? extractVariables(selectedTemplate.content) : []

  // Reset variable mapping when template changes
  useEffect(() => {
    setVariableMapping({})
  }, [formData.templateId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSedeChange = (sede: string, checked: boolean) => {
    setFormData({
      ...formData,
      sedes: checked
        ? [...formData.sedes, sede]
        : formData.sedes.filter(s => s !== sede),
    })
  }

  const handleSubOrigenChange = (sub: string, checked: boolean) => {
    setFormData({
      ...formData,
      subOrigenes: checked
        ? [...formData.subOrigenes, sub]
        : formData.subOrigenes.filter(s => s !== sub),
    })
  }

  const handleVariableChange = (variable: string, column: string) => {
    setVariableMapping(prev => ({ ...prev, [variable]: column }))
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()

    if (step === 'basic') {
      if (!formData.name.trim()) return
      setStep('config')
      return
    }

    if (step === 'config') {
      setStep('preview')
      return
    }

    // Create campaign + import leads from BigQuery
    setSaving(true)
    try {
      const filters = {
        sedes: formData.sedes,
        subOrigenes: formData.subOrigenes,
      }

      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          database: formData.table,
          filters,
          templateId: formData.templateId || null,
          totalLeads: leadCount || 0,
          variables: templateVars.length > 0 ? variableMapping : {},
        }),
      })

      if (!res.ok) throw new Error('Error creating campaign')

      const result = await res.json()
      setImportResult(result)
      onCreated?.()
    } catch (err) {
      console.error('Error creating campaign:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => {
    if (step === 'config') setStep('basic')
    else if (step === 'preview') setStep('config')
  }

  // Preview table columns to show (pick the most relevant ones)
  const previewColumns = previewLeads.length > 0
    ? Object.keys(previewLeads[0]).slice(0, 8)
    : []

  const pagedLeads = previewLeads.slice(
    previewPage * previewPageSize,
    (previewPage + 1) * previewPageSize
  )
  const totalPages = Math.ceil(previewLeads.length / previewPageSize)

  // Render template content with variable preview
  const renderTemplatePreview = () => {
    if (!selectedTemplate) return null
    let preview = selectedTemplate.content
    for (const [variable, column] of Object.entries(variableMapping)) {
      if (column) {
        preview = preview.replace(new RegExp(variable.replace(/[{}]/g, '\\$&'), 'g'), `[${column}]`)
      }
    }
    return preview
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card className={`w-full flex flex-col max-h-[90vh] ${step === 'preview' ? 'max-w-5xl' : 'max-w-2xl'}`}>
        <div className="flex justify-between items-center p-6 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {step === 'basic' ? 'Nueva Campaña' : step === 'config' ? 'Configuración' : 'Previsualización'}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {step === 'basic'
                ? 'Define los datos básicos de la campaña'
                : step === 'config'
                  ? 'Configura los detalles de envío'
                  : 'Revisa los leads y confirma la campaña'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-lg transition-colors">
            <X className="w-5 h-5 text-foreground" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {step === 'basic' && (
            <>
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Nombre de Campaña</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Ej: Campaña Leads Marzo 2026"
                  className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Descripción</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Describe los objetivos de la campaña"
                  className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary h-24"
                />
              </div>
            </>
          )}

          {step === 'config' && (
            <>
              {/* BigQuery Table Selector */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Tabla BigQuery (Dataset: Leads)
                </label>
                <select
                  name="table"
                  value={formData.table}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
                >
                  {tables.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Filters: Sede */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Filtro por Sede</label>
                {loadingFilters ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Cargando sedes...
                  </div>
                ) : sedeOptions.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                    {sedeOptions.map((sede) => (
                      <label key={sede} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.sedes.includes(sede)}
                          onChange={(e) => handleSedeChange(sede, e.target.checked)}
                          className="rounded border-border"
                        />
                        <span className="ml-2 text-sm text-foreground">{sede}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No hay sedes disponibles</p>
                )}
              </div>

              {/* Filters: SubOrigen */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Filtro por SubOrigen</label>
                {loadingFilters ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Cargando sub-orígenes...
                  </div>
                ) : subOrigenOptions.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                    {subOrigenOptions.map((sub) => (
                      <label key={sub} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.subOrigenes.includes(sub)}
                          onChange={(e) => handleSubOrigenChange(sub, e.target.checked)}
                          className="rounded border-border"
                        />
                        <span className="ml-2 text-sm text-foreground">{sub}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No hay sub-orígenes disponibles</p>
                )}
              </div>

              {/* Template from DB */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Plantilla de Mensaje</label>
                <select
                  name="templateId"
                  value={formData.templateId}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="">-- Seleccionar plantilla --</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                  ))}
                </select>
              </div>

              {/* Template content preview */}
              {selectedTemplate && (
                <div className="bg-secondary/30 border border-border rounded-lg p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Contenido de plantilla:</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{selectedTemplate.content}</p>
                </div>
              )}

              {/* Variable mapping */}
              {templateVars.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">
                    Asignar variables de plantilla
                  </label>
                  <div className="space-y-2">
                    {templateVars.map((v) => (
                      <div key={v} className="flex items-center gap-3">
                        <span className="text-sm font-mono bg-secondary px-2 py-1 rounded min-w-[60px] text-center text-foreground">
                          {v}
                        </span>
                        <span className="text-sm text-muted-foreground">=</span>
                        <select
                          value={variableMapping[v] || ''}
                          onChange={(e) => handleVariableChange(v, e.target.value)}
                          className="flex-1 px-3 py-1.5 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:border-primary"
                        >
                          <option value="">-- Seleccionar columna --</option>
                          {columns.map((col) => (
                            <option key={col.name} value={col.name}>{col.name}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  {/* Live preview of template with mapped columns */}
                  <div className="mt-3 bg-secondary/30 border border-border rounded-lg p-3">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Vista previa del mensaje:</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{renderTemplatePreview()}</p>
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="bg-secondary/50 border border-border rounded-lg p-4">
                <p className="text-sm font-semibold text-foreground mb-2">Resumen de Configuración</p>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Tabla: {formData.table}</p>
                  <p>Sedes: {formData.sedes.length > 0 ? formData.sedes.join(', ') : 'Todas'}</p>
                  <p>SubOrígenes: {formData.subOrigenes.length > 0 ? formData.subOrigenes.join(', ') : 'Todos'}</p>
                  <p>Plantilla: {selectedTemplate?.name || 'Sin seleccionar'}</p>
                  <p className="font-semibold text-foreground">
                    Leads encontrados:{' '}
                    {loadingCount ? (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> calculando...
                      </span>
                    ) : (
                      leadCount?.toLocaleString() ?? '—'
                    )}
                  </p>
                </div>
              </div>
            </>
          )}

          {step === 'preview' && (
            <>
              {/* Import success result */}
              {importResult && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-800">Campaña creada exitosamente</p>
                    <p className="text-sm text-green-700 mt-1">
                      Se vincularon <span className="font-bold">{importResult.leadsImported.toLocaleString()}</span> leads
                      a la campaña (de {importResult.totalBQ?.toLocaleString() ?? '?'} registros en BigQuery).
                    </p>
                    {((importResult.skippedNoPhone ?? 0) > 0 || (importResult.skippedDuplicate ?? 0) > 0 || (importResult.errors ?? 0) > 0) && (
                      <p className="text-xs text-green-600 mt-1">
                        {importResult.skippedNoPhone ? `${importResult.skippedNoPhone} sin teléfono válido` : ''}
                        {importResult.skippedNoPhone && importResult.skippedDuplicate ? ' · ' : ''}
                        {importResult.skippedDuplicate ? `${importResult.skippedDuplicate} duplicados` : ''}
                        {(importResult.skippedNoPhone || importResult.skippedDuplicate) && importResult.errors ? ' · ' : ''}
                        {importResult.errors ? `${importResult.errors} errores` : ''}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Saving overlay */}
              {saving && (
                <div className="bg-secondary/50 border border-border rounded-lg p-6 flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-accent" />
                  <div className="text-center">
                    <p className="text-sm font-semibold text-foreground">Creando campaña e importando leads...</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Importando {leadCount?.toLocaleString() ?? ''} leads desde BigQuery. Esto puede tomar un momento.
                    </p>
                  </div>
                </div>
              )}

              {!saving && !importResult && (
                <>
                  {/* Lead count banner */}
                  <div className="flex items-center justify-between bg-secondary/50 border border-border rounded-lg px-4 py-3">
                    <div className="text-sm text-foreground">
                      <span className="font-semibold">Total leads:</span>{' '}
                      {loadingCount ? (
                        <Loader2 className="w-3 h-3 animate-spin inline" />
                      ) : (
                        <span className="font-bold">{leadCount?.toLocaleString() ?? '—'}</span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Tabla: <span className="font-medium text-foreground">{formData.table}</span>
                      {formData.sedes.length > 0 && (
                        <> | Sedes: <span className="font-medium text-foreground">{formData.sedes.join(', ')}</span></>
                      )}
                      {formData.subOrigenes.length > 0 && (
                        <> | SubOrígenes: <span className="font-medium text-foreground">{formData.subOrigenes.join(', ')}</span></>
                      )}
                    </div>
                  </div>

                  {/* Leads preview table */}
                  {loadingPreview ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-muted-foreground">Cargando leads...</span>
                    </div>
                  ) : previewLeads.length > 0 ? (
                    <>
                      <div className="border border-border rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-secondary border-b border-border">
                                {previewColumns.map((col) => (
                                  <th key={col} className="px-3 py-2 text-left font-semibold text-foreground whitespace-nowrap">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {pagedLeads.map((lead, i) => (
                                <tr key={i} className="border-b border-border hover:bg-secondary/30">
                                  {previewColumns.map((col) => (
                                    <td key={col} className="px-3 py-2 text-muted-foreground whitespace-nowrap max-w-[200px] truncate">
                                      {String(lead[col] ?? '')}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Pagination */}
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          Mostrando {previewPage * previewPageSize + 1}-{Math.min((previewPage + 1) * previewPageSize, previewLeads.length)} de {previewLeads.length} (muestra)
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={previewPage === 0}
                            onClick={() => setPreviewPage(p => p - 1)}
                            className="h-7 w-7 p-0"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            {previewPage + 1} / {totalPages}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={previewPage >= totalPages - 1}
                            onClick={() => setPreviewPage(p => p + 1)}
                            className="h-7 w-7 p-0"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      No se encontraron leads con los filtros seleccionados
                    </div>
                  )}

                  {/* Variable mapping reminder */}
                  {selectedTemplate && templateVars.length > 0 && (
                    <div className="bg-secondary/30 border border-border rounded-lg p-3">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Mapeo de variables:</p>
                      <div className="flex flex-wrap gap-2">
                        {templateVars.map((v) => (
                          <span key={v} className="text-xs bg-secondary px-2 py-1 rounded text-foreground">
                            {v} = <span className="font-semibold">{variableMapping[v] || '(sin asignar)'}</span>
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">Mensaje: {renderTemplatePreview()}</p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="p-6 border-t border-border flex justify-between flex-shrink-0">
          {importResult ? (
            <div className="w-full flex justify-end">
              <Button onClick={onClose} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                Cerrar
              </Button>
            </div>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={step === 'basic' ? onClose : handleBack}
                disabled={saving}
              >
                {step === 'basic' ? 'Cancelar' : 'Atrás'}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={saving || (step === 'basic' && !formData.name.trim())}
                className="bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Importando leads...
                  </span>
                ) : step === 'basic' ? 'Siguiente' : step === 'config' ? 'Ver Leads' : 'Crear Campaña'}
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
