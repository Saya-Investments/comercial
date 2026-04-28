'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GitCommit, RefreshCw, Clock } from 'lucide-react'

type VersionInfo = {
  commit: {
    sha: string
    short: string
    message: string | null
    author: string | null
    branch: string | null
  } | null
  env: string
  buildTime: string | null
  changelog: string
}

function formatLima(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

export function VersionModule() {
  const [data, setData] = useState<VersionInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/version', { cache: 'no-store' })
      const json = await res.json()
      setData(json)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Versión</h1>
          <p className="text-muted-foreground text-sm">Despliegue actual del CRM y cambios recientes</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Recargar
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCommit className="w-4 h-4" />
            Commit desplegado
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data?.commit ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="font-mono">{data.commit.short}</Badge>
                <Badge variant="secondary">{data.env}</Badge>
                {data.commit.branch && <Badge variant="outline">{data.commit.branch}</Badge>}
              </div>
              {data.commit.message && (
                <div className="text-foreground whitespace-pre-wrap">{data.commit.message}</div>
              )}
              {data.commit.author && (
                <div className="text-muted-foreground text-xs">por {data.commit.author}</div>
              )}
              {data.buildTime && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t border-border/50 mt-2">
                  <Clock className="w-3 h-3" />
                  <span>Desplegado: {formatLima(data.buildTime)} (Lima)</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {loading ? 'Cargando...' : 'Sin información de commit (modo local o variables de Vercel no disponibles)'}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cambios recientes</CardTitle>
        </CardHeader>
        <CardContent>
          {data ? (
            <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">{data.changelog}</pre>
          ) : (
            <div className="text-sm text-muted-foreground">{loading ? 'Cargando...' : 'Sin datos'}</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
