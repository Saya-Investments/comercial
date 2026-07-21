'use client'

/**
 * Dock de llamada persistente.
 *
 * Flota sobre el CRM (abajo a la derecha) en vez de tomar la pantalla completa,
 * para que el asesor pueda seguir navegando (abrir otro lead, revisar tareas,
 * tomar notas) MIENTRAS habla. Al colgar pide la disposicion de la gestion.
 */

import { useCall, type CallKind } from '@/contexts/call-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Minus, X, Clock, Send,
} from 'lucide-react'
import { useState } from 'react'

function fmt(sec: number) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
}

const DISPOSICIONES = [
  { label: 'Contactado', estado: 'Contactado' },
  { label: 'Interesado', estado: 'Interesado' },
  { label: 'Agendó cita', estado: 'Cita_agendada' },
  { label: 'No contestó', estado: 'No_contesta' },
]

export function CallDock() {
  const { call, endCall, dismissCall, toggleMute } = useCall()
  const [minimized, setMinimized] = useState(false)

  if (!call) return null

  const esVideo = call.kind === 'video'
  const iniciales = call.lead.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  // ---- Minimizado: solo una pastilla ----
  if (minimized && call.status !== 'ended') {
    return (
      <div className="fixed bottom-4 right-4 z-[60]">
        <button
          onClick={() => setMinimized(false)}
          className="flex items-center gap-3 rounded-full bg-[#0B1F3A] text-white pl-3 pr-4 py-2.5 shadow-2xl border border-white/10 hover:brightness-110 transition"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <span className="text-sm font-medium">{call.lead.name.split(' ')[0]}</span>
          <span className="font-mono text-sm tabular-nums text-sky-200">{fmt(call.seconds)}</span>
        </button>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[330px] rounded-2xl overflow-hidden shadow-2xl border border-white/10"
      style={{ background: '#0B1F3A' }}>
      {/* Barra superior */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2 text-[11px] font-mono tracking-wider uppercase">
          {call.status === 'ended' ? (
            <span className="text-slate-300">Llamada finalizada</span>
          ) : (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span className="text-red-200">Grabando</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {call.status !== 'ended' && (
            <button onClick={() => setMinimized(true)} title="Minimizar"
              className="p-1.5 rounded-md text-slate-300 hover:bg-white/10 hover:text-white transition">
              <Minus className="w-4 h-4" />
            </button>
          )}
          <button onClick={dismissCall} title="Cerrar"
            className="p-1.5 rounded-md text-slate-300 hover:bg-white/10 hover:text-white transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Cuerpo */}
      {call.status === 'ended' ? (
        <div className="p-4">
          <p className="text-white font-semibold text-sm">{call.lead.name}</p>
          <p className="text-slate-300 text-xs mt-0.5 flex items-center gap-1.5">
            <Clock className="w-3 h-3" /> Duración {fmt(call.seconds)} · grabación guardada
          </p>
          <p className="text-[11px] font-mono tracking-wider uppercase text-sky-300 mt-4 mb-2">
            ¿Cómo terminó?
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DISPOSICIONES.map((d) => (
              <Button key={d.estado} size="sm" variant="secondary"
                className="text-xs h-8 bg-white/10 text-white border-0 hover:bg-white/20"
                onClick={dismissCall}>
                {d.label}
              </Button>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
            Se registrará en el resumen de la gestión del lead con su duración.
          </p>
        </div>
      ) : (
        <div className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full grid place-items-center font-bold text-white text-sm flex-none"
              style={{ background: 'linear-gradient(135deg,#1B5E7E,#2E8BB0)' }}>
              {iniciales}
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">{call.lead.name}</p>
              <p className="text-slate-300 text-xs font-mono">{call.lead.phone}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="font-mono text-lg text-white tabular-nums leading-none">{fmt(call.seconds)}</p>
              <p className="text-[10px] text-sky-300 uppercase tracking-wider mt-1">
                {call.status === 'ringing' ? 'Llamando…' : esVideo ? 'En video' : 'En llamada'}
              </p>
            </div>
          </div>

          {esVideo && (
            <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-200 flex items-center gap-2">
              <Send className="w-3 h-3 flex-none" /> Link de la sala enviado al hilo de WhatsApp
            </div>
          )}

          <div className="flex items-center justify-center gap-2 mt-4">
            <button onClick={toggleMute} title={call.muted ? 'Activar micrófono' : 'Silenciar'}
              className={`w-11 h-11 rounded-full grid place-items-center border transition ${
                call.muted
                  ? 'bg-white/20 text-white border-white/30'
                  : 'bg-white/[.07] text-slate-200 border-white/15 hover:bg-white/15'
              }`}>
              {call.muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button title={esVideo ? 'Cámara' : 'Video'}
              className="w-11 h-11 rounded-full grid place-items-center bg-white/[.07] text-slate-200 border border-white/15 hover:bg-white/15 transition">
              {esVideo ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </button>
            <button onClick={endCall} title="Colgar"
              className="w-14 h-11 rounded-full grid place-items-center bg-[#C63A38] text-white hover:brightness-110 transition">
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>

          <p className="text-[10px] text-slate-400 text-center mt-3">
            Puedes seguir navegando el CRM durante la llamada.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Confirmacion antes de llamar.
 *
 * Voz y video funcionan distinto (una entra como llamada de WhatsApp, la otra
 * manda un link a la conversacion), asi que conviene decirlo explicito antes de
 * disparar nada. z-[70] para quedar por encima de los modales del CRM (z-50) y
 * del dock (z-60).
 */
export function CallConfirmDialog({
  lead,
  kind,
  onCancel,
  onConfirm,
}: {
  lead: { name: string; phone: string }
  kind: CallKind
  onCancel: () => void
  onConfirm: () => void
}) {
  const esVideo = kind === 'video'
  const puntos = esVideo
    ? [
        'Le llega un enlace a su chat de WhatsApp; lo abre en el navegador, sin instalar nada.',
        'Entras a la sala apenas el lead se conecte.',
        'Queda grabada y registrada en el resumen de la gestión.',
      ]
    : [
        'Al lead le entra como una llamada de WhatsApp, desde el número de Maqui+.',
        'Se graba y queda registrada en el resumen de la gestión, con su duración.',
        'Puedes seguir usando el CRM mientras hablas.',
      ]

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <Card className="w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div
            className="w-11 h-11 rounded-full grid place-items-center flex-none text-white"
            style={{ background: 'linear-gradient(135deg,#1B5E7E,#2E8BB0)' }}
          >
            {esVideo ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-foreground leading-tight">
              {esVideo ? 'Iniciar videollamada' : 'Llamar por WhatsApp'}
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {lead.name} · <span className="font-mono">{lead.phone}</span>
            </p>
          </div>
        </div>

        <p className="text-sm text-foreground mt-4">
          {esVideo
            ? 'Se enviará un enlace de videollamada al chat de WhatsApp del lead.'
            : 'Se iniciará una llamada de voz por WhatsApp con el lead.'}
        </p>

        <ul className="mt-3 space-y-2">
          {puntos.map((p) => (
            <li key={p} className="flex gap-2 text-sm text-muted-foreground">
              <span className="text-primary mt-0.5 flex-none">•</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} className="gap-2">
            {esVideo ? <Send className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
            {esVideo ? 'Enviar enlace' : 'Llamar ahora'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

/** Botones de accion reutilizables (fila del lead / header de conversacion). */
export function CallButtons({
  lead,
  variant = 'ghost',
}: {
  lead: { id: string; name: string; phone: string }
  variant?: 'ghost' | 'outline'
}) {
  const { startCall } = useCall()
  const [pendiente, setPendiente] = useState<CallKind | null>(null)

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        title="Llamar"
        onClick={(e) => { e.stopPropagation(); setPendiente('voice') }}
        className="text-foreground hover:text-emerald-600 hover:bg-secondary"
      >
        <Phone className="w-4 h-4" />
      </Button>
      <Button
        variant={variant}
        size="sm"
        title="Videollamada"
        onClick={(e) => { e.stopPropagation(); setPendiente('video') }}
        className="text-foreground hover:text-primary hover:bg-secondary"
      >
        <Video className="w-4 h-4" />
      </Button>

      {pendiente && (
        <CallConfirmDialog
          lead={lead}
          kind={pendiente}
          onCancel={() => setPendiente(null)}
          onConfirm={() => { startCall(lead, pendiente); setPendiente(null) }}
        />
      )}
    </>
  )
}
