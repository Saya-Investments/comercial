'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X, Loader2, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react'
import { BQ_NULL_SENTINEL } from '@/lib/bq-constants'

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

type CampaignSource = 'bigquery' | 'recordatorio'

const PREVIEW_COLUMN_SPECS = [
  { label: 'Nombres', candidates: ['Nombres', 'nombres'] },
  { label: 'Apellidos', candidates: ['Apellidos', 'apellidos'] },
  { label: 'telefono_normalizado', candidates: ['telefono_normalizado', 'Telefono_Normalizado', 'telefonoNormalizado'] },
  { label: 'Email', candidates: ['Email', 'email', 'email_normalizado'] },
  { label: 'Linea', candidates: ['Linea', 'linea'] },
  { label: 'Bucket', candidates: ['Bucket', 'bucket'] },
] as const

const RECORDATORIO_PREVIEW_COLUMNS = [
  { label: 'Nombre', key: 'nombre' },
  { label: 'Apellido', key: 'apellido' },
  { label: 'Telefono', key: 'numero' },
  { label: 'Correo', key: 'correo' },
  { label: 'Estado Prospecto', key: 'estado_documento' },
]

const RECORDATORIO_COLUMNS: BQColumn[] = [
  { name: 'nombre', type: 'STRING' },
  { name: 'apellido', type: 'STRING' },
  { name: 'numero', type: 'STRING' },
  { name: 'correo', type: 'STRING' },
]

function extractVariables(content: string): string[] {
  const matches = content.match(/\{\{\d+\}\}/g)
  if (!matches) return []
  return [...new Set(matches)].sort()
}

function resolvePreviewColumn(columns: BQColumn[], candidates: readonly string[]) {
  return columns.find((column) => candidates.includes(column.name))?.name
}

