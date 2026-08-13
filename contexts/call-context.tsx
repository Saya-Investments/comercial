'use client'

/**
 * Estado global de la llamada activa.
 *
 * La llamada NO es una pantalla: es una accion sobre un lead. Este contexto vive
 * en el layout, asi que el dock sobrevive a la navegacion entre modulos y el
 * asesor puede seguir usando el CRM mientras habla.
 *
 * La llamada es REAL: se origina por la WhatsApp Business Calling API a traves
 * del conector de LiveKit, y el asesor habla desde el navegador conectado a la
 * misma sala. El video sigue simulado (Fase E).
 *
 * Ver cambios_yomira/CAMBIOS_LLAMADAS_CRM.md
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react'
import { Room, RoomEvent, Track } from 'livekit-client'
import { useAuth } from '@/contexts/auth-context'

export type CallKind = 'voice' | 'video'
export type CallStatus = 'ringing' | 'active' | 'ended'

export interface CallLead {
  id: string
  name: string
  phone: string
}

interface CallState {
  lead: CallLead
  kind: CallKind
  status: CallStatus
  seconds: number
  muted: boolean
  /** Mensaje para el asesor cuando la llamada no se pudo hacer. */
  error?: string
  /** Codigo del fallo. `sin_permiso` habilita el boton de pedir permiso. */
  errorCode?: string
  whatsappCallId?: string
  room?: string
  /** Fila de crm_llamadas creada al originar; sirve para cerrarla al colgar. */
  idLlamada?: string
  /** Si el lead llego a contestar. Distingue "no contesto" de "hablamos". */
  conecto?: boolean
  /** La grabacion arranco de verdad (el dock no debe decirlo si no). */
  grabando?: boolean
}

interface CallContextValue {
  call: CallState | null
  startCall: (lead: CallLead, kind: CallKind) => void
  endCall: () => void
  dismissCall: () => void
  toggleMute: () => void
}

const CallContext = createContext<CallContextValue | null>(null)

