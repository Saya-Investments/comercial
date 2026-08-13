'use client'

/**
 * Modulo de Llamadas.
 *
 * - Asesor: historial de sus llamadas, en dos cortes -> "Llamadas" (una fila por
 *   llamada) y "Por lead" (agrupadas, ordenadas por ultima llamada).
 * - Admin: ademas la "Cola" priorizada de leads que pidieron contacto.
 *
 * Las llamadas salen de crm_acciones_comerciales (tipo_accion = 'Llamada'), que
 * es donde el CRM ya las registra. La transcripcion y el resumen todavia no
 * existen en BD: saldran de la grabacion cuando se integre la Calling API.
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Phone, Video, Clock, ShieldCheck, ShieldAlert, ShieldX, ChevronRight, ChevronDown,
  X, FileText, Sparkles, Loader2, PhoneCall, Users,
} from 'lucide-react'
import { useCall, type CallKind } from '@/contexts/call-context'
import { CallConfirmDialog } from '@/components/calls/call-dock'
import { useAuth } from '@/contexts/auth-context'

/* ------------------------------------------------------------------ tipos */

/** Un turno de la transcripcion de Deepgram, ya normalizado. */
interface Turno {
  who: 'asesor' | 'lead'
  text: string
}

interface CallRow {
  id: string
  fecha: string
  duracionSeg: number | null
  resultado: string
  observaciones: string | null
  /** Fila de crm_llamadas. Null en las llamadas registradas a mano. */
  idLlamada: string | null
  tieneGrabacion: boolean
  transcript: Turno[] | null
  lead: {
    id: string
    nombre: string
    numero: string
    linea: string
    producto: string
    intencion: number | null
    estado: string
  }
}

/* ------------------------------------------------------------- constantes */

const ESTADO_LABELS: Record<string, string> = {
  No_contesta: 'No contestó',
  No_interesado: 'No interesado',
  Interesado: 'Interesado',
  Llamada_agendada: 'Llamada agendada',
  Cita_agendada: 'Cita agendada',
  Contactado: 'Contactado',
  Seguimiento: 'Seguimiento',
  Venta_cerrada: 'Venta cerrada',
  Prospecto: 'Prospecto',
  Numero_equivocado: 'Número equivocado',
}

const ESTADO_COLORS: Record<string, string> = {
  No_contesta: 'bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300',
  No_interesado: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  Interesado: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  Cita_agendada: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Llamada_agendada: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Contactado: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  Seguimiento: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  Venta_cerrada: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
}

/* --------------------------------------------------------------- helpers */

