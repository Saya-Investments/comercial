'use client'

import { useState, useEffect } from 'react'
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

interface Message {
  id: number
  text: string
  sender: 'lead' | 'user'
  timestamp?: string
  imagen_url?: string | null
}

export function ConversationModal({ lead, onClose }: ConversationModalProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/conversations/${lead.id}`)
      .then(res => res.json())
      .then(data => setMessages(data))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false))
  }, [lead.id])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl h-[600px] flex flex-col">
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
          {loading ? (
            <p className="text-center text-muted-foreground">Cargando conversación...</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-muted-foreground">No hay mensajes registrados</p>
          ) : (
            messages.map((msg) => (
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
                  {msg.imagen_url && (
                    <img
                      src={msg.imagen_url}
                      alt="Imagen enviada"
                      className="max-w-full rounded-md mb-1 cursor-pointer"
                      onClick={() => window.open(msg.imagen_url!, '_blank')}
                    />
                  )}
                  {msg.text && <p className="text-sm">{msg.text}</p>}
                  {msg.timestamp && (
                    <p className="text-xs opacity-70 mt-1">{msg.timestamp}</p>
                  )}
                </div>
              </div>
            ))
          )}
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
