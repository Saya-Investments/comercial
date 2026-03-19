'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, ChevronDown, X } from 'lucide-react'

interface AsesorOption {
  id: string
  name: string
}

interface AsesorFilterProps {
  asesores: AsesorOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function AsesorFilter({ asesores, value, onChange, placeholder = 'Todos los asesores', className = '' }: AsesorFilterProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  const filtered = asesores.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase())
  )

  const selectedName = asesores.find(a => a.id === value)?.name

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
      >
        <span className={selectedName ? 'text-foreground' : 'text-muted-foreground'}>
          {selectedName || placeholder}
        </span>
        <div className="flex items-center gap-1">
          {value && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onChange(''); setSearch('') }}
              className="hover:text-foreground text-muted-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-background border border-border rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center px-3 py-2 border-b border-border">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Buscar asesor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 ml-2 bg-transparent outline-none text-foreground placeholder:text-muted-foreground text-sm"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); setSearch('') }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors ${!value ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'}`}
            >
              {placeholder}
            </button>
            {filtered.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => { onChange(a.id); setOpen(false); setSearch('') }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors ${value === a.id ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'}`}
              >
                {a.name}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                No se encontraron asesores
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
