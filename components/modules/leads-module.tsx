'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Search, X } from 'lucide-react'
import { LeadsTable } from './leads-table'
import { useAuth } from '@/contexts/auth-context'

interface AsesorOption {
  id: string
  name: string
}

export function LeadsModule() {
  const { user } = useAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const [filterPriority, setFilterPriority] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterDate, setFilterDate] = useState<string>('')
  const [filterAsesor, setFilterAsesor] = useState<string>('')
  const [asesores, setAsesores] = useState<AsesorOption[]>([])

  const isAdmin = user?.role === 'admin' || user?.role === 'Admin'

  useEffect(() => {
    if (isAdmin) {
      fetch('/api/advisors')
        .then(res => res.json())
        .then(data => setAsesores(data.map((a: Record<string, unknown>) => ({ id: a.id as string, name: a.name as string }))))
        .catch(console.error)
    }
  }, [isAdmin])

  const activeFilters = [
    filterPriority && `Prioridad: ${filterPriority}`,
    filterStatus && `Estado: ${filterStatus}`,
    filterDate && `Desde: ${filterDate}`,
    filterAsesor && `Asesor: ${asesores.find(a => a.id === filterAsesor)?.name || filterAsesor}`,
  ].filter(Boolean)

  const clearFilters = () => {
    setFilterPriority('')
    setFilterStatus('')
    setFilterDate('')
    setFilterAsesor('')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-background border-b border-border p-4 md:p-6 space-y-3 md:space-y-4">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Leads</h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">Gestión de leads comerciales</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-2 md:gap-3 flex-wrap">
          <div className="flex items-center bg-background border border-border rounded-lg px-3 py-2 flex-1 min-w-0 md:max-w-md">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 ml-2 bg-transparent outline-none text-foreground placeholder:text-muted-foreground text-sm"
            />
          </div>

          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm flex-1 md:flex-none"
          >
            <option value="">Prioridad</option>
            <option value="Alta">Alta</option>
            <option value="Media">Media</option>
            <option value="Baja">Baja</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm flex-1 md:flex-none"
          >
            <option value="">Estado</option>
            <option value="asignado">Asignado</option>
            <option value="en_gestion">En Gestión</option>
            <option value="descartado">Descartado</option>
          </select>

          {isAdmin && (
            <select
              value={filterAsesor}
              onChange={(e) => setFilterAsesor(e.target.value)}
              className="px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm flex-1 md:flex-none"
            >
              <option value="">Asesor</option>
              {asesores.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}

          {activeFilters.length > 0 && (
            <Button
              variant="outline"
              onClick={clearFilters}
              className="text-muted-foreground hover:text-foreground bg-transparent text-sm flex-1 md:flex-none"
            >
              <X className="w-4 h-4 mr-1" />
              Limpiar
            </Button>
          )}
        </div>

        {activeFilters.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {activeFilters.map((filter) => (
              <div key={filter} className="bg-primary/10 text-primary px-2 md:px-3 py-1 rounded-full text-xs font-medium border border-primary/20">
                {filter}
              </div>
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
          filterAsesor={filterAsesor}
        />
      </div>

    </div>
  )
}
