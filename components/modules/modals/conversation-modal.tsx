'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X } from 'lucide-react'

interface ConversationModalProps {
  lead: {
    id: string
    name: string
    phone: string
  }
  onClose: () => void
}

export function ConversationModal({ lead, onClose }: ConversationModalProps) {
  const messages = [
    { id: 1, text: 'Hola, ¿cómo estás?', sender: 'lead' as const },
    { id: 2, text: 'Hola! Bien, gracias. Te contacto para hablar sobre nuestros planes.', sender: 'user' as const },
    { id: 3, text: 'Perfecto, me interesa saber más.', sender: 'lead' as const },
    { id: 4, text: 'Excelente, me gustaría agendar una llamada para explicarte los detalles.', sender: 'user' as const },
    { id: 5, text: 'Claro, cuando prefieres?', sender: 'lead' as const },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl h-96 flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold text-foreground">Historial de Conversación</h2>
            <p className="text-sm text-muted-foreground mt-1">{lead.name} • {lead.phone}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-secondary rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs px-4 py-2 rounded-lg ${
                  msg.sender === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-foreground border border-border'
                }`}
              >
                <p className="text-sm">{msg.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 border-t border-border flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </Card>
    </div>
  )
}