function fmtDur(seg: number | null) {
  if (seg === null || seg === undefined) return '—'
  if (seg === 0) return 'sin contestar'
  const m = Math.floor(seg / 60)
  const s = seg % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')} min` : `${s} s`
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function iniciales(nombre: string) {
  return nombre.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}

/* ------------------------------------------------------- detalle de llamada */

/**
 * Reproductor de la grabacion.
 *
 * Las pistas del asesor y del lead se graban por separado (asi la atribucion es
 * exacta), por eso se muestran dos reproductores en vez de uno. Los enlaces se
 * firman al abrir el detalle y viven 15 minutos: el bucket es privado y no se
 * guardan URLs permanentes de conversaciones con clientes.
 */
function Grabacion({ idLlamada, userId }: { idLlamada: string; userId: string }) {
  const [pistas, setPistas] = useState<{ nombre: string; url: string; mezcla: boolean }[] | null>(
    null,
  )
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'procesando' | 'error'>('cargando')
  const [verPistas, setVerPistas] = useState(false)

  useEffect(() => {
    let vivo = true
    fetch(`/api/calls/grabacion?idLlamada=${idLlamada}&userId=${userId}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!vivo) return
        if (r.ok && d.pistas?.length) {
          setPistas(d.pistas)
          setEstado('ok')
        } else {
          // 202 = la egress todavia esta subiendo el archivo a GCS.
          setEstado(r.status === 202 ? 'procesando' : 'error')
        }
      })
      .catch(() => vivo && setEstado('error'))
    return () => {
      vivo = false
    }
  }, [idLlamada, userId])

  if (estado === 'cargando') {
    return (
      <div className="px-5 py-3 border-b border-border bg-secondary/40 text-xs text-muted-foreground">
        Cargando grabación…
      </div>
    )
  }

  if (estado !== 'ok' || !pistas) {
    return (
      <div className="px-5 py-3 border-b border-border bg-secondary/40 text-xs text-muted-foreground">
        {estado === 'procesando'
          ? 'La grabación se está procesando. Volvé a abrir en unos segundos.'
          : 'No hay grabación disponible para esta llamada.'}
      </div>
    )
  }

  const mezcla = pistas.find((p) => p.mezcla)
  const sueltas = pistas.filter((p) => !p.mezcla)

  return (
    <div className="px-5 py-3 border-b border-border bg-secondary/40 space-y-2">
      {/* La conversacion completa es lo que uno quiere escuchar; las pistas por
          persona quedan detras de un toggle, para revisar un tramo puntual. */}
      {mezcla ? (
        <audio controls preload="none" src={mezcla.url} className="h-9 w-full" />
      ) : (
        sueltas.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            No hay mezcla de esta llamada; solo las pistas por separado.
          </p>
        )
      )}

      {sueltas.length > 0 && (
        <>
          <button
            onClick={() => setVerPistas((v) => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {verPistas ? 'Ocultar' : 'Ver'} pistas por persona
          </button>
          {verPistas &&
            sueltas.map((p) => (
              <div key={p.url} className="flex items-center gap-3">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground w-14 flex-none">
                  {p.nombre}
                </span>
                <audio controls preload="none" src={p.url} className="h-9 flex-1 min-w-0" />
              </div>
            ))}
        </>
      )}
    </div>
  )
}

function CallDetailModal({ call, onClose }: { call: CallRow; onClose: () => void }) {
  const [vista, setVista] = useState<'resumen' | 'transcripcion'>('resumen')
  const { user } = useAuth()
  const [transcripcion, setTranscripcion] = useState<Turno[] | null>(call.transcript)
  const [transcribiendo, setTranscribiendo] = useState(false)
  const [errorTr, setErrorTr] = useState<string | null>(null)
  /**
   * Guarda si ya se pidio la transcripcion.
   *
   * Va en una ref y no en el estado a proposito: si `transcribiendo` estuviera
   * en las dependencias del efecto, marcarlo lo volveria a ejecutar, la
   * limpieza abortaria la peticion en vuelo y el resultado se descartaria —
   * quedaba guardado en la BD pero no se pintaba hasta refrescar.
   */
  const pedida = useRef(false)

  /**
   * Se transcribe al abrir la pestaña, no antes.
   *
   * El cron termina transcribiendo todo, pero implica esperar hasta 7 minutos.
   * Cuando alguien quiere LEER la llamada no puede esperar eso, asi que se pide
   * en el momento. De paso no se gasta Deepgram en llamadas que nadie abre.
   */
  useEffect(() => {
    if (vista !== 'transcripcion' || pedida.current) return
    if (transcripcion) return
    if (!call.idLlamada || !call.tieneGrabacion || !user?.id) return

    pedida.current = true
    setTranscribiendo(true)
    setErrorTr(null)

    fetch('/api/calls/transcribir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idLlamada: call.idLlamada, userId: user.id }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (r.ok && d.turnos) {
          setTranscripcion(d.turnos)
        } else if (d.error === 'procesando' || d.error === 'en_curso') {
          setErrorTr('La grabación todavía se está procesando. Probá en unos segundos.')
          pedida.current = false // que se pueda reintentar sin cerrar el modal
        } else {
          setErrorTr('No se pudo transcribir la llamada.')
          pedida.current = false
        }
      })
      .catch(() => {
        setErrorTr('No se pudo transcribir la llamada.')
        pedida.current = false
      })
      .finally(() => setTranscribiendo(false))
  }, [vista, transcripcion, call.idLlamada, call.tieneGrabacion, user?.id])

  return (
    <div className="fixed inset-0 z-[65] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="w-full max-w-2xl flex flex-col max-h-[88vh]" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full grid place-items-center text-white font-bold text-sm flex-none"
              style={{ background: 'linear-gradient(135deg,#1B5E7E,#2E8BB0)' }}>
              {iniciales(call.lead.nombre)}
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-foreground truncate">{call.lead.nombre}</h3>
              <p className="text-xs text-muted-foreground font-mono">{call.lead.numero}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-lg transition-colors">
            <X className="w-5 h-5 text-foreground" />
          </button>
        </div>

        {/* metricas */}
        <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
          <div className="p-3 text-center">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Duración</p>
            <p className="font-mono font-semibold text-foreground mt-0.5">{fmtDur(call.duracionSeg)}</p>
          </div>
          <div className="p-3 text-center">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Resultado</p>
            <Badge className={`mt-1 border-transparent ${ESTADO_COLORS[call.resultado] || 'bg-gray-100 text-gray-700'}`}>
              {ESTADO_LABELS[call.resultado] || call.resultado}
            </Badge>
          </div>
          <div className="p-3 text-center">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Fecha</p>
            <p className="font-mono text-sm text-foreground mt-0.5">{fmtFecha(call.fecha)}</p>
          </div>
        </div>

        {/* grabacion */}
        {call.idLlamada && call.tieneGrabacion && user?.id ? (
          <Grabacion idLlamada={call.idLlamada} userId={user.id} />
        ) : (
          <div className="px-5 py-3 border-b border-border bg-secondary/40 text-xs text-muted-foreground">
            {call.duracionSeg
              ? 'Esta llamada no tiene grabación (se registró antes de que el CRM grabara).'
              : 'La llamada no fue contestada: no hay audio.'}
          </div>
        )}

        {/* tabs */}
        <div className="flex border-b border-border">
          {([['resumen', 'Resumen', Sparkles], ['transcripcion', 'Transcripción', FileText]] as const).map(
            ([k, label, Icon]) => (
              <button key={k} onClick={() => setVista(k)}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors inline-flex items-center justify-center gap-2 ${
                  vista === k ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
                }`}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ),
          )}
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {vista === 'resumen' ? (
            // Solo datos reales. El resumen automatico de la conversacion
            // llegara cuando exista la transcripcion; inventarlo mientras tanto
            // seria poner en boca del lead cosas que no dijo.
            <div className="space-y-4">
              <p className="text-sm text-foreground">
                {call.duracionSeg
                  ? `Llamada de ${fmtDur(call.duracionSeg)} con ${call.lead.nombre}.`
                  : `Intento de llamada a ${call.lead.nombre}, sin contestar.`}
              </p>

              {call.observaciones ? (
                <div className="rounded-lg bg-secondary p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Nota del asesor
                  </p>
                  <p className="text-sm text-foreground mt-1">{call.observaciones}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">El asesor no dejó una nota.</p>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Producto</p>
                  <p className="text-foreground mt-0.5">{call.lead.producto || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Estado del lead</p>
                  <p className="text-foreground mt-0.5">
                    {ESTADO_LABELS[call.lead.estado] || call.lead.estado || '—'}
                  </p>
                </div>
              </div>
            </div>
          ) : transcripcion?.length ? (
            <div className="space-y-3">
              {transcripcion.map((t, i) => (
                <div key={i} className={`flex ${t.who === 'asesor' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                    t.who === 'asesor'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-secondary text-foreground rounded-bl-sm'
                  }`}>
                    <p className={`text-[10px] uppercase tracking-wider mb-0.5 ${
                      t.who === 'asesor' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                      {t.who === 'asesor' ? 'Asesor' : call.lead.nombre.split(' ')[0]}
                    </p>
                    {t.text}
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground text-center pt-2">
                Transcripción generada a partir de la grabación.
              </p>
            </div>
          ) : transcribiendo ? (
            <div className="py-8 text-center">
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Transcribiendo la llamada…</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Suele tardar unos segundos.</p>
            </div>
          ) : (
            <div className="py-8 text-center">
              <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {errorTr ??
                  (call.tieneGrabacion
                    ? 'Esta llamada todavía no está transcrita.'
                    : 'Sin grabación, no hay nada que transcribir.')}
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------ cola (admin) */

type Perm = 'ok' | 'warn' | 'no'
interface QueueLead { id: string; name: string; phone: string; a: 1 | 2 | 3 | 4; al: string; motivo: string; espera: string; perm: Perm; permtxt: string }

const COLA: QueueLead[] = [
  { id: 'q1', name: 'Lucía Fernández', phone: '+51 900 000 101', a: 4, al: 'A4 · Decisión', motivo: 'Pidió llamada', espera: 'hace 3 h', perm: 'ok', permtxt: 'permiso 6d' },
  { id: 'q2', name: 'Elena Vargas', phone: '+51 900 000 107', a: 4, al: 'A4 · Decisión', motivo: 'Pidió llamada', espera: 'hace 4 h', perm: 'ok', permtxt: 'permiso 7d' },
  { id: 'q3', name: 'Marco Salazar', phone: '+51 900 000 102', a: 3, al: 'A3 · Concesionaria', motivo: 'Reintento', espera: 'hace 5 h', perm: 'warn', permtxt: 'vence 1d' },
  { id: 'q4', name: 'Rosa Delgado', phone: '+51 900 000 103', a: 3, al: 'A3 · Concesionaria', motivo: 'Seguimiento', espera: 'hace 8 h', perm: 'ok', permtxt: 'permiso 5d' },
  { id: 'q5', name: 'Jorge Ibáñez', phone: '+51 900 000 104', a: 2, al: 'A2 · Financiamiento', motivo: 'No contestó', espera: 'hace 12 h', perm: 'no', permtxt: 'sin permiso' },
]
const A_STYLES: Record<number, string> = {
  1: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300 border-transparent',
  2: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border-transparent',
  3: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-transparent',
  4: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-transparent',
}
const PERM_META: Record<Perm, { cls: string; Icon: typeof ShieldCheck }> = {
  ok: { cls: 'text-emerald-600', Icon: ShieldCheck },
  warn: { cls: 'text-amber-600', Icon: ShieldAlert },
  no: { cls: 'text-red-600', Icon: ShieldX },
}

/* ------------------------------------------------------------- componente */

export function CallsModule() {
  const { user } = useAuth()
  const { startCall } = useCall()
  const esAsesor = user?.role === 'asesor'

  const [seccion, setSeccion] = useState<'llamadas' | 'leads' | 'cola'>(esAsesor ? 'llamadas' : 'cola')
  const [calls, setCalls] = useState<CallRow[]>([])
  const [loading, setLoading] = useState(true)
  const [detalle, setDetalle] = useState<CallRow | null>(null)
  const [leadAbierto, setLeadAbierto] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState<{ lead: QueueLead; kind: CallKind } | null>(null)

  useEffect(() => {
    if (!user?.id) return
    setLoading(true)
    fetch(`/api/calls?userId=${user.id}`)
      .then((r) => r.json())
      .then((d) => setCalls(Array.isArray(d) ? d : []))
      .catch(() => setCalls([]))
      .finally(() => setLoading(false))
  }, [user?.id])

  // Agrupado por lead, ordenado por ultima llamada
  const porLead = useMemo(() => {
    const map = new Map<string, { lead: CallRow['lead']; calls: CallRow[] }>()
    for (const c of calls) {
      const g = map.get(c.lead.id) ?? { lead: c.lead, calls: [] }
      g.calls.push(c)
      map.set(c.lead.id, g)
    }
    return [...map.values()].sort(
      (a, b) => new Date(b.calls[0].fecha).getTime() - new Date(a.calls[0].fecha).getTime(),
    )
  }, [calls])

  const totalHablado = calls.reduce((a, c) => a + (c.duracionSeg || 0), 0)
  const conectadas = calls.filter((c) => (c.duracionSeg || 0) > 0).length

  const SECCIONES = [
    { k: 'llamadas' as const, label: 'Llamadas', Icon: PhoneCall },
    { k: 'leads' as const, label: 'Por lead', Icon: Users },
    ...(esAsesor ? [] : [{ k: 'cola' as const, label: 'Cola', Icon: Clock }]),
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="bg-background border-b border-border p-6">
        <h1 className="text-3xl font-bold text-foreground">Llamadas</h1>
        <p className="text-muted-foreground mt-1">
          Historial de tus llamadas, con su duración, resultado, grabación y transcripción.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* selector de seccion */}
        <div className="inline-flex rounded-lg border border-border bg-secondary/50 p-1 mb-5">
          {SECCIONES.map(({ k, label, Icon }) => (
            <button key={k} onClick={() => setSeccion(k)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium inline-flex items-center gap-2 transition-colors ${
                seccion === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* stats */}
        {seccion !== 'cola' && !loading && calls.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            <Badge variant="secondary" className="text-xs">{calls.length} llamadas</Badge>
            <Badge variant="secondary" className="text-xs">{conectadas} conectadas</Badge>
            <Badge variant="secondary" className="text-xs">{fmtDur(totalHablado)} hablados</Badge>
            <Badge variant="secondary" className="text-xs">{porLead.length} leads contactados</Badge>
          </div>
        )}

        {loading && seccion !== 'cola' ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* ---------------- SECCION: LLAMADAS ---------------- */}
            {seccion === 'llamadas' && (
              calls.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">Aún no registras llamadas.</p>
              ) : (
                <Card className="overflow-hidden">
                  {calls.map((c) => (
                    <button key={c.id} onClick={() => setDetalle(c)}
                      className="w-full flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0 hover:bg-secondary/40 transition-colors text-left">
                      <div className="w-10 h-10 rounded-full grid place-items-center text-white font-bold text-xs flex-none"
                        style={{ background: 'linear-gradient(135deg,#1B5E7E,#2E8BB0)' }}>
                        {iniciales(c.lead.nombre)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm text-foreground truncate">{c.lead.nombre}</p>
                        <p className="text-xs text-muted-foreground font-mono">{c.lead.numero}</p>
                      </div>
                      <div className="hidden sm:block text-xs text-muted-foreground min-w-[95px]">{fmtFecha(c.fecha)}</div>
                      <div className="text-xs font-mono text-foreground min-w-[75px] inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-muted-foreground" />{fmtDur(c.duracionSeg)}
                      </div>
                      <Badge className={`text-[11px] border-transparent hidden md:inline-flex ${ESTADO_COLORS[c.resultado] || 'bg-gray-100 text-gray-700'}`}>
                        {ESTADO_LABELS[c.resultado] || c.resultado}
                      </Badge>
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-none" />
                    </button>
                  ))}
                </Card>
              )
            )}

            {/* ---------------- SECCION: POR LEAD ---------------- */}
            {seccion === 'leads' && (
              porLead.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">Aún no llamaste a ningún lead.</p>
              ) : (
                <Card className="overflow-hidden">
                  {porLead.map(({ lead, calls: cs }) => {
                    const abierto = leadAbierto === lead.id
                    const hablado = cs.reduce((a, c) => a + (c.duracionSeg || 0), 0)
                    return (
                      <div key={lead.id} className="border-b border-border last:border-0">
                        <button onClick={() => setLeadAbierto(abierto ? null : lead.id)}
                          className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-secondary/40 transition-colors text-left">
                          {abierto ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-none" />
                                   : <ChevronRight className="w-4 h-4 text-muted-foreground flex-none" />}
                          <div className="w-10 h-10 rounded-full grid place-items-center text-white font-bold text-xs flex-none"
                            style={{ background: 'linear-gradient(135deg,#1B5E7E,#2E8BB0)' }}>
                            {iniciales(lead.nombre)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm text-foreground truncate">{lead.nombre}</p>
                            <p className="text-xs text-muted-foreground font-mono">{lead.numero}</p>
                          </div>
                          <div className="hidden sm:flex flex-col items-end text-xs text-muted-foreground">
                            <span>Última: {fmtFecha(cs[0].fecha)}</span>
                            <span className="font-mono">{fmtDur(hablado)} en total</span>
                          </div>
                          <Badge variant="secondary" className="text-xs flex-none">
                            {cs.length} {cs.length === 1 ? 'llamada' : 'llamadas'}
                          </Badge>
                        </button>

                        {abierto && (
                          <div className="bg-secondary/30 px-5 pb-3">
                            {cs.map((c) => (
                              <button key={c.id} onClick={() => setDetalle(c)}
                                className="w-full flex items-center gap-3 py-2.5 border-b border-border/60 last:border-0 hover:opacity-75 transition text-left">
                                <Phone className="w-3.5 h-3.5 text-primary flex-none" />
                                <span className="text-xs text-muted-foreground min-w-[95px]">{fmtFecha(c.fecha)}</span>
                                <span className="text-xs font-mono text-foreground min-w-[75px]">{fmtDur(c.duracionSeg)}</span>
                                <Badge className={`text-[11px] border-transparent ${ESTADO_COLORS[c.resultado] || 'bg-gray-100 text-gray-700'}`}>
                                  {ESTADO_LABELS[c.resultado] || c.resultado}
                                </Badge>
                                <span className="text-xs text-muted-foreground truncate hidden md:block flex-1">{c.observaciones}</span>
                                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-none" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </Card>
              )
            )}

            {/* ---------------- SECCION: COLA (admin) ---------------- */}
            {seccion === 'cola' && (
              <Card className="overflow-hidden">
                {COLA.map((l) => {
                  const { cls, Icon } = PERM_META[l.perm]
                  const bloqueado = l.perm === 'no'
                  return (
                    <div key={l.id} className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-0 hover:bg-secondary/40 transition-colors">
                      <div className="w-10 h-10 rounded-full grid place-items-center font-bold text-white text-xs flex-none"
                        style={{ background: 'linear-gradient(135deg,#1B5E7E,#2E8BB0)' }}>
                        {iniciales(l.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-foreground">{l.name}</span>
                          <Badge className={`text-[11px] font-medium ${A_STYLES[l.a]}`}>{l.al}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">{l.phone}</div>
                      </div>
                      <div className="hidden md:block text-xs text-muted-foreground min-w-[110px]">
                        <div className="text-foreground">{l.motivo}</div>
                        <div className="flex items-center gap-1 mt-0.5"><Clock className="w-3 h-3" /> {l.espera}</div>
                      </div>
                      <div className={`hidden sm:flex items-center gap-1.5 text-xs font-medium min-w-[110px] ${cls}`}>
                        <Icon className="w-3.5 h-3.5" /> {l.permtxt}
                      </div>
                      <div className="flex gap-1 flex-none">
                        <button title={bloqueado ? 'Sin permiso de llamada' : 'Llamar'} disabled={bloqueado}
                          onClick={() => setPendiente({ lead: l, kind: 'voice' })}
                          className="w-9 h-9 rounded-lg grid place-items-center border border-border text-foreground hover:text-emerald-600 hover:border-emerald-500 disabled:opacity-35 disabled:cursor-not-allowed transition-colors">
                          <Phone className="w-4 h-4" />
                        </button>
                        <button title="Videollamada" onClick={() => setPendiente({ lead: l, kind: 'video' })}
                          className="w-9 h-9 rounded-lg grid place-items-center border border-border text-foreground hover:text-primary hover:border-primary transition-colors">
                          <Video className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </Card>
            )}
          </>
        )}
      </div>

      {detalle && <CallDetailModal call={detalle} onClose={() => setDetalle(null)} />}
      {pendiente && (
        <CallConfirmDialog
          lead={pendiente.lead}
          kind={pendiente.kind}
          onCancel={() => setPendiente(null)}
          onConfirm={() => {
            const { lead, kind } = pendiente
            startCall({ id: lead.id, name: lead.name, phone: lead.phone }, kind)
            setPendiente(null)
          }}
        />
      )}
    </div>
  )
}
