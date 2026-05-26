'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Plus, Edit2, Trash2, Eye, Scissors } from 'lucide-react'
import { CampaignModal } from './modals/campaign-modal'
import { CampaignDetailView } from './campaign-detail-view'

interface Campaign {
  id: string
  name: string
  database: string
  filters: string
  template: string
  templateId: string
  status: 'Activa' | 'Pausada' | 'Completada'
  leads: number
  createdDate: string
}

interface Template {
  id: string
  name: string
}

function SplitModal({
  campaign,
  onClose,
  onDone,
}: {
  campaign: Campaign
  onClose: () => void
  onDone: () => void
}) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [newName, setNewName] = useState(`${campaign.name}_v2`)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/templates')
      .then(r => r.json())
      .then(data => setTemplates(data))
      .catch(() => setError('No se pudieron cargar las plantillas'))
  }, [])

  const handleSplit = async () => {
    if (!selectedTemplateId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplateId, newCampaignName: newName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al dividir')
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  const half = Math.ceil(campaign.leads / 2)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Scissors className="w-5 h-5" /> Dividir campaña
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{campaign.name}</span> tiene{' '}
          <span className="font-medium text-foreground">{campaign.leads}</span> leads pendientes.
          Se dividirán en <span className="font-medium text-foreground">{half}</span> +{' '}
          <span className="font-medium text-foreground">{campaign.leads - half}</span> de forma aleatoria.
        </p>

        <div className="space-y-2">
          <label className="text-sm font-medium">Nombre nueva campaña</label>
          <input
            className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Plantilla para la nueva campaña</label>
          <select
            className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            value={selectedTemplateId}
            onChange={e => setSelectedTemplateId(e.target.value)}
          >
            <option value="">-- Seleccionar plantilla --</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground"
            onClick={handleSplit}
            disabled={!selectedTemplateId || !newName || loading}
          >
            {loading ? 'Dividiendo...' : 'Dividir'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function CampaignsModule() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [viewingCampaignId, setViewingCampaignId] = useState<string | null>(null)
  const [splittingCampaign, setSplittingCampaign] = useState<Campaign | null>(null)

  const fetchCampaigns = () => {
    fetch('/api/campaigns')
      .then(res => res.json())
      .then(data => setCampaigns(data))
      .catch(console.error)
  }

  useEffect(() => { fetchCampaigns() }, [])
  const [showModal, setShowModal] = useState(false)

  const handleDelete = async (id: string) => {
    await fetch(`/api/campaigns?id=${id}`, { method: 'DELETE' })
    setCampaigns(campaigns.filter((c) => c.id !== id))
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Activa':
        return 'bg-green-50 text-green-700 border border-green-200'
      case 'Pausada':
        return 'bg-yellow-50 text-yellow-700 border border-yellow-200'
      case 'Completada':
        return 'bg-blue-50 text-blue-700 border border-blue-200'
      default:
        return ''
    }
  }

  // If viewing a campaign detail, show full-page detail view
  if (viewingCampaignId) {
    return (
      <CampaignDetailView
        campaignId={viewingCampaignId}
        onBack={() => {
          setViewingCampaignId(null)
          fetchCampaigns() // Refresh list when coming back
        }}
      />
    )
  }

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Campañas</h1>
            <p className="text-muted-foreground mt-1">Gestiona tus campañas comerciales</p>
          </div>
          <Button
            onClick={() => setShowModal(true)}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nueva Campaña
          </Button>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary">
                  <th className="px-6 py-4 text-left font-semibold text-foreground">Nombre</th>
                  <th className="px-6 py-4 text-left font-semibold text-foreground">Base de Datos</th>
                  <th className="px-6 py-4 text-left font-semibold text-foreground">Plantilla</th>
                  <th className="px-6 py-4 text-left font-semibold text-foreground">Leads</th>
                  <th className="px-6 py-4 text-left font-semibold text-foreground">Estado</th>
                  <th className="px-6 py-4 text-left font-semibold text-foreground">Creada</th>
                  <th className="px-6 py-4 text-right font-semibold text-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} className="border-b border-border hover:bg-secondary/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{campaign.name}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{campaign.database}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{campaign.template}</td>
                    <td className="px-6 py-4 font-semibold text-foreground">{campaign.leads}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(campaign.status)}`}>
                        {campaign.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{campaign.createdDate}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setViewingCampaignId(campaign.id)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSplittingCampaign(campaign)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          title="Dividir campaña 50/50"
                        >
                          <Scissors className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(campaign.id)}
                          className="h-8 w-8 p-0 text-accent hover:text-accent hover:bg-accent/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {campaigns.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No hay campañas creadas</p>
              <Button onClick={() => setShowModal(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                <Plus className="w-4 h-4 mr-2" />
                Crear Primera Campaña
              </Button>
            </div>
          )}
        </Card>
      </div>

      {showModal && (
        <CampaignModal
          onClose={() => setShowModal(false)}
          onCreated={() => fetchCampaigns()}
        />
      )}

      {splittingCampaign && (
        <SplitModal
          campaign={splittingCampaign}
          onClose={() => setSplittingCampaign(null)}
          onDone={() => { setSplittingCampaign(null); fetchCampaigns() }}
        />
      )}
    </div>
  )
}