export function CampaignModal({ onClose, onCreated }: CampaignModalProps) {
  const [step, setStep] = useState<'basic' | 'config' | 'preview'>('basic')
  const [saving, setSaving] = useState(false)
  const [importResult, setImportResult] = useState<{
    id: string
    leadsImported: number
    totalBQ?: number
    skippedNoPhone?: number
    skippedDuplicate?: number
    errors?: number
    source?: string
  } | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    source: 'bigquery' as CampaignSource,
    table: '',
    buckets: [] as string[],
    lineas: [] as string[],
    estadosAsociadosFondos: [] as string[],
    estadosProspecto: [] as string[],
    templateId: '',
  })

  const [variableMapping, setVariableMapping] = useState<Record<string, string>>({})
  const [bucketOptions, setBucketOptions] = useState<string[]>([])
  const [lineaOptions, setLineaOptions] = useState<string[]>([])
  const [estadoAsociadoFondosOptions, setEstadoAsociadoFondosOptions] = useState<string[]>([])
  const [hasNullEstadoAsociadoFondos, setHasNullEstadoAsociadoFondos] = useState(false)
  const [loadingFilters, setLoadingFilters] = useState(false)
  const [estadoProspectoOptions, setEstadoProspectoOptions] = useState<string[]>([])
  const [loadingProspectoFilters, setLoadingProspectoFilters] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [columns, setColumns] = useState<BQColumn[]>([])
  const [leadCount, setLeadCount] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState(false)
  const [previewLeads, setPreviewLeads] = useState<Record<string, unknown>[]>([])
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewPage, setPreviewPage] = useState(0)
  const [tables, setTables] = useState<string[]>([])

  const previewPageSize = 10

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

  useEffect(() => {
    if (!formData.table || formData.source !== 'bigquery') return

    fetch(`/api/bigquery?action=columns&table=${formData.table}`)
      .then(res => res.json())
      .then(data => setColumns(data.columns || []))
      .catch(console.error)
  }, [formData.table, formData.source])

  useEffect(() => {
    if (step !== 'config' || formData.source !== 'bigquery' || !formData.table) return

    setLoadingFilters(true)
    setBucketOptions([])
    setLineaOptions([])
    setEstadoAsociadoFondosOptions([])
    setHasNullEstadoAsociadoFondos(false)
    setFormData(prev => ({ ...prev, buckets: [], lineas: [], estadosAsociadosFondos: [] }))

    fetch(`/api/bigquery?action=filters&table=${formData.table}`)
      .then(res => res.json())
      .then(data => {
        setBucketOptions(data.buckets || [])
        setLineaOptions(data.lineas || [])
        setEstadoAsociadoFondosOptions(data.estadosAsociadosFondos || [])
        setHasNullEstadoAsociadoFondos(Boolean(data.hasNullEstadoAsociadoFondos))
      })
      .catch(console.error)
      .finally(() => setLoadingFilters(false))
  }, [formData.table, formData.source, step])

  useEffect(() => {
    if (step !== 'config' || formData.source !== 'recordatorio') return

    setLoadingProspectoFilters(true)
    fetch('/api/prospects-campaign?action=filters')
      .then(res => res.json())
      .then(data => setEstadoProspectoOptions(data.estados || []))
      .catch(console.error)
      .finally(() => setLoadingProspectoFilters(false))
  }, [formData.source, step])

  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams()
    params.set('table', formData.table)
    formData.buckets.forEach(bucket => params.append('bucket', bucket))
    formData.lineas.forEach(linea => params.append('linea', linea))
    formData.estadosAsociadosFondos.forEach(estado => params.append('estado_asociado_fondos', estado))
    return params
  }, [formData.table, formData.buckets, formData.lineas, formData.estadosAsociadosFondos])

  const buildRecordatorioParams = useCallback(() => {
    const params = new URLSearchParams()
    formData.estadosProspecto.forEach(e => params.append('estados', e))
    return params
  }, [formData.estadosProspecto])

  useEffect(() => {
    if (step !== 'config' && step !== 'preview') return

    if (formData.source === 'recordatorio') {
      if (formData.estadosProspecto.length === 0) {
        setLeadCount(0)
        return
      }
      setLoadingCount(true)
      const params = buildRecordatorioParams()
      params.set('action', 'count')
      fetch(`/api/prospects-campaign?${params}`)
        .then(res => res.json())
        .then(data => setLeadCount(data.total ?? null))
        .catch(() => setLeadCount(null))
        .finally(() => setLoadingCount(false))
      return
    }

    if (!formData.table) return
    setLoadingCount(true)
    const params = buildFilterParams()
    params.set('action', 'count')
    fetch(`/api/bigquery?${params}`)
      .then(res => res.json())
      .then(data => setLeadCount(data.total ?? null))
      .catch(() => setLeadCount(null))
      .finally(() => setLoadingCount(false))
  }, [formData.source, formData.table, buildFilterParams, buildRecordatorioParams, step])

  useEffect(() => {
    if (step !== 'preview') return

    setLoadingPreview(true)
    setPreviewPage(0)

    if (formData.source === 'recordatorio') {
      if (formData.estadosProspecto.length === 0) {
        setPreviewLeads([])
        setLoadingPreview(false)
        return
      }
      const params = buildRecordatorioParams()
      params.set('action', 'leads')
      fetch(`/api/prospects-campaign?${params}`)
        .then(res => res.json())
        .then(data => setPreviewLeads(data.leads || []))
        .catch(console.error)
        .finally(() => setLoadingPreview(false))
      return
    }

    if (!formData.table) {
      setLoadingPreview(false)
      return
    }
    const params = buildFilterParams()
    params.set('action', 'leads')
    fetch(`/api/bigquery?${params}`)
      .then(res => res.json())
      .then(data => setPreviewLeads(data.leads || []))
      .catch(console.error)
      .finally(() => setLoadingPreview(false))
  }, [formData.source, buildFilterParams, buildRecordatorioParams, step, formData.table])

  const selectedTemplate = templates.find(t => t.id === formData.templateId)
  const templateVars = selectedTemplate ? extractVariables(selectedTemplate.content) : []

  useEffect(() => {
    setVariableMapping({})
  }, [formData.templateId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSourceChange = (source: CampaignSource) => {
    setFormData(prev => ({
      ...prev,
      source,
      buckets: [],
      lineas: [],
      estadosAsociadosFondos: [],
      estadosProspecto: [],
    }))
    setLeadCount(null)
    setPreviewLeads([])
  }

  const handleBucketChange = (bucket: string, checked: boolean) => {
    setFormData({
      ...formData,
      buckets: checked
        ? [...formData.buckets, bucket]
        : formData.buckets.filter(b => b !== bucket),
    })
  }

  const handleLineaChange = (linea: string, checked: boolean) => {
    setFormData({
      ...formData,
      lineas: checked
        ? [...formData.lineas, linea]
        : formData.lineas.filter(l => l !== linea),
    })
  }

  const handleEstadoAsociadoFondosChange = (estado: string, checked: boolean) => {
    setFormData({
      ...formData,
      estadosAsociadosFondos: checked
        ? [...formData.estadosAsociadosFondos, estado]
        : formData.estadosAsociadosFondos.filter(e => e !== estado),
    })
  }

  const handleEstadoProspectoChange = (estado: string, checked: boolean) => {
    setFormData({
      ...formData,
      estadosProspecto: checked
        ? [...formData.estadosProspecto, estado]
        : formData.estadosProspecto.filter(e => e !== estado),
    })
  }

  const formatEstadoAsociadoFondos = (estado: string) =>
    estado === BQ_NULL_SENTINEL ? '(Sin estado)' : estado

  const handleVariableChange = (variable: string, column: string) => {
    setVariableMapping(prev => ({ ...prev, [variable]: column }))
  }

  const activeColumns = formData.source === 'recordatorio' ? RECORDATORIO_COLUMNS : columns

  const handleSubmit = async () => {

    if (step === 'basic') {
      if (!formData.name.trim()) return
      setStep('config')
      return
    }

    if (step === 'config') {
      setStep('preview')
      return
    }

    setSaving(true)
    try {
      let body: Record<string, unknown>

      if (formData.source === 'recordatorio') {
        body = {
          name: formData.name,
          source: 'recordatorio',
          estadosProspecto: formData.estadosProspecto,
          templateId: formData.templateId || null,
          variables: templateVars.length > 0 ? variableMapping : {},
        }
      } else {
        body = {
          name: formData.name,
          source: 'bigquery',
          database: formData.table,
          filters: { buckets: formData.buckets, lineas: formData.lineas },
          ephemeralFilters: { estadosAsociadosFondos: formData.estadosAsociadosFondos },
          templateId: formData.templateId || null,
          totalLeads: leadCount || 0,
          variables: templateVars.length > 0 ? variableMapping : {},
        }
      }

      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  const previewColumns = PREVIEW_COLUMN_SPECS.map((column) => ({
    label: column.label,
    key: resolvePreviewColumn(columns, column.candidates),
  }))

  const pagedLeads = previewLeads.slice(
    previewPage * previewPageSize,
    (previewPage + 1) * previewPageSize
  )
  const totalPages = Math.ceil(previewLeads.length / previewPageSize)

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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <Card className={`flex max-h-[90vh] w-full flex-col ${step === 'preview' ? 'max-w-5xl' : 'max-w-2xl'}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-border p-6">
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {step === 'basic' ? 'Nueva Campana' : step === 'config' ? 'Configuracion' : 'Previsualizacion'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {step === 'basic'
                ? 'Define los datos basicos de la campana'
                : step === 'config'
                  ? 'Configura los detalles de envio'
                  : 'Revisa los leads y confirma la campana'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 transition-colors hover:bg-secondary">
            <X className="h-5 w-5 text-foreground" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {step === 'basic' && (
            <>
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Nombre de Campana</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Ej: Campana Leads Abril 2026"
                  className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Descripcion</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Describe los objetivos de la campana"
                  className="h-24 w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:outline-none"
                />
              </div>
            </>
          )}

          {step === 'config' && (
            <>
              {/* Selector de fuente */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Fuente de leads</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleSourceChange('bigquery')}
                    className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      formData.source === 'bigquery'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:bg-secondary'
                    }`}
                  >
                    BigQuery
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSourceChange('recordatorio')}
                    className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      formData.source === 'recordatorio'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:bg-secondary'
                    }`}
                  >
                    Recordatorio
                  </button>
                </div>
              </div>

              {/* Filtros BigQuery */}
              {formData.source === 'bigquery' && (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-foreground">
                      Tabla BigQuery (Dataset: Leads)
                    </label>
                    <select
                      name="table"
                      value={formData.table}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:outline-none"
                    >
                      {tables.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-foreground">Filtro por Bucket</label>
                    {loadingFilters ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando buckets...
                      </div>
                    ) : bucketOptions.length > 0 ? (
                      <div className="grid max-h-32 grid-cols-2 gap-2 overflow-y-auto">
                        {bucketOptions.map((bucket) => (
                          <label key={bucket} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={formData.buckets.includes(bucket)}
                              onChange={(e) => handleBucketChange(bucket, e.target.checked)}
                              className="rounded border-border"
                            />
                            <span className="ml-2 text-sm text-foreground">{bucket}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No hay buckets disponibles</p>
                    )}
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-foreground">Filtro por Linea</label>
                    {loadingFilters ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando lineas...
                      </div>
                    ) : lineaOptions.length > 0 ? (
                      <div className="grid max-h-32 grid-cols-2 gap-2 overflow-y-auto">
                        {lineaOptions.map((linea) => (
                          <label key={linea} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={formData.lineas.includes(linea)}
                              onChange={(e) => handleLineaChange(linea, e.target.checked)}
                              className="rounded border-border"
                            />
                            <span className="ml-2 text-sm text-foreground">{linea}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No hay lineas disponibles</p>
                    )}
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-foreground">
                      Filtro por Estado Asociado Fondos
                    </label>
                    {loadingFilters ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando estados...
                      </div>
                    ) : estadoAsociadoFondosOptions.length > 0 || hasNullEstadoAsociadoFondos ? (
                      <div className="grid max-h-32 grid-cols-2 gap-2 overflow-y-auto">
                        {estadoAsociadoFondosOptions.map((estado) => (
                          <label key={estado} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={formData.estadosAsociadosFondos.includes(estado)}
                              onChange={(e) => handleEstadoAsociadoFondosChange(estado, e.target.checked)}
                              className="rounded border-border"
                            />
                            <span className="ml-2 text-sm text-foreground">{estado}</span>
                          </label>
                        ))}
                        {hasNullEstadoAsociadoFondos && (
                          <label key={BQ_NULL_SENTINEL} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={formData.estadosAsociadosFondos.includes(BQ_NULL_SENTINEL)}
                              onChange={(e) =>
                                handleEstadoAsociadoFondosChange(BQ_NULL_SENTINEL, e.target.checked)
                              }
                              className="rounded border-border"
                            />
                            <span className="ml-2 text-sm italic text-muted-foreground">(Sin estado)</span>
                          </label>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Esta tabla no tiene la columna estado_asociado_fondos
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* Filtros Recordatorio */}
              {formData.source === 'recordatorio' && (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-foreground">
                    Filtro por estado del prospecto
                  </label>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Selecciona los estados del funnel para enviar recordatorios a esos prospectos.
                  </p>
                  {loadingProspectoFilters ? (
                    <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Cargando estados...
                    </div>
                  ) : estadoProspectoOptions.length > 0 ? (
                    <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto">
                      {estadoProspectoOptions.map((estado) => (
                        <label key={estado} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={formData.estadosProspecto.includes(estado)}
                            onChange={(e) => handleEstadoProspectoChange(estado, e.target.checked)}
                            className="rounded border-border"
                          />
                          <span className="ml-2 text-sm text-foreground">{estado}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No hay estados disponibles</p>
                  )}
                </div>
              )}

              {/* Plantilla y variables (comun a ambas fuentes) */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Plantilla de Mensaje</label>
                <select
                  name="templateId"
                  value={formData.templateId}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="">-- Seleccionar plantilla --</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                  ))}
                </select>
              </div>

              {selectedTemplate && (
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">Contenido de plantilla:</p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{selectedTemplate.content}</p>
                </div>
              )}

              {templateVars.length > 0 && (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-foreground">
                    Asignar variables de plantilla
                  </label>
                  <div className="space-y-2">
                    {templateVars.map((v) => (
                      <div key={v} className="flex items-center gap-3">
                        <span className="min-w-[60px] rounded bg-secondary px-2 py-1 text-center font-mono text-sm text-foreground">
                          {v}
                        </span>
                        <span className="text-sm text-muted-foreground">=</span>
                        <select
                          value={variableMapping[v] || ''}
                          onChange={(e) => handleVariableChange(v, e.target.value)}
                          className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
                        >
                          <option value="">-- Seleccionar columna --</option>
                          {activeColumns.map((col) => (
                            <option key={col.name} value={col.name}>{col.name}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-3">
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">Vista previa del mensaje:</p>
                    <p className="whitespace-pre-wrap text-sm text-foreground">{renderTemplatePreview()}</p>
                  </div>
                </div>
              )}

              {/* Resumen de configuracion */}
              <div className="rounded-lg border border-border bg-secondary/50 p-4">
                <p className="mb-2 text-sm font-semibold text-foreground">Resumen de Configuracion</p>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>Fuente: {formData.source === 'recordatorio' ? 'Recordatorio (funnel de prospectos)' : `BigQuery — ${formData.table}`}</p>
                  {formData.source === 'bigquery' && (
                    <>
                      <p>Buckets: {formData.buckets.length > 0 ? formData.buckets.join(', ') : 'Todos'}</p>
                      <p>Lineas: {formData.lineas.length > 0 ? formData.lineas.join(', ') : 'Todas'}</p>
                      <p>
                        Estado Asociado Fondos:{' '}
                        {formData.estadosAsociadosFondos.length > 0
                          ? formData.estadosAsociadosFondos.map(formatEstadoAsociadoFondos).join(', ')
                          : 'Todos'}
                      </p>
                    </>
                  )}
                  {formData.source === 'recordatorio' && (
                    <p>
                      Estados prospecto:{' '}
                      {formData.estadosProspecto.length > 0
                        ? formData.estadosProspecto.join(', ')
                        : 'Ninguno seleccionado'}
                    </p>
                  )}
                  <p>Plantilla: {selectedTemplate?.name || 'Sin seleccionar'}</p>
                  <p className="font-semibold text-foreground">
                    Leads encontrados:{' '}
                    {loadingCount ? (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> calculando...
                      </span>
                    ) : (
                      leadCount?.toLocaleString() ?? '-'
                    )}
                  </p>
                </div>
              </div>
            </>
          )}

          {step === 'preview' && (
            <>
              {importResult && (
                <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                  <div>
                    <p className="text-sm font-semibold text-green-800">Campana creada exitosamente</p>
                    <p className="mt-1 text-sm text-green-700">
                      Se vincularon <span className="font-bold">{importResult.leadsImported.toLocaleString()}</span> leads
                      a la campana (de {importResult.totalBQ?.toLocaleString() ?? '?'}{' '}
                      {importResult.source === 'recordatorio' ? 'prospectos seleccionados' : 'registros en BigQuery'}).
                    </p>
                    {((importResult.skippedNoPhone ?? 0) > 0 || (importResult.skippedDuplicate ?? 0) > 0 || (importResult.errors ?? 0) > 0) && (
                      <p className="mt-1 text-xs text-green-600">
                        {importResult.skippedNoPhone ? `${importResult.skippedNoPhone} sin telefono valido` : ''}
                        {importResult.skippedNoPhone && importResult.skippedDuplicate ? ' · ' : ''}
                        {importResult.skippedDuplicate ? `${importResult.skippedDuplicate} duplicados` : ''}
                        {(importResult.skippedNoPhone || importResult.skippedDuplicate) && importResult.errors ? ' · ' : ''}
                        {importResult.errors ? `${importResult.errors} errores` : ''}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {saving && (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-secondary/50 p-6">
                  <Loader2 className="h-8 w-8 animate-spin text-accent" />
                  <div className="text-center">
                    <p className="text-sm font-semibold text-foreground">Creando campana e importando leads...</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formData.source === 'recordatorio'
                        ? `Vinculando ${leadCount?.toLocaleString() ?? ''} prospectos. Esto puede tomar un momento.`
                        : `Importando ${leadCount?.toLocaleString() ?? ''} leads desde BigQuery. Esto puede tomar un momento.`}
                    </p>
                  </div>
                </div>
              )}

              {!saving && !importResult && (
                <>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-4 py-3">
                    <div className="text-sm text-foreground">
                      <span className="font-semibold">Total leads:</span>{' '}
                      {loadingCount ? (
                        <Loader2 className="inline h-3 w-3 animate-spin" />
                      ) : (
                        <span className="font-bold">{leadCount?.toLocaleString() ?? '-'}</span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formData.source === 'recordatorio' ? (
                        <>
                          Fuente: <span className="font-medium text-foreground">Recordatorio</span>
                          {formData.estadosProspecto.length > 0 && (
                            <> | Estados: <span className="font-medium text-foreground">{formData.estadosProspecto.join(', ')}</span></>
                          )}
                        </>
                      ) : (
                        <>
                          Tabla: <span className="font-medium text-foreground">{formData.table}</span>
                          {formData.buckets.length > 0 && (
                            <> | Buckets: <span className="font-medium text-foreground">{formData.buckets.join(', ')}</span></>
                          )}
                          {formData.lineas.length > 0 && (
                            <> | Lineas: <span className="font-medium text-foreground">{formData.lineas.join(', ')}</span></>
                          )}
                          {formData.estadosAsociadosFondos.length > 0 && (
                            <> | Estado Asociado Fondos:{' '}
                              <span className="font-medium text-foreground">
                                {formData.estadosAsociadosFondos.map(formatEstadoAsociadoFondos).join(', ')}
                              </span>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {loadingPreview ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-muted-foreground">Cargando leads...</span>
                    </div>
                  ) : previewLeads.length > 0 ? (
                    <>
                      <div className="overflow-hidden rounded-lg border border-border">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border bg-secondary">
                                {formData.source === 'recordatorio'
                                  ? RECORDATORIO_PREVIEW_COLUMNS.map((col) => (
                                      <th key={col.label} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-foreground">
                                        {col.label}
                                      </th>
                                    ))
                                  : previewColumns.map((col) => (
                                      <th key={col.label} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-foreground">
                                        {col.label}
                                      </th>
                                    ))}
                              </tr>
                            </thead>
                            <tbody>
                              {pagedLeads.map((lead, i) => (
                                <tr key={i} className="border-b border-border hover:bg-secondary/30">
                                  {formData.source === 'recordatorio'
                                    ? RECORDATORIO_PREVIEW_COLUMNS.map((col) => (
                                        <td key={col.label} className="max-w-[200px] truncate whitespace-nowrap px-3 py-2 text-muted-foreground">
                                          {String(lead[col.key] ?? '')}
                                        </td>
                                      ))
                                    : previewColumns.map((col) => (
                                        <td key={col.label} className="max-w-[200px] truncate whitespace-nowrap px-3 py-2 text-muted-foreground">
                                          {col.key ? String(lead[col.key] ?? '') : ''}
                                        </td>
                                      ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

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
                            <ChevronLeft className="h-4 w-4" />
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
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="py-12 text-center text-muted-foreground">
                      No se encontraron leads con los filtros seleccionados
                    </div>
                  )}

                  {selectedTemplate && templateVars.length > 0 && (
                    <div className="rounded-lg border border-border bg-secondary/30 p-3">
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">Mapeo de variables:</p>
                      <div className="flex flex-wrap gap-2">
                        {templateVars.map((v) => (
                          <span key={v} className="rounded bg-secondary px-2 py-1 text-xs text-foreground">
                            {v} = <span className="font-semibold">{variableMapping[v] || '(sin asignar)'}</span>
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">Mensaje: {renderTemplatePreview()}</p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 justify-between border-t border-border p-6">
          {importResult ? (
            <div className="flex w-full justify-end">
              <Button onClick={onClose} className="bg-accent text-accent-foreground hover:bg-accent/90">
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
                {step === 'basic' ? 'Cancelar' : 'Atras'}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  saving ||
                  (step === 'basic' && !formData.name.trim()) ||
                  (step === 'config' && formData.source === 'recordatorio' && formData.estadosProspecto.length === 0)
                }
                className="bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Importando leads...
                  </span>
                ) : step === 'basic' ? 'Siguiente' : step === 'config' ? 'Ver Leads' : 'Crear Campana'}
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
