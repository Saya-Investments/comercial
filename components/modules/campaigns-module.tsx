'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Plus, Edit2, Trash2, Eye } from 'lucide-react'
import { CampaignModal } from './modals/campaign-modal'
import { CampaignDetailModal } from './modals/campaign-detail-modal'

interface Campaign {
  id: string
  name: string
  database: string
  filters: string
  template: string
  status: 'Activa' | 'Pausada' | 'Completada'
  leads: number
  createdDate: string
}

const mockCampaigns: Campaign[] = [
  {
    id: '1',
    name: 'Campaña Spring 2024',
    database: 'Clientes Premium',
    filters: 'Edad 25-45, Zona Madrid',
    template: 'Welcome Email',
    status: 'Activa',
    leads: 150,
    createdDate: '2024-02-01',
  },
  {
    id: '2',
    name: 'Reactivación Q1',
    database: 'Clientes Inactivos',
    filters: 'Último contacto hace 90 días',
    template: 'Come Back Offer',
    status: 'Pausada',
    leads: 200,
    createdDate: '2024-01-15',
  },
]

export function CampaignsModule() {
  const [campaigns, setCampaigns] = useState(mockCampaigns)
  const [showModal, setShowModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)

  const handleDelete = (id: string) => {
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
                          onClick={() => {
                            setSelectedCampaign(campaign)
                            setShowDetailModal(true)
                          }}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        >
                          <Eye className="w-4 h-4" />
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

      {showModal && <CampaignModal onClose={() => setShowModal(false)} />}
      {showDetailModal && selectedCampaign && (
        <CampaignDetailModal 
          campaign={selectedCampaign}
          onClose={() => setShowDetailModal(false)}
        />
      )}
    </div>
  )
}