export function CallProvider({ children }: { children: ReactNode }) {
  const [call, setCall] = useState<CallState | null>(null)
  const { user } = useAuth()

  // La Room vive fuera del estado de React: es un objeto con ciclo de vida
  // propio y meterlo en el estado provocaria re-renders en cada evento.
  const roomRef = useRef<Room | null>(null)
  /**
   * Identificadores de la llamada en curso, fuera del estado.
   *
   * Los handlers de la Room se registran ANTES de marcar, asi que si leyeran el
   * estado de React verian el valor viejo (sin idLlamada) y se saltearian la
   * grabacion y el cierre del registro. Con una ref siempre ven lo ultimo.
   */
  const datosRef = useRef<{
    room?: string
    idLlamada?: string
    whatsappCallId?: string
    conecto?: boolean
    /** Ya se disparo la grabacion; evita hacerlo dos veces. */
    grabando?: boolean
  }>({})
  // El <audio> donde suena el lead. Se crea una sola vez y se reusa.
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Timer de la llamada activa
  useEffect(() => {
    if (!call || call.status !== 'active') return
    const id = setInterval(() => {
      setCall((c) => (c && c.status === 'active' ? { ...c, seconds: c.seconds + 1 } : c))
    }, 1000)
    return () => clearInterval(id)
  }, [call?.status, call?.lead.id])

  /**
   * Arranca la grabacion si ya se dan las dos condiciones.
   *
   * Hacen falta dos cosas que llegan en orden impredecible: que el lead haya
   * contestado (`conecto`) y que el servidor haya devuelto el `idLlamada`. El
   * conector de WhatsApp publica su audio tan rapido que a veces gana la
   * carrera contra la respuesta HTTP del dial. Por eso esto se llama desde los
   * DOS lados y actua cuando se completa el par, sin importar cual llego ultimo.
   */
  const intentarGrabar = useCallback(async () => {
    const d = datosRef.current
    if (!d.conecto || !d.idLlamada || !d.room || d.grabando) return
    d.grabando = true // evita disparar dos veces si ambos eventos coinciden
    try {
      const res = await fetch('/api/calls/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: d.room, idLlamada: d.idLlamada }),
      })
      const data = await res.json()
      setCall((c) => (c ? { ...c, grabando: Boolean(data.grabando) } : c))
      if (!data.grabando) console.warn('[call] la grabacion no arranco', data)
    } catch (e) {
      d.grabando = false
      console.error('[call] no se pudo grabar:', e)
    }
  }, [])

  /**
   * Avisa al servidor que la llamada termino.
   *
   * Corta del lado de Meta, detiene la grabacion y cierra el registro con su
   * duracion. Tiene que correr cuelgue QUIEN cuelgue: si solo se ejecutara al
   * pulsar "Colgar", las llamadas que corta el lead quedarian vivas del lado de
   * Meta (facturando hasta su limpieza automatica) y sin duracion en la BD.
   *
   * Es seguro llamarlo dos veces: el servidor solo cierra las filas que siguen
   * en estado 'iniciada'.
   */
  const avisarFin = useCallback(() => {
    const datos = datosRef.current
    if (!datos.whatsappCallId && !datos.room) return
    // No se espera la respuesta: la UI no debe quedarse colgada esperando a Meta.
    fetch('/api/calls/hangup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        whatsappCallId: datos.whatsappCallId,
        room: datos.room,
        idLlamada: datos.idLlamada,
        conecto: Boolean(datos.conecto),
      }),
    }).catch(() => {})
  }, [])

  /** Desconecta la sala y suelta el audio. Idempotente. */
  const limpiar = useCallback(async () => {
    const room = roomRef.current
    roomRef.current = null
    if (room) {
      try {
        await room.disconnect()
      } catch {
        // ya estaba desconectada
      }
    }
    if (audioRef.current) {
      audioRef.current.srcObject = null
    }
  }, [])

  const startCall = useCallback(
    async (lead: CallLead, kind: CallKind) => {
      // Cortar cualquier sala anterior antes de abrir otra. Si queda una viva,
      // la nueva conexion entra con la MISMA identity y LiveKit expulsa a una de
      // las dos — con el resultado de que el microfono se publica contra una
      // sesion que acaba de ser desconectada.
      await limpiar()
      datosRef.current = {}

      setCall({ lead, kind, status: 'ringing', seconds: 0, muted: false })

      // El video todavia no esta implementado: se deja el comportamiento
      // simulado del mockup para no romper la demo de la videollamada.
      if (kind === 'video') {
        setTimeout(() => {
          setCall((c) => (c && c.status === 'ringing' ? { ...c, status: 'active' } : c))
        }, 2200)
        return
      }

      if (!user?.id) {
        setCall((c) => (c ? { ...c, status: 'ended', error: 'Sesion no valida.' } : null))
        return
      }

      try {
        // 1) Sala y token, SIN marcar todavia.
        const resPrep = await fetch('/api/calls/prepare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId: lead.id, userId: user.id }),
        })
        const data = await resPrep.json()

        if (!resPrep.ok) {
          const msg =
            data.error === 'no_habilitado'
              ? 'Tu usuario no tiene habilitadas las llamadas.'
              : data.detail || 'No se pudo preparar la llamada.'
          setCall((c) => (c ? { ...c, status: 'ended', error: msg } : null))
          return
        }

        const room = new Room({ adaptiveStream: false, dynacast: false })
        roomRef.current = room

        if (!audioRef.current) {
          const el = document.createElement('audio')
          el.autoplay = true
          document.body.appendChild(el)
          audioRef.current = el
        }

        // El lead entra a la sala como un participante mas. Cuando publica su
        // audio, recien ahi la llamada esta "activa" de verdad: es el momento
        // en que contesto, no cuando el CRM mando a marcar.
        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Audio && audioRef.current) {
            track.attach(audioRef.current)
            // El lead contesto: recien ahora se puede grabar. Arrancar antes
            // dejaria archivos vacios de las llamadas que nadie atiende.
            datosRef.current.conecto = true
            intentarGrabar()

            setCall((c) =>
              c && c.status === 'ringing' ? { ...c, status: 'active', conecto: true } : c,
            )
          }
        })

        // Si el lead cuelga, su participante desaparece de la sala.
        // El lead colgo: se cierra todo igual que si hubiera colgado el asesor.
        room.on(RoomEvent.ParticipantDisconnected, () => {
          avisarFin()
          setCall((c) => (c && c.status !== 'ended' ? { ...c, status: 'ended' } : c))
          limpiar()
        })

        room.on(RoomEvent.Disconnected, () => {
          setCall((c) => (c && c.status !== 'ended' ? { ...c, status: 'ended' } : c))
        })

        // Diagnostico: si la conexion se cae, queremos ver DONDE. El error
        // "engine not connected within timeout" al publicar no dice si fallo el
        // websocket de señalizacion o la conexion de medios.
        room.on(RoomEvent.ConnectionStateChanged, (estado) => {
          console.log('[call] estado de conexion:', estado)
        })
        room.on(RoomEvent.SignalConnected, () => console.log('[call] señalizacion OK'))
        room.on(RoomEvent.MediaDevicesError, (e) => console.error('[call] microfono:', e))

        // 2) El asesor entra a la sala y publica su microfono ANTES de marcar.
        //    Al reves, la llamada puede morir (o el lead contestar) mientras el
        //    navegador todavia negocia, y el microfono se publica contra una
        //    sala que ya no esta ("engine not connected within timeout").
        console.log('[call] conectando a', data.url, 'sala', data.room)
        await room.connect(data.url, data.token)
        console.log('[call] conectado. estado =', room.state)

        await room.localParticipant.setMicrophoneEnabled(true)
        console.log('[call] microfono publicado')

        datosRef.current = { room: data.room }
        setCall((c) => (c ? { ...c, room: data.room } : c))

        // 3) Recien ahora se marca.
        const resDial = await fetch('/api/calls/dial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId: lead.id, userId: user.id, room: data.room }),
        })
        const dial = await resDial.json()

        if (!resDial.ok) {
          const msg =
            dial.error === 'sin_permiso'
              ? 'El lead todavía no autorizó que lo llamen por WhatsApp.'
              : dial.detail || 'No se pudo iniciar la llamada.'
          setCall((c) =>
            c ? { ...c, status: 'ended', error: msg, errorCode: dial.error } : null,
          )
          limpiar()
          return
        }

        datosRef.current = {
          ...datosRef.current, // conserva `conecto` si el lead ya contesto
          room: data.room,
          idLlamada: dial.idLlamada,
          whatsappCallId: dial.whatsappCallId,
        }
        // Si el lead contesto mientras el dial viajaba, esta es la señal que
        // faltaba: se graba ahora.
        intentarGrabar()
        setCall((c) =>
          c
            ? {
                ...c,
                whatsappCallId: dial.whatsappCallId,
                idLlamada: dial.idLlamada,
              }
            : c,
        )
      } catch (e) {
        console.error('[call] start:', e)
        const msg =
          e instanceof Error && /permission|NotAllowed/i.test(e.message)
            ? 'El navegador no dio acceso al microfono.'
            : 'No se pudo conectar la llamada.'
        setCall((c) => (c ? { ...c, status: 'ended', error: msg } : null))
        limpiar()
      }
    },
    [user?.id, limpiar, intentarGrabar, avisarFin],
  )

  const endCall = useCallback(() => {
    avisarFin()
    setCall((c) => (c ? { ...c, status: 'ended' } : null))
    limpiar()
  }, [limpiar, avisarFin])

  const dismissCall = useCallback(() => {
    limpiar()
    setCall(null)
  }, [limpiar])

  const toggleMute = useCallback(() => {
    setCall((c) => {
      if (!c) return null
      const nuevo = !c.muted
      roomRef.current?.localParticipant.setMicrophoneEnabled(!nuevo).catch(() => {})
      return { ...c, muted: nuevo }
    })
  }, [])

  // Si el usuario cierra la pestaña con una llamada activa, cortarla: si no,
  // la llamada queda viva del lado de Meta y se siguen facturando minutos.
  useEffect(() => {
    const alSalir = () => {
      const datos = datosRef.current
      if (datos.whatsappCallId) {
        navigator.sendBeacon(
          '/api/calls/hangup',
          new Blob([JSON.stringify({ ...datos, conecto: Boolean(datos.conecto) })], {
            type: 'application/json',
          }),
        )
      }
    }
    window.addEventListener('beforeunload', alSalir)
    return () => window.removeEventListener('beforeunload', alSalir)
  }, [])

  return (
    <CallContext.Provider value={{ call, startCall, endCall, dismissCall, toggleMute }}>
      {children}
    </CallContext.Provider>
  )
}

export function useCall() {
  const ctx = useContext(CallContext)
  if (!ctx) throw new Error('useCall debe usarse dentro de <CallProvider>')
  return ctx
}
