'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Search, X, SlidersHorizontal } from 'lucide-react'
import { LeadsTable } from './leads-table'
import { useAuth } from '@/contexts/auth-context'
import { AsesorFilter } from '@/components/ui/asesor-filter'

interface AsesorOption {
  id: string
  name: string
}

interface CallCenterOption {
  id: string
  name: string
}

interface ActiveChip {
  key: string
  label: string
  onRemove: () => void
}

export function LeadsModule() {
  const { user } = useAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const [filterPriority, setFilterPriority] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterDate, setFilterDate] = useState<string>('')
  const [filterDateTo, setFilterDateTo] = useState<string>('')
  const [filterMsgDate, setFilterMsgDate] = useState<string>('')
  const [filterMsgDateTo, setFilterMsgDateTo] = useState<string>('')
  const [filterAsesor, setFilterAsesor] = useState<string>('')
  const [filterCallCenter, setFilterCallCenter] = useState<string>('')
  const [filterBase, setFilterBase] = useState<string>('')
  const [filterEstadoAsesor, setFilterEstadoAsesor] = useState<string>('')
  const [estadoAsesorOptions, setEstadoAsesorOptions] = useState<string[]>([])
  const [asesores, setAsesores] = useState<AsesorOption[]>([])
  const [callCenters, setCallCenters] = useState<CallCenterOption[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)

  const role = (user?.role as string | undefined) ?? ''
  const isAdmin = role === 'admin' || role === 'Admin'
  const isSupervisor = user?.role === 'supervisor'
  const canFilterAsesores = isAdmin || isSupervisor

  useEffect(() => {
    if (canFilterAsesores) {
      const url = isSupervisor ? `/api/advisors?supervisorId=${user?.id}` : '/api/advisors'
      fetch(url)
        .then(res => res.json())
        .then(data => setAsesores(data.map((a: Record<string, unknown>) => ({ id: a.id as string, name: a.name as string }))))
        .catch(console.error)
    }
  }, [canFilterAsesores, isSupervisor, user?.id])

  useEffect(() => {
    if (!canFilterAsesores) return
    fetch('/api/advisors/call-center-ranking')
      .then(res => res.json())
      .then((data: Array<{ id: string; name: string }>) =>
        setCallCenters(data.map((c) => ({ id: c.id, name: c.name })))
      )
      .catch(console.error)
  }, [canFilterAsesores])

  const asesorName = asesores.find(a => a.id === filterAsesor)?.name || filterAsesor
  const callCenterName = callCenters.find(c => c.id === filterCallCenter)?.name || filterCallCenter

  const activeChips: ActiveChip[] = [
    filterPriority && { key: 'priority', label: `Prioridad: ${filterPriority}`, onRemove: () => setFilterPriority('') },
    filterStatus && { key: 'status', label: `Estado: ${filterStatus}`, onRemove: () => setFilterStatus('') },
    filterBase && { key: 'base', label: `Base: ${filterBase}`, onRemove: () => setFilterBase('') },
    filterEstadoAsesor && { key: 'estadoAsesor', label: `Estado asesor: ${filterEstadoAsesor}`, onRemove: () => setFilterEstadoAsesor('') },
    filterAsesor && { key: 'asesor', label: `Asesor: ${asesorName}`, onRemove: () => setFilterAsesor('') },
    filterCallCenter && { key: 'cc', label: `Call center: ${callCenterName}`, onRemove: () => setFilterCallCenter('') },
    filterDate && { key: 'dateFrom', label: `Asignado desde: ${filterDate}`, onRemove: () => setFilterDate('') },
    filterDateTo && { key: 'dateTo', label: `Asignado hasta: ${filterDateTo}`, onRemove: () => setFilterDateTo('') },
    filterMsgDate && { key: 'msgFrom', label: `Últ. msj desde: ${filterMsgDate}`, onRemove: () => setFilterMsgDate('') },
    filterMsgDateTo && { key: 'msgTo', label: `Últ. msj hasta: ${filterMsgDateTo}`, onRemove: () => setFilterMsgDateTo('') },
  ].filter(Boolean) as ActiveChip[]

  const clearFilters = () => {
    setFilterPriority('')
    setFilterStatus('')
    setFilterDate('')
    setFilterDateTo('')
    setFilterMsgDate('')
    setFilterMsgDateTo('')
    setFilterAsesor('')
    setFilterCallCenter('')
    setFilterBase('')
    setFilterEstadoAsesor('')
  }

  const selectClass = 'h-9 px-3 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm'
  const dateClass = 'h-9 px-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm w-[140px]'

  return (
    <div className="flex flex-col h-full">
      <div className="bg-background border-b border-border p-4 md:p-6 space-y-3">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Leads</h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">Gestión de leads comerciales</p>
          </div>
        </div>

        {/* Fila 1: búsqueda + toggle de filtros avanzados + limpiar */}
        <div className="flex flex-col md:flex-row gap-2 md:items-center">
          <div className="flex items-center bg-background border border-border rounded-lg px-3 h-9 flex-1 min-w-0 md:max-w-md">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              placeholder="Buscar por nombre, DNI o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 ml-2 bg-transparent outline-none text-foreground placeholder:text-muted-foreground text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdvanced((v) => !v)}
              className="h-9 text-sm"
            >
              <SlidersHorizontal className="w-4 h-4 mr-1.5" />
              Filtros
              {activeChips.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center bg-primary text-primary-foreground rounded-full text-[10px] font-semibold h-4 min-w-[16px] px-1">
                  {activeChips.length}
                </span>
              )}
            </Button>

            {activeChips.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-9 text-muted-foreground hover:text-foreground text-sm"
              >
                <X className="w-4 h-4 mr-1" />
                Limpiar
              </Button>
            )}
          </div>
        </div>

        {/* Fila 2: filtros agrupados (colapsable) */}
        {showAdvanced && (
          <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-3">
            {/* Grupo: atributos del lead */}
            <div>
              <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-1.5">Atributos del lead</p>
              <div className="flex flex-wrap gap-2">
                <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className={selectClass}>
                  <option value="">Prioridad</option>
                  <option value="Alta">Alta</option>
                  <option value="Media">Media</option>
                  <option value="Baja">Baja</option>
                </select>

                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={selectClass}>
                  <option value="">Estado</option>
                  <option value="asignado">Asignado</option>
                  <option value="en_gestion">En Gestión</option>
                  <option value="descartado">Descartado</option>
                </select>

                <select value={filterBase} onChange={(e) => setFilterBase(e.target.value)} className={selectClass}>
                  <option value="">Base</option>
                  <option value="Caliente">Caliente</option>
                  <option value="Stock">Stock</option>
                </select>

                <select value={filterEstadoAsesor} onChange={(e) => setFilterEstadoAsesor(e.target.value)} className={selectClass}>
                  <option value="">Estado asesor</option>
                  {estadoAsesorOptions.map((estado) => (
                    <option key={estado} value={estado}>{estado}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Grupo: asignación (solo admin/supervisor) */}
            {canFilterAsesores && (
              <div>
                <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-1.5">Asignación</p>
                <div className="flex flex-wrap gap-2">
                  <AsesorFilter
                    asesores={asesores}
                    value={filterAsesor}
                    onChange={setFilterAsesor}
                    placeholder="Asesor"
                    className="w-52"
                  />
                  <AsesorFilter
                    asesores={callCenters}
                    value={filterCallCenter}
                    onChange={setFilterCallCenter}
                    placeholder="Call center"
                    className="w-52"
                  />
                </div>
              </div>
            )}

            {/* Grupo: rangos de fecha */}
            <div>
              <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-1.5">Fechas</p>
              <div className="flex flex-wrap gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Fecha de asignación</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={filterDate}
                      onChange={(e) => setFilterDate(e.target.value)}
                      className={dateClass}
                      title="Desde"
                    />
                    <span className="text-muted-foreground text-xs">→</span>
                    <input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className={dateClass}
                      title="Hasta"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Último mensaje del lead</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={filterMsgDate}
                      onChange={(e) => setFilterMsgDate(e.target.value)}
                      className={dateClass}
                      title="Desde"
                    />
                    <span className="text-muted-foreground text-xs">→</span>
                    <input
                      type="date"
                      value={filterMsgDateTo}
                      onChange={(e) => setFilterMsgDateTo(e.target.value)}
                      className={dateClass}
                      title="Hasta"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Chips de filtros activos */}
        {activeChips.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                onClick={chip.onRemove}
                className="group inline-flex items-center gap-1 bg-primary/10 hover:bg-primary/20 text-primary px-2.5 py-1 rounded-full text-xs font-medium border border-primary/20 transition-colors"
                title="Quitar filtro"
              >
                <span>{chip.label}</span>
                <X className="w-3 h-3 opacity-60 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <LeadsTable
          searchTerm={searchTerm}
          filterPriority={filterPriority}
          filterStatus={filterStatus}
          filterDate={filterDate}
          filterDateTo={filterDateTo}
          filterMsgDate={filterMsgDate}
          filterMsgDateTo={filterMsgDateTo}
          filterAsesor={filterAsesor}
          filterCallCenter={filterCallCenter}
          filterBase={filterBase}
          filterEstadoAsesor={filterEstadoAsesor}
          onEstadoAsesorOptionsChange={setEstadoAsesorOptions}
        />
      </div>

    </div>
  )
}
