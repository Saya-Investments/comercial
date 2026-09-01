'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { AsesorFilter } from '@/components/ui/asesor-filter'
import { useAuth } from '@/contexts/auth-context'
import { Phone, PhoneOff, PhoneMissed, AlertTriangle, Download, Mic, FileText } from 'lucide-react'
import type { CategoriaLlamada } from '@/lib/motivo-llamada'

// ─── Types ───────────────────────────────────────────────────────────────────

interface LlamadaAdmin {
  id: string
  fecha: string
  estado: string
  categoria: CategoriaLlamada
  etiqueta: string
  motivo: string | null
  accion: string | null
  direccion: string
  duracionSeg: number | null
  tieneGrabacion: boolean
  tieneTranscript: boolean
  tieneGestion: boolean
  asesor: { id: string; nombre: string }
  lead: { id: string; nombre: string; numero: string }
}

interface Resumen {
  total: number
  conectadas: number
  noConectadas: number
  indeterminadas: number
  tasaContacto: number | null
  duracionTotalSeg: number
  duracionPromedioSeg: number | null
}

interface MotivoAgrupado {
  motivo: string
  categoria: CategoriaLlamada
  n: number
}

interface Respuesta {
  llamadas: LlamadaAdmin[]
  asesores: { id: string; name: string }[]
  resumen: Resumen
  porMotivo: MotivoAgrupado[]
  truncado: boolean
}

// ─── Presentación ────────────────────────────────────────────────────────────

const COLOR: Record<CategoriaLlamada, string> = {
  conectada: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  no_contesto: 'bg-slate-100 text-slate-700 border-slate-200',
  sin_permiso: 'bg-amber-100 text-amber-800 border-amber-200',
  fallida: 'bg-red-100 text-red-800 border-red-200',
  indeterminada: 'bg-violet-100 text-violet-800 border-violet-200',
}

const BARRA: Record<CategoriaLlamada, string> = {
  conectada: 'bg-emerald-500',
  no_contesto: 'bg-slate-400',
  sin_permiso: 'bg-amber-500',
  fallida: 'bg-red-500',
  indeterminada: 'bg-violet-500',
}

