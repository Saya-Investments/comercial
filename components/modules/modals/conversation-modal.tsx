'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X, Send, AlertTriangle, Clock, Paperclip } from 'lucide-react'
import { toast } from 'sonner'

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

function parsePeruTimestamp(ts: string): Date {
  const [datePart, timePart] = ts.split(' ')
  return new Date(`${datePart}T${timePart}:00-05:00`)
}

function nowPeruTimestamp(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 16)
}

export function ConversationModal({ lead, onClose }: ConversationModalProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Ref para limpiar blob URLs al desmontar
  const previewUrlRef = useRef<string | null>(null)

  useEffect(() => {
    previewUrlRef.current = previewUrl
  }, [previewUrl])

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  useEffect(() => {
    fetch(`/api/conversations/${lead.id}`)
      .then((res) => res.json())
      .then((data) => setMessages(data))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false))
  }, [lead.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const windowInfo = useMemo(() => {
    const leadMsgs = messages.filter((m) => m.sender === 'lead' && m.timestamp)
    if (leadMsgs.length === 0) return { open: false, hoursLeft: 0, lastAt: null }
    const last = leadMsgs[leadMsgs.length - 1]
    const lastDate = parsePeruTimestamp(last.timestamp!)
    const hoursLeft = 24 - (Date.now() - lastDate.getTime()) / (1000 * 60 * 60)
    return { open: hoursLeft > 0, hoursLeft: Math.max(0, hoursLeft), lastAt: last.timestamp! }
  }, [messages])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPendingImage(file)
    setPreviewUrl(URL.createObjectURL(file))
    e.target.value = ''
  }

  function clearImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPendingImage(null)
    setPreviewUrl(null)
  }

  async function handleSend() {
    if (sending) return
    if (pendingImage) {
      await handleSendImage()
    } else if (inputText.trim()) {
      await handleSendText()
    }
  }

  async function handleSendText() {
    const text = inputText.trim()
    setSending(true)
    setInputText('')

    const tempId = Date.now()
    setMessages((prev) => [
      ...prev,
      { id: tempId, text, sender: 'user', timestamp: nowPeruTimestamp() },
    ])

    try {
      const res = await fetch(`/api/conversations/${lead.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: text }),
      })
      const data = await res.json()

      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
        setInputText(text)
        if (data.error === 'outside_window') {
          toast.warning('La ventana de 24h ha cerrado. El lead debe escribir primero.')
        } else {
          toast.error('Error al enviar el mensaje.')
        }
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      setInputText(text)
      toast.error('Error de conexión al enviar el mensaje.')
    } finally {
      setSending(false)
    }
  }

  async function handleSendImage() {
    const file = pendingImage!
    const caption = inputText.trim()
    const localUrl = previewUrl!

    setSending(true)
    setPendingImage(null)
    setPreviewUrl(null)
    setInputText('')

    const tempId = Date.now()
    setMessages((prev) => [
      ...prev,
      { id: tempId, text: caption, sender: 'user', timestamp: nowPeruTimestamp(), imagen_url: localUrl },
    ])

    try {
      const fd = new FormData()
      fd.append('imagen', file)
      if (caption) fd.append('caption', caption)

      const res = await fetch(`/api/conversations/${lead.id}/send-image`, {
        method: 'POST',
        body: fd,
      })
      const data = await res.json()

      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
        setPendingImage(file)
        setPreviewUrl(localUrl)
        setInputText(caption)
        if (data.error === 'outside_window') {
          toast.warning('La ventana de 24h ha cerrado. El lead debe escribir primero.')
        } else if (data.error === 'upload_error') {
          toast.error('Error al subir la imagen a WhatsApp.')
        } else {
          toast.error('Error al enviar la imagen.')
        }
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      setPendingImage(file)
      setPreviewUrl(localUrl)
      setInputText(caption)
      toast.error('Error de conexión al enviar la imagen.')
    } finally {
      setSending(false)
    }
  }

  const canSend = windowInfo.open && !sending && (!!inputText.trim() || !!pendingImage)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl h-[600px] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold text-foreground">Historial de Conversación</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {lead.name} • {lead.phone}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-lg transition-colors">
            <X className="w-5 h-5 text-foreground" />
          </button>
        </div>

        {/* Mensajes */}
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
                      alt="Imagen"
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
          <div ref={messagesEndRef} />
        </div>

        {/* Banner ventana 24h */}
        {!loading && (
          <div className="px-4">
            {windowInfo.open ? (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-xs text-green-800">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Ventana activa · quedan{' '}
                  <strong>{windowInfo.hoursLeft.toFixed(1)}h</strong> para responder libremente
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-2 text-xs text-yellow-800">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  Ventana de 24h cerrada
                  {windowInfo.lastAt ? ` desde el ${windowInfo.lastAt}` : ''}.
                  El lead debe escribir primero para reabrir la ventana.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Preview de imagen seleccionada */}
        {pendingImage && previewUrl && (
          <div className="px-4 pt-2">
            <div className="relative inline-block">
              <img
                src={previewUrl}
                alt="Vista previa"
                className="h-24 w-auto rounded-lg border border-border object-cover"
              />
              <button
                onClick={clearImage}
                className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center hover:opacity-80"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {pendingImage.name} · {(pendingImage.size / 1024).toFixed(0)} KB
            </p>
          </div>
        )}

        {/* Barra de respuesta */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2 items-end">
            {/* Botón adjuntar imagen */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || !windowInfo.open}
              title="Adjuntar imagen"
              className="p-2 rounded-md hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed self-end mb-0.5"
            >
              <Paperclip className="w-4 h-4 text-muted-foreground" />
            </button>

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              disabled={sending || !windowInfo.open}
              placeholder={
                pendingImage
                  ? 'Escribe un pie de foto (opcional)...'
                  : windowInfo.open
                  ? 'Escribe un mensaje...'
                  : 'Ventana cerrada · el lead debe escribir primero'
              }
              rows={2}
              className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
            />

            <Button onClick={handleSend} disabled={!canSend} className="self-end">
              {sending ? (
                <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          {windowInfo.open && (
            <p className="text-xs text-muted-foreground mt-1">
              Enter para enviar · Shift+Enter para nueva línea
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
