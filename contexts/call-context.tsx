'use client'

/**
 * Estado global de la llamada activa.
 *
 * La llamada NO es una pantalla: es una accion sobre un lead. Este contexto vive
 * en el layout, asi que el dock sobrevive a la navegacion entre modulos y el
 * asesor puede seguir usando el CRM mientras habla.
 *
 * NOTA: por ahora la llamada es SIMULADA (no marca de verdad). La integracion
 * real con la WhatsApp Business Calling API esta planificada en el POC
 * (ver documentos/plan-poc-voz-crm.md).
 */

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'

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

  // Timer de la llamada activa
  useEffect(() => {
    if (!call || call.status !== 'active') return
    const id = setInterval(() => {
      setCall((c) => (c && c.status === 'active' ? { ...c, seconds: c.seconds + 1 } : c))
    }, 1000)
    return () => clearInterval(id)
  }, [call?.status, call?.lead.id])

  // "Ringing" breve antes de conectar (simulado)
  useEffect(() => {
    if (!call || call.status !== 'ringing') return
    const id = setTimeout(() => {
      setCall((c) => (c && c.status === 'ringing' ? { ...c, status: 'active' } : c))
    }, 2200)
    return () => clearTimeout(id)
  }, [call?.status, call?.lead.id])

  const startCall = useCallback((lead: CallLead, kind: CallKind) => {
    setCall({ lead, kind, status: 'ringing', seconds: 0, muted: false })
  }, [])

  const endCall = useCallback(() => {
    setCall((c) => (c ? { ...c, status: 'ended' } : null))
  }, [])

  const dismissCall = useCallback(() => setCall(null), [])

  const toggleMute = useCallback(() => {
    setCall((c) => (c ? { ...c, muted: !c.muted } : null))
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