function duracion(seg: number | null): string {
  if (seg == null) return '—'
  const m = Math.floor(seg / 60)
  const s = seg % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function fechaLima(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Fecha de hoy en Lima, en formato YYYY-MM-DD para los <input type="date">. */
function hoyLima(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
}

function haceDias(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
}

// ─── Módulo ──────────────────────────────────────────────────────────────────

export function AdminCallsModule() {
  const { user } = useAuth()

  const [desde, setDesde] = useState(haceDias(30))
  const [hasta, setHasta] = useState(hoyLima())
  const [asesorId, setAsesorId] = useState('')
  // null = todas. Al tocar una tarjeta del resumen se filtra la tabla por esa
  // categoria, que es la pregunta natural: "esas 4 sin permiso, ¿cuales son?".
  const [categoria, setCategoria] = useState<CategoriaLlamada | null>(null)

  const [data, setData] = useState<Respuesta | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!user?.id) return
    setCargando(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ userId: user.id, desde, hasta })
      if (asesorId) qs.set('asesorId', asesorId)
      const res = await fetch(`/api/admin/llamadas?${qs}`)
      if (res.status === 403) throw new Error('Tu usuario no tiene permiso para ver este módulo.')
      if (!res.ok) throw new Error('No se pudieron cargar las llamadas.')
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
      setData(null)
    } finally {
      setCargando(false)
    }
  }, [user?.id, desde, hasta, asesorId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const visibles = useMemo(() => {
    if (!data) return []
    return categoria ? data.llamadas.filter((l) => l.categoria === categoria) : data.llamadas
  }, [data, categoria])

  const exportar = () => {
    if (!data) return
    const cab = ['Fecha', 'Asesor', 'Lead', 'Número', 'Resultado', 'Motivo', 'Duración (seg)', 'Grabación', 'Gestión registrada']
    const filas = visibles.map((l) => [
      fechaLima(l.fecha),
      l.asesor.nombre,
      l.lead.nombre,
      l.lead.numero,
      l.etiqueta,
      l.motivo ?? '',
      l.duracionSeg ?? '',
      l.tieneGrabacion ? 'Sí' : 'No',
      l.tieneGestion ? 'Sí' : 'No',
    ])
    // Se escapan las comillas porque los motivos de Meta traen texto libre y una
    // sola comilla suelta corre todas las columnas del Excel.
    const csv = [cab, ...filas]
      .map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `llamadas_${desde}_a_${hasta}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const r = data?.resumen

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Llamadas</h1>
          <p className="text-sm text-muted-foreground">
            Todos los intentos de llamada del CRM, se hayan concretado o no, con el motivo de los que no.
          </p>
        </div>
        <button
          onClick={exportar}
          disabled={!visibles.length}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-border hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Desde</label>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Asesor</label>
            <AsesorFilter
              asesores={data?.asesores ?? []}
              value={asesorId}
              onChange={setAsesorId}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { setDesde(haceDias(30)); setHasta(hoyLima()); setAsesorId(''); setCategoria(null) }}
              className="px-3 py-2 text-sm rounded-lg border border-border hover:bg-secondary w-full"
            >
              Limpiar filtros
            </button>
          </div>
        </div>
      </Card>

      {error && (
        <Card className="p-4 border-red-200 bg-red-50">
          <p className="text-sm text-red-800">{error}</p>
        </Card>
      )}

      {cargando && <p className="text-sm text-muted-foreground">Cargando llamadas…</p>}

      {!cargando && r && (
        <>
          {/* Resumen. Cada tarjeta filtra la tabla. */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <TarjetaResumen
              icono={<Phone className="w-4 h-4" />}
              titulo="Intentos"
              valor={r.total}
              activa={categoria === null}
              onClick={() => setCategoria(null)}
            />
            <TarjetaResumen
              icono={<Phone className="w-4 h-4 text-emerald-600" />}
              titulo="Conectadas"
              valor={r.conectadas}
              activa={categoria === 'conectada'}
              onClick={() => setCategoria('conectada')}
            />
            <TarjetaResumen
              icono={<PhoneOff className="w-4 h-4 text-red-600" />}
              titulo="No conectadas"
              valor={r.noConectadas}
              activa={false}
              onClick={() => setCategoria(null)}
              nota="Ver el desglose abajo"
            />
            <TarjetaResumen
              icono={<PhoneMissed className="w-4 h-4 text-violet-600" />}
              titulo="Sin cerrar"
              valor={r.indeterminadas}
              activa={categoria === 'indeterminada'}
              onClick={() => setCategoria('indeterminada')}
              nota="No se sabe si contestó"
            />
            <TarjetaResumen
              icono={<Phone className="w-4 h-4 text-primary" />}
              titulo="Tasa de contacto"
              valor={r.tasaContacto == null ? '—' : `${r.tasaContacto}%`}
              activa={false}
              nota={r.duracionPromedioSeg ? `Promedio ${duracion(r.duracionPromedioSeg)} min` : undefined}
            />
          </div>

          {/* Por qué no se concretaron */}
          <Card className="p-4">
            <h2 className="font-semibold text-foreground mb-1">Por qué no se concretaron</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Agrupado por motivo real, no por estado: dos llamadas pueden fallar por cosas distintas.
            </p>

            {data.porMotivo.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {r.total === 0
                  ? 'No hay llamadas en este rango.'
                  : 'Todas las llamadas del rango se concretaron.'}
              </p>
            ) : (
              <div className="space-y-3">
                {data.porMotivo.map((m) => {
                  const pct = r.total > 0 ? Math.round((m.n / r.total) * 100) : 0
                  return (
                    <button
                      key={m.motivo}
                      onClick={() => setCategoria(categoria === m.categoria ? null : m.categoria)}
                      className="w-full text-left group"
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span className="text-sm text-foreground group-hover:underline">{m.motivo}</span>
                        <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                          {m.n} <span className="font-normal text-muted-foreground">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div className={`h-full ${BARRA[m.categoria]}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Detalle */}
          <Card className="overflow-hidden">
            <div className="p-4 flex items-center justify-between gap-3 border-b border-border">
              <h2 className="font-semibold text-foreground">
                Detalle {categoria && <span className="text-sm font-normal text-muted-foreground">· filtrado</span>}
              </h2>
              <span className="text-sm text-muted-foreground">{visibles.length} llamadas</span>
            </div>

            {data.truncado && (
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                Se muestran las 2000 más recientes del rango. Acortá el rango para ver el resto.
              </div>
            )}

            {visibles.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">
                No hay llamadas que coincidan con los filtros.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium px-4 py-2 whitespace-nowrap">Fecha</th>
                      <th className="text-left font-medium px-4 py-2">Asesor</th>
                      <th className="text-left font-medium px-4 py-2">Lead</th>
                      <th className="text-left font-medium px-4 py-2">Resultado</th>
                      <th className="text-left font-medium px-4 py-2">Motivo</th>
                      <th className="text-right font-medium px-4 py-2 whitespace-nowrap">Duración</th>
                      <th className="text-center font-medium px-4 py-2">Registro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((l) => (
                      <tr key={l.id} className="border-t border-border align-top">
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fechaLima(l.fecha)}</td>
                        <td className="px-4 py-3 text-foreground">{l.asesor.nombre}</td>
                        <td className="px-4 py-3">
                          <div className="text-foreground">{l.lead.nombre}</div>
                          <div className="text-xs text-muted-foreground">{l.lead.numero}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full border text-xs whitespace-nowrap ${COLOR[l.categoria]}`}>
                            {l.etiqueta}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-sm">
                          {l.motivo ? (
                            <>
                              <div className="text-foreground">{l.motivo}</div>
                              {l.accion && (
                                <div className="text-xs text-muted-foreground mt-0.5">→ {l.accion}</div>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap text-foreground">
                          {duracion(l.duracionSeg)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2 text-muted-foreground">
                            {l.tieneGrabacion && <Mic className="w-3.5 h-3.5 text-emerald-600" aria-label="Con grabación" />}
                            {l.tieneTranscript && <FileText className="w-3.5 h-3.5 text-emerald-600" aria-label="Con transcripción" />}
                            {/* Una llamada conectada sin gestion no aparece en las
                                metricas de actividad del asesor: vale la pena verlo. */}
                            {l.categoria === 'conectada' && !l.tieneGestion && (
                              <span
                                className="text-xs text-amber-700"
                                title="El asesor no registró la gestión al colgar"
                              >
                                sin gestión
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function TarjetaResumen({ icono, titulo, valor, activa, onClick, nota }: {
  icono: React.ReactNode
  titulo: string
  valor: number | string
  activa: boolean
  onClick?: () => void
  nota?: string
}) {
  return (
    <Card
      onClick={onClick}
      className={`p-4 ${onClick ? 'cursor-pointer hover:border-primary/50' : ''} ${activa ? 'border-primary ring-1 ring-primary' : ''}`}
    >
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
        {icono}
        <span>{titulo}</span>
      </div>
      <div className="text-2xl font-bold text-foreground">{valor}</div>
      {nota && <div className="text-xs text-muted-foreground mt-0.5">{nota}</div>}
    </Card>
  )
}
