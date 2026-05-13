'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X, Paperclip, Send, Bot, PauseCircle, RefreshCw } from 'lucide-react'

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
  _optimistic?: boolean
}

interface ConvData {
  messages: Message[]
  botPausado: boolean
  botPausadoHasta: string | null
}

function formatHora(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
}

function horasRestantes(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 0
  return Math.ceil(diff / (1000 * 60 * 60))
}

export function ConversationModal({ lead, onClose }: ConversationModalProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [botPausado, setBotPausado] = useState(false)
  const [botPausadoHasta, setBotPausadoHasta] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [outside24h, setOutside24h] = useState(false)

  const [texto, setTexto] = useState('')
  const [imagen, setImagen] = useState<File | null>(null)
  const [imgPreview, setImgPreview] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [reactivando, setReactivando] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchConv = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations/${lead.id}`)
      const data: ConvData = await res.json()
      setMessages(data.messages ?? [])
      setBotPausado(data.botPausado ?? false)
      setBotPausadoHasta(data.botPausadoHasta ?? null)

      // Verificar si hay ventana de 24h activa
      const lastLead = [...(data.messages ?? [])]
        .reverse()
        .find((m) => m.sender === 'lead')
      if (!lastLead) {
        setOutside24h(true)
      } else {
        // timestamp es "YYYY-MM-DD HH:mm" en hora Perú → parsear con zona explícita
        const ts = new Date((lastLead.timestamp ?? '').replace(' ', 'T') + '-05:00').getTime()
        const horasElapsed = (Date.now() - ts) / (1000 * 60 * 60)
        setOutside24h(horasElapsed >= 24)
      }
    } catch {
      setMessages([])
    } finally {
      setLoading(false)
    }
  }, [lead.id])

  useEffect(() => {
    fetchConv()
  }, [fetchConv])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setImagen(f)
    if (f) {
      const url = URL.createObjectURL(f)
      setImgPreview(url)
    } else {
      setImgPreview(null)
    }
  }

  function clearImagen() {
    setImagen(null)
    setImgPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSend() {
    if (sending) return
    if (!imagen && !texto.trim()) return
    setSendError(null)
    setSending(true)

    // Optimistic
    const tempId = Date.now()
    const tempMsg: Message = {
      id: tempId,
      text: texto.trim(),
      sender: 'user',
      timestamp: new Date().toLocaleString('es-PE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }),
      imagen_url: imgPreview,
      _optimistic: true,
    }
    setMessages((prev) => [...prev, tempMsg])
    const prevTexto = texto
    const prevImagen = imagen
    const prevPreview = imgPreview
    setTexto('')
    clearImagen()

    try {
      let res: Response
      if (prevImagen) {
        const fd = new FormData()
        fd.append('imagen', prevImagen)
        if (prevTexto.trim()) fd.append('caption', prevTexto.trim())
        res = await fetch(`/api/conversations/${lead.id}/send-image`, { method: 'POST', body: fd })
      } else {
        res = await fetch(`/api/conversations/${lead.id}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mensaje: prevTexto.trim() }),
        })
      }

      if (!res.ok) {
        const err = await res.json()
        // Rollback optimistic
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
        setTexto(prevTexto)
        if (prevImagen) {
          setImagen(prevImagen)
          setImgPreview(prevPreview)
        }
        if (err.error === 'outside_window') {
          setOutside24h(true)
          setSendError('La ventana de 24 h está cerrada. No se puede enviar mensaje libre.')
        } else {
          setSendError(err.detail?.error?.message ?? err.error ?? 'Error al enviar')
        }
        return
      }

      // Pausa el bot localmente (3h)
      setBotPausado(true)
      setBotPausadoHasta(new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString())
      // Confirmar con datos reales
      await fetchConv()
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      setTexto(prevTexto)
      setSendError('Error de red')
    } finally {
      setSending(false)
    }
  }

  async function handleReactivar() {
    setReactivando(true)
    try {
      await fetch(`/api/conversations/${lead.id}/reactivar-bot`, { method: 'POST' })
      setBotPausado(false)
      setBotPausadoHasta(null)
    } finally {
      setReactivando(false)
    }
  }

  const canSend = !outside24h && (!!imagen || !!texto.trim()) && !sending

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl h-[650px] flex flex-col">

        {/* Header */}
        <div className="flex justify-between items-start p-5 border-b border-border gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-foreground leading-tight">Conversación</h2>
            <p className="text-sm text-muted-foreground truncate">{lead.name} · {lead.phone}</p>


            {/* Bot status */}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {botPausado && botPausadoHasta ? (
                <>
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                    <PauseCircle className="w-3.5 h-3.5" />
                    Bot pausado · se reactiva a las {formatHora(botPausadoHasta)}
                  </span>
                  <button
                    onClick={handleReactivar}
                    disabled={reactivando}
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {reactivando ? 'Reactivando…' : 'Reactivar ahora'}
                  </button>
                </>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                  <Bot className="w-3.5 h-3.5" />
                  Bot activo
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => fetchConv()}
              disabled={loading}
              className="p-1 hover:bg-secondary rounded-lg transition-colors text-muted-foreground disabled:opacity-40"
              title="Actualizar conversación"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-1 hover:bg-secondary rounded-lg transition-colors">
              <X className="w-5 h-5 text-foreground" />
            </button>
          </div>
        </div>

        {/* Banner 24h */}
        {!loading && (
          outside24h ? (
            <div className="mx-4 mt-3 rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
              La ventana de 24 h está cerrada. Espera a que el lead escriba para poder responder.
            </div>
          ) : (
            (() => {
              const lastLead = [...messages].reverse().find((m) => m.sender === 'lead')
              if (!lastLead?.timestamp) return null
              const ts = new Date(lastLead.timestamp.replace(' ', 'T') + '-05:00').getTime()
              const elapsed = (Date.now() - ts) / (1000 * 60 * 60)
              const remaining = Math.max(0, 24 - elapsed)
              const hh = Math.floor(remaining)
              const mm = Math.round((remaining - hh) * 60)
              return (
                <div className="mx-4 mt-3 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
                  Ventana activa · quedan {hh}h {mm}m para responder
                </div>
              )
            })()
          )
        )}

        {/* Messages */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {loading ? (
            <p className="text-center text-muted-foreground text-sm py-8">Cargando conversación…</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">No hay mensajes registrados</p>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs px-3 py-2 rounded-xl text-sm ${
                    msg.sender === 'user'
                      ? `bg-primary text-primary-foreground ${msg._optimistic ? 'opacity-70' : ''}`
                      : 'bg-secondary text-foreground border border-border'
                  }`}
                >
                  {msg.imagen_url && !msg.imagen_url.startsWith('media:') && (
                    <img
                      src={msg.imagen_url}
                      alt="Imagen"
                      className="max-w-full rounded-md mb-1 cursor-pointer"
                      onClick={() => window.open(msg.imagen_url!, '_blank')}
                    />
                  )}
                  {msg.imagen_url?.startsWith('media:') && (
                    <p className="text-xs opacity-70 italic mb-1">[imagen enviada]</p>
                  )}
                  {msg.text && <p>{msg.text}</p>}
                  {msg.timestamp && (
                    <p className="text-xs opacity-60 mt-1 text-right">{msg.timestamp}</p>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Error */}
        {sendError && (
          <div className="mx-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {sendError}
          </div>
        )}

        {/* Image preview */}
        {imgPreview && (
          <div className="mx-4 mb-1 flex items-center gap-2">
            <img src={imgPreview} alt="preview" className="h-14 w-14 object-cover rounded-md border border-border" />
            <button onClick={clearImagen} className="text-xs text-red-500 hover:underline">Quitar</button>
          </div>
        )}

        {/* Input area */}
        <div className="p-4 border-t border-border">
          {outside24h ? (
            <p className="text-center text-xs text-muted-foreground">Respuesta deshabilitada fuera de ventana de 24 h</p>
          ) : (
            <div className="flex items-end gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFile}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground"
                title="Adjuntar imagen"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                }}
                placeholder="Escribe un mensaje…"
                rows={1}
                className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring max-h-28 overflow-y-auto"
              />
              <Button
                onClick={handleSend}
                disabled={!canSend}
                size="sm"
                className="px-3"
              >
                {sending ? (
                  <span className="text-xs">Enviando…</span>
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
