'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  ArrowLeft,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Mail,
  Eye,
  MessageSquare,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'

interface CampaignLead {
  id: string
  idLead: string
  nombre: string
  apellido: string
  numero: string
  correo: string
  zona: string
  origen: string
  suborigen: string
  estadoLead: string
  estadoEnvio: string
  fechaEnvio: string | null
  entregado: boolean
  leido: boolean
  respondio: boolean
  errorCode: string | null
  errorDescripcion: string | null
}

interface CampaignStats {
  total: number
  pendiente: number
  enviado: number
  entregado: number
  leido: number
  respondido: number
  fallido: number
}

interface CampaignDetail {
  id: string
  name: string
  database: string
  filters: string
  template: string
  templateContent: string
  variables: Record<string, string>
  status: string
  totalLeads: number
  createdDate: string
  startDate: string | null
  endDate: string | null
  stats: CampaignStats
  leads: CampaignLead[]
}

interface CampaignDetailViewProps {
  campaignId: string
  onBack: () => void
}

const LEADS_PER_PAGE = 20

export function CampaignDetailView({ campaignId, onBack }: CampaignDetailViewProps) {
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>('todos')

  const fetchCampaign = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`)
      if (!res.ok) throw new Error('Error al cargar campaña')
      const data = await res.json()
      setCampaign(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => {
    fetchCampaign()
  }, [fetchCampaign])

  const handleSend = async () => {
    if (!campaign) return
    const confirmed = window.confirm(
      `¿Estás seguro de enviar esta campaña a ${campaign.stats.pendiente} leads pendientes?\n\nEsta acción iniciará el envío de mensajes por WhatsApp.`
    )
    if (!confirmed) return

    setSending(true)
    setSendResult(null)

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/send`, {
        method: 'POST',
      })
      const data = await res.json()

      if (res.ok) {
        setSendResult({
          success: true,
          message: data.message || 'Campaña iniciada con éxito',
        })
        // Refresh campaign data after a brief delay
        setTimeout(() => fetchCampaign(), 2000)
      } else {
        setSendResult({
          success: false,
          message: data.error || 'Error al enviar campaña',
        })
      }
    } catch {
      setSendResult({
        success: false,
        message: 'Error de conexión con el servicio de envíos',
      })
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">No se encontró la campaña</p>
        <Button onClick={onBack} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>
      </div>
    )
  }

  // Filter and search leads
  const filteredLeads = campaign.leads.filter((lead) => {
    const matchesSearch =
      searchTerm === '' ||
      `${lead.nombre} ${lead.apellido}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.numero.includes(searchTerm) ||
      lead.correo.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesFilter =
      statusFilter === 'todos' ||
      (statusFilter === 'pendiente' && lead.estadoEnvio === 'pendiente') ||
      (statusFilter === 'enviado' && ['accepted', 'enviado'].includes(lead.estadoEnvio)) ||
      (statusFilter === 'entregado' && lead.entregado) ||
      (statusFilter === 'leido' && lead.leido) ||
      (statusFilter === 'fallido' && ['failed', 'error'].includes(lead.estadoEnvio))

    return matchesSearch && matchesFilter
  })

  const totalPages = Math.ceil(filteredLeads.length / LEADS_PER_PAGE)
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * LEADS_PER_PAGE,
    currentPage * LEADS_PER_PAGE
  )

  const getEnvioStatusBadge = (lead: CampaignLead) => {
    if (['failed', 'error'].includes(lead.estadoEnvio)) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
          <XCircle className="w-3 h-3" /> Fallido
        </span>
      )
    }
    if (lead.respondio) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
          <MessageSquare className="w-3 h-3" /> Respondido
        </span>
      )
    }
    if (lead.leido) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
          <Eye className="w-3 h-3" /> Leído
        </span>
      )
    }
    if (lead.entregado) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
          <CheckCircle2 className="w-3 h-3" /> Entregado
        </span>
      )
    }
    if (['accepted', 'enviado'].includes(lead.estadoEnvio)) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-50 text-cyan-700 border border-cyan-200">
          <Mail className="w-3 h-3" /> Enviado
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">
        <Clock className="w-3 h-3" /> Pendiente
      </span>
    )
  }

  const getCampaignStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      Activa: 'bg-green-50 text-green-700 border-green-200',
      Pausada: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      Completada: 'bg-blue-50 text-blue-700 border-blue-200',
      enviada: 'bg-blue-50 text-blue-700 border-blue-200',
      procesando: 'bg-orange-50 text-orange-700 border-orange-200',
      failed: 'bg-red-50 text-red-700 border-red-200',
    }
    return map[status] || 'bg-gray-50 text-gray-600 border-gray-200'
  }

  const canSend =
    campaign.stats.pendiente > 0 &&
    !['procesando', 'enviada', 'Completada'].includes(campaign.status)

  const parsedFilters = (() => {
    try {
      const f = typeof campaign.filters === 'string' ? JSON.parse(campaign.filters) : campaign.filters
      const parts: string[] = []
      if (f.buckets?.length) parts.push(`Buckets: ${f.buckets.join(', ')}`)
      return parts.length ? parts.join(' | ') : 'Sin filtros'
    } catch {
      return campaign.filters || 'Sin filtros'
    }
  })()

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button onClick={onBack} variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{campaign.name}</h1>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${getCampaignStatusBadge(campaign.status)}`}
              >
                {campaign.status}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Creada el {new Date(campaign.createdDate).toLocaleDateString('es-PE')}
              {campaign.startDate &&
                ` | Inicio: ${new Date(campaign.startDate).toLocaleDateString('es-PE')}`}
              {campaign.endDate &&
                ` | Fin: ${new Date(campaign.endDate).toLocaleDateString('es-PE')}`}
            </p>
          </div>
          <Button
            onClick={() => fetchCampaign()}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Actualizar
          </Button>
        </div>

        {/* Campaign Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Base de Datos</p>
            <p className="font-medium text-foreground truncate">{campaign.database}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Plantilla</p>
            <p className="font-medium text-foreground truncate">{campaign.template}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Filtros</p>
            <p className="font-medium text-foreground text-sm truncate">{parsedFilters}</p>
          </Card>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Card className="p-4 text-center">
            <div className="text-sm text-muted-foreground">Total</div>
            <div className="text-2xl font-bold text-foreground">{campaign.stats.total}</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-sm text-muted-foreground">Pendientes</div>
            <div className="text-2xl font-bold text-gray-600">{campaign.stats.pendiente}</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-sm text-muted-foreground">Enviados</div>
            <div className="text-2xl font-bold text-cyan-600">{campaign.stats.enviado}</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-sm text-muted-foreground">Entregados</div>
            <div className="text-2xl font-bold text-green-600">{campaign.stats.entregado}</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-sm text-muted-foreground">Leídos</div>
            <div className="text-2xl font-bold text-blue-600">{campaign.stats.leido}</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-sm text-muted-foreground">Fallidos</div>
            <div className="text-2xl font-bold text-red-600">{campaign.stats.fallido}</div>
          </Card>
        </div>

        {/* Send Section */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground">Envío de Campaña</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {canSend
                  ? `Se enviarán mensajes a ${campaign.stats.pendiente} leads pendientes vía WhatsApp`
                  : campaign.status === 'procesando'
                    ? 'La campaña se está procesando actualmente...'
                    : campaign.stats.pendiente === 0
                      ? 'Todos los leads ya fueron procesados'
                      : `Campaña en estado "${campaign.status}"`}
              </p>
            </div>
            <Button
              onClick={handleSend}
              disabled={!canSend || sending}
              className="bg-green-600 hover:bg-green-700 text-white gap-2 px-6"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Enviar Campaña
                </>
              )}
            </Button>
          </div>

          {sendResult && (
            <div
              className={`mt-4 p-3 rounded-lg border ${
                sendResult.success
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              <div className="flex items-center gap-2">
                {sendResult.success ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                <span className="text-sm font-medium">{sendResult.message}</span>
              </div>
            </div>
          )}

          {campaign.status === 'procesando' && (
            <div className="mt-4 p-3 rounded-lg bg-orange-50 border border-orange-200">
              <div className="flex items-center gap-2 text-orange-800">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm font-medium">
                  La campaña se está procesando. Usa "Actualizar" para ver el progreso.
                </span>
              </div>
            </div>
          )}
        </Card>

        {/* Leads Table */}
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h3 className="font-semibold text-foreground">
                Leads ({filteredLeads.length})
              </h3>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar lead..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value)
                      setCurrentPage(1)
                    }}
                    className="pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 w-60"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="todos">Todos</option>
                  <option value="pendiente">Pendientes</option>
                  <option value="enviado">Enviados</option>
                  <option value="entregado">Entregados</option>
                  <option value="leido">Leídos</option>
                  <option value="fallido">Fallidos</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground">Teléfono</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground">Correo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground">Zona</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground">Origen</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground">Estado Envío</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground">Fecha Envío</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-b border-border hover:bg-secondary/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-foreground">
                      {lead.nombre} {lead.apellido}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
                      {lead.numero}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground truncate max-w-[200px]">
                      {lead.correo || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{lead.zona || '-'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{lead.origen || '-'}</td>
                    <td className="px-4 py-3">{getEnvioStatusBadge(lead)}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {lead.fechaEnvio
                        ? new Date(lead.fechaEnvio).toLocaleString('es-PE', {
                            day: '2-digit',
                            month: '2-digit',
                            year: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '-'}
                    </td>
                  </tr>
                ))}
                {paginatedLeads.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      {searchTerm || statusFilter !== 'todos'
                        ? 'No se encontraron leads con los filtros aplicados'
                        : 'No hay leads en esta campaña'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Mostrando {(currentPage - 1) * LEADS_PER_PAGE + 1}-
                {Math.min(currentPage * LEADS_PER_PAGE, filteredLeads.length)} de{' '}
                {filteredLeads.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-foreground px-2">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
