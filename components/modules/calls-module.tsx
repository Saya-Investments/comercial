'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Phone, Video, PhoneOff, Mic, Pause, Grid3x3, ArrowLeft, Send, VideoOff,
  Play, Users, FileText, CheckCircle2,
} from 'lucide-react'

type View = 'list' | 'call' | 'video'
type Perm = 'ok' | 'warn' | 'no'

interface Lead {
  nm: string; ph: string; ini: string; a: 1 | 2 | 3 | 4; al: string
  st: string; last: string; perm: Perm; permtxt: string
  producto: string; zona: string; sit: string; playbook: string
}

const LEADS: Lead[] = [
  { nm: 'Evelyn Príncipe', ph: '+51 902 032 654', ini: 'EP', a: 3, al: 'A3 · Concesionaria', st: 'Pidió llamada', last: 'hoy 16:38', perm: 'ok', permtxt: 'permiso 6d', producto: 'Auto · SemiNuevos', zona: 'Lima', sit: 'Dependiente', playbook: 'Está comparando dónde comprar. Diferenciar MQS, no bajar precio. Próximo paso: cita o precio garantizado.' },
  { nm: 'Nell Polo Chuqui', ph: '+51 945 394 815', ini: 'NP', a: 4, al: 'A4 · Decisión', st: 'Prefiere video', last: 'hoy 15:10', perm: 'ok', permtxt: 'permiso 7d', producto: 'Auto · como empresa', zona: 'Ate, Lima', sit: 'RUC · Npolo Perú SAC', playbook: 'A punto de cerrar. Proceso claro y rápido, acompañar hasta la firma. No dejar la llamada sin próximo paso agendado.' },
  { nm: 'Angel Ventura', ph: '+51 981 372 310', ini: 'AV', a: 3, al: 'A3 · Concesionaria', st: 'Pidió llamada', last: 'hoy 15:24', perm: 'warn', permtxt: 'vence 1d', producto: 'Auto · RAV4', zona: 'Lima', sit: 'Dependiente', playbook: 'Comparando opciones. Diferenciar y comprometer un paso (cita o proforma).' },
  { nm: 'Victor Ramírez', ph: '+51 926 914 230', ini: 'VR', a: 2, al: 'A2 · Financiamiento', st: 'En seguimiento', last: 'ayer 18:02', perm: 'no', permtxt: 'sin permiso', producto: 'Auto', zona: 'Lima', sit: 'Dependiente', playbook: 'Resolver el "cómo lo pago". Demostrar ventaja del fondo vs banco.' },
  { nm: 'Carla Medina', ph: '+51 913 887 402', ini: 'CM', a: 4, al: 'A4 · Decisión', st: 'Pidió llamada', last: 'hoy 11:20', perm: 'ok', permtxt: 'permiso 5d', producto: 'Inmueble · CasaAhorro', zona: 'Lima', sit: 'Independiente', playbook: 'Decisión final. Responder rápido, acompañar hasta la firma.' },
  { nm: 'Julio Sánchez', ph: '+51 977 214 550', ini: 'JS', a: 1, al: 'A1 · Necesidad', st: 'Explorando', last: 'ayer 09:41', perm: 'ok', permtxt: 'permiso 4d', producto: 'Auto', zona: 'Lima', sit: 'Independiente', playbook: 'Aún explora. Nutrir, activar urgencia, no presionar con precio.' },
]

const REC_VOZ = [
  { nm: 'Evelyn Príncipe', dur: '04:12', when: 'hoy 16:42' },
  { nm: 'Carla Medina', dur: '07:38', when: 'hoy 11:29' },
  { nm: 'Julio Sánchez', dur: '02:05', when: 'ayer 09:44' },
]
const REC_VIDEO = [
  { nm: 'Nell Polo Chuqui', dur: '12:20', when: 'hoy 15:22' },
  { nm: 'Victor Ramírez', dur: '08:57', when: 'ayer 18:15' },
]

const A_STYLES: Record<number, string> = {
  1: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300 border-transparent',
  2: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border-transparent',
  3: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-transparent',
  4: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-transparent',
}
const PERM_STYLES: Record<Perm, string> = {
  ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  no: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

const STAGE_BG = { background: '#0B1F3A' }
const STAGE_OVERLAY = {
  background:
    'radial-gradient(120% 80% at 80% -10%, rgba(46,139,176,.28), transparent 60%), radial-gradient(100% 70% at 0% 110%, rgba(201,162,75,.12), transparent 55%)',
}

function fmt(sec: number) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
}

function WaveBars() {
  return (
    <div className="flex items-center gap-1 h-11 my-2">
      {Array.from({ length: 22 }).map((_, i) => (
        <span
          key={i}
          className="w-1 rounded-full saya-eq"
          style={{ background: 'linear-gradient(180deg,#2E8BB0,#1B5E7E)', animationDelay: `${(i % 7) * 0.09}s` }}
        />
      ))}
    </div>
  )
}

function RecRow({ r }: { r: { nm: string; dur: string; when: string } }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0">
      <button className="w-9 h-9 rounded-full grid place-items-center border border-border bg-secondary text-primary hover:bg-primary hover:text-primary-foreground transition-colors flex-none">
        <Play className="w-4 h-4" />
      </button>
      <div className="min-w-[150px]">
        <div className="font-semibold text-sm text-foreground">{r.nm}</div>
        <div className="text-xs text-muted-foreground font-mono">{r.when}</div>
      </div>
      <div className="flex-1 flex items-center gap-[2px] h-6 overflow-hidden">
        {Array.from({ length: 60 }).map((_, i) => (
          <span key={i} className="w-[3px] rounded-sm bg-border" style={{ height: `${6 + ((i * 7) % 20)}px` }} />
        ))}
      </div>
      <div className="text-xs text-muted-foreground font-mono whitespace-nowrap">{r.dur}</div>
      <Button variant="ghost" size="sm" className="gap-1.5 hidden md:inline-flex">
        <FileText className="w-3.5 h-3.5" /> Transcripción
      </Button>
    </div>
  )
}

function Avatar({ ini, size = 36 }: { ini: string; size?: number }) {
  return (
    <div
      className="rounded-full grid place-items-center font-bold text-white flex-none"
      style={{ width: size, height: size, fontSize: size * 0.36, background: 'linear-gradient(135deg,#1B5E7E,#2E8BB0)' }}
    >
      {ini}
    </div>
  )
}

export function CallsModule() {
  const [view, setView] = useState<View>('list')
  const [lead, setLead] = useState<Lead>(LEADS[0])
  const [sec, setSec] = useState(134)

  useEffect(() => {
    if (view !== 'call') return
    const id = setInterval(() => setSec((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [view])

  const open = (l: Lead, v: View) => { setLead(l); setSec(134); setView(v) }

  return (
    <div className="flex flex-col h-full">
      <style>{`@keyframes sayaEq{0%,100%{height:8px}50%{height:38px}}.saya-eq{animation:sayaEq 1s ease-in-out infinite}
        @keyframes sayaPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.82)}}.saya-rdot{animation:sayaPulse 1.4s infinite}
        @media (prefers-reduced-motion: reduce){.saya-eq,.saya-rdot{animation:none}}`}</style>

      {/* Header */}
      <div className="bg-background border-b border-border p-6">
        <h1 className="text-3xl font-bold text-foreground">Llamadas</h1>
        <p className="text-muted-foreground mt-1">
          Contacta a los leads que pidieron llamada o videollamada. Cada uno abre su módulo completo — con grabación.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">

        {/* ============ LISTA DE LEADS ============ */}
        {view === 'list' && (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {['Lead', 'Intensión', 'Estado', 'Última gestión', ''].map((h, i) => (
                      <th key={i} className={`text-[11px] tracking-wider uppercase text-muted-foreground font-bold px-4 py-3.5 ${i === 4 ? 'text-right' : 'text-left'} ${i === 2 || i === 3 ? 'hidden md:table-cell' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {LEADS.map((l) => (
                    <tr key={l.ph} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar ini={l.ini} />
                          <div>
                            <div className="font-semibold text-sm text-foreground">{l.nm}</div>
                            <div className="text-xs text-muted-foreground font-mono">{l.ph}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`font-medium ${A_STYLES[l.a]}`}>{l.al}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">{l.st}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">{l.last}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          <Button variant="outline" size="sm" className="gap-1.5 hover:text-emerald-600 hover:border-emerald-500" onClick={() => open(l, 'call')}>
                            <Phone className="w-4 h-4" /> Llamada
                          </Button>
                          <Button variant="outline" size="sm" className="gap-1.5 hover:text-primary hover:border-primary" onClick={() => open(l, 'video')}>
                            <Video className="w-4 h-4" /> Videollamada
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ============ MÓDULO LLAMADA ============ */}
        {view === 'call' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setView('list')}>
                <ArrowLeft className="w-4 h-4" /> Leads
              </Button>
              <div>
                <div className="text-[11px] font-mono tracking-widest uppercase text-primary font-semibold">Módulo de voz · WhatsApp</div>
                <h2 className="text-lg font-bold text-foreground">Llamada en curso</h2>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[270px_1fr_300px] gap-4 items-start">
              {/* Cola */}
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
                  <h3 className="text-sm font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Cola de llamadas</h3>
                  <span className="text-xs font-mono text-muted-foreground">{LEADS.length}</span>
                </div>
                {LEADS.map((l) => (
                  <button key={l.ph} onClick={() => open(l, 'call')}
                    className={`w-full flex gap-3 items-center px-4 py-3 border-b border-border last:border-0 text-left hover:bg-secondary/50 transition-colors ${l.ph === lead.ph ? 'bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]' : ''}`}>
                    <Avatar ini={l.ini} size={36} />
                    <div className="min-w-0">
                      <div className="font-semibold text-[13.5px] text-foreground truncate">{l.nm}</div>
                      <div className="text-[11.5px] text-muted-foreground font-mono">{l.ph}</div>
                    </div>
                    <span className={`ml-auto text-[10.5px] font-bold font-mono px-2 py-1 rounded-full whitespace-nowrap ${PERM_STYLES[l.perm]}`}>{l.permtxt}</span>
                  </button>
                ))}
              </Card>

              {/* Stage */}
              <div className="rounded-2xl p-6 relative overflow-hidden min-h-[430px] flex flex-col text-[#eaf2fb] shadow-lg" style={STAGE_BG}>
                <div className="absolute inset-0" style={STAGE_OVERLAY} />
                <div className="absolute top-4 right-5 inline-flex items-center gap-2 font-mono text-[11.5px] tracking-wider font-bold text-[#ffd7d5] bg-[rgba(229,72,77,.16)] border border-[rgba(229,72,77,.5)] px-3 py-1.5 rounded-full z-10">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#E5484D] saya-rdot" /> GRABANDO · {fmt(sec)}
                </div>
                <div className="relative z-10 flex flex-col items-center text-center flex-1 justify-center">
                  <span className="font-mono text-xs tracking-widest uppercase text-[#8fb8d6]">En llamada</span>
                  <div className="my-3"><Avatar ini={lead.ini} size={96} /></div>
                  <h2 className="text-2xl font-bold">{lead.nm}</h2>
                  <div className="font-mono text-[#9fc0da] text-sm">{lead.ph}</div>
                  <div className="font-mono text-[40px] font-semibold tracking-wide my-3 tabular-nums">{fmt(sec)}</div>
                  <WaveBars />
                  <div className="flex gap-3 justify-center mt-5">
                    <CtrlBtn icon={<Mic className="w-5 h-5" />} label="Mute" />
                    <CtrlBtn icon={<Pause className="w-5 h-5" />} label="Espera" />
                    <CtrlBtn icon={<Grid3x3 className="w-5 h-5" />} label="Teclado" />
                    <CtrlBtn icon={<PhoneOff className="w-6 h-6" />} label="Colgar" danger onClick={() => setView('list')} />
                  </div>
                </div>
              </div>

              {/* Contexto */}
              <Card className="p-5">
                <h3 className="text-sm font-semibold pb-3 border-b border-border">Contexto del lead</h3>
                <div className="pt-2">
                  <KV k="Producto" v={lead.producto} />
                  <KV k="Zona" v={lead.zona} />
                  <KV k="Situación" v={lead.sit} />
                  <div className="flex justify-between items-center gap-2 py-2.5 border-b border-dashed border-border">
                    <span className="text-sm text-muted-foreground">Intensión</span>
                    <Badge className={`font-medium ${A_STYLES[lead.a]}`}>{lead.al}</Badge>
                  </div>
                </div>
                <div className="bg-secondary border border-border rounded-xl px-4 py-3 mt-3">
                  <div className="text-[10.5px] font-mono tracking-wider uppercase text-primary font-bold">Cómo abordarlo</div>
                  <p className="text-[13px] text-foreground mt-1.5">{lead.playbook}</p>
                </div>
                <div className="text-[11px] font-mono tracking-wider uppercase text-muted-foreground mt-4 mb-2">Al colgar</div>
                <div className="grid grid-cols-2 gap-2">
                  {['✓ Contactado', '📅 Agendó', '↻ Reintentar', '✕ No contestó'].map((d) => (
                    <Button key={d} variant="outline" size="sm" className="text-[12.5px]" onClick={() => setView('list')}>{d}</Button>
                  ))}
                </div>
              </Card>
            </div>

            {/* Grabaciones */}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
                <h3 className="text-sm font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Grabaciones recientes</h3>
                <span className="text-xs text-muted-foreground">se guardan automáticamente</span>
              </div>
              {REC_VOZ.map((r) => <RecRow key={r.nm} r={r} />)}
            </Card>
          </div>
        )}

        {/* ============ MÓDULO VIDEOLLAMADA ============ */}
        {view === 'video' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setView('list')}>
                <ArrowLeft className="w-4 h-4" /> Leads
              </Button>
              <div>
                <div className="text-[11px] font-mono tracking-widest uppercase text-primary font-semibold">Módulo de video · LiveKit</div>
                <h2 className="text-lg font-bold text-foreground">Videollamada en curso</h2>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[270px_1fr_300px] gap-4 items-start">
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
                  <h3 className="text-sm font-semibold flex items-center gap-2"><Video className="w-4 h-4 text-primary" /> En sala</h3>
                  <span className="text-xs text-muted-foreground">1 activa</span>
                </div>
                <div className="px-4 py-3.5 text-[13px] text-muted-foreground">
                  El lead entra por un <b className="text-foreground">link enviado a su WhatsApp</b>. Al abrir la sala aparece aquí en video. La llamada se graba completa.
                </div>
                <div className="flex gap-3 items-center px-4 py-3 border-t border-border bg-primary/10">
                  <Avatar ini={lead.ini} size={36} />
                  <div><div className="font-semibold text-[13.5px]">{lead.nm}</div><div className="text-[11.5px] text-muted-foreground font-mono">en sala · 04:37</div></div>
                  <span className="ml-auto text-[10.5px] font-bold font-mono px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">EN VIVO</span>
                </div>
              </Card>

              {/* Video stage */}
              <div className="rounded-2xl relative overflow-hidden min-h-[430px] grid place-items-center shadow-lg"
                style={{ background: 'radial-gradient(80% 80% at 50% 30%, #16324f, #06101f)' }}>
                <div className="absolute top-4 right-[18px] inline-flex items-center gap-2 text-xs bg-[rgba(30,142,90,.18)] border border-[rgba(30,142,90,.5)] text-[#bff0d5] px-3 py-1.5 rounded-full z-10">
                  <Send className="w-3 h-3" /> Link enviado al hilo de WhatsApp
                </div>
                <div className="absolute top-4 left-[18px] inline-flex items-center gap-2.5 text-sm bg-[rgba(4,14,28,.55)] px-3 py-1.5 rounded-lg text-[#eaf2fb] border border-[rgba(255,255,255,.1)] z-10">
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-[#ffd7d5]"><span className="w-2 h-2 rounded-full bg-[#E5484D] saya-rdot" /> REC</span>
                  {lead.nm}
                </div>
                <div className="text-center text-[#cfe0f0]">
                  <div className="mx-auto mb-3"><Avatar ini={lead.ini} size={110} /></div>
                  <div className="font-mono text-xs text-[#9fc0da] tracking-wide">CÁMARA DEL LEAD · conectando video…</div>
                </div>
                <div className="absolute right-4 bottom-[84px] w-[150px] h-[100px] rounded-xl grid place-items-center text-[#cfe0f0] text-xs border-2 border-[rgba(255,255,255,.18)] shadow-xl"
                  style={{ background: 'linear-gradient(135deg,#0e2440,#1b5e7e)' }}>Tú (asesor)</div>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3 bg-[rgba(4,14,28,.6)] px-3.5 py-2.5 rounded-2xl border border-[rgba(255,255,255,.12)]">
                  <CtrlBtn icon={<Video className="w-5 h-5" />} />
                  <CtrlBtn icon={<Mic className="w-5 h-5" />} />
                  <CtrlBtn icon={<Send className="w-5 h-5" />} />
                  <CtrlBtn icon={<VideoOff className="w-6 h-6" />} danger onClick={() => setView('list')} />
                </div>
              </div>

              <Card className="p-5">
                <h3 className="text-sm font-semibold pb-3 border-b border-border">Contexto del lead</h3>
                <div className="pt-2">
                  <KV k="Producto" v={lead.producto} />
                  <KV k="Zona" v={lead.zona} />
                  <KV k="Documento" v={lead.sit} />
                  <div className="flex justify-between items-center gap-2 py-2.5 border-b border-dashed border-border">
                    <span className="text-sm text-muted-foreground">Intensión</span>
                    <Badge className={`font-medium ${A_STYLES[lead.a]}`}>{lead.al}</Badge>
                  </div>
                </div>
                <div className="bg-secondary border border-border rounded-xl px-4 py-3 mt-3">
                  <div className="text-[10.5px] font-mono tracking-wider uppercase text-primary font-bold">Cómo abordarlo</div>
                  <p className="text-[13px] text-foreground mt-1.5">{lead.playbook}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-3">🎥 La grabación quedará en el historial del lead al terminar.</p>
              </Card>
            </div>

            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Video className="w-4 h-4 text-primary" /> Videollamadas grabadas</h3>
                <span className="text-xs text-muted-foreground">reproducibles desde el historial del lead</span>
              </div>
              {REC_VIDEO.map((r) => <RecRow key={r.nm} r={r} />)}
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-2.5 border-b border-dashed border-border">
      <span className="text-sm text-muted-foreground">{k}</span>
      <span className="text-sm font-semibold text-right text-foreground">{v}</span>
    </div>
  )
}

function CtrlBtn({ icon, label, danger, onClick }: { icon: React.ReactNode; label?: string; danger?: boolean; onClick?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button onClick={onClick}
        className={`rounded-full grid place-items-center transition-colors ${danger
          ? 'w-16 h-16 bg-[#C63A38] hover:brightness-110 text-white border border-[#C63A38]'
          : 'w-14 h-14 bg-white/[.07] hover:bg-white/[.15] text-[#dcecf8] border border-white/[.16]'}`}>
        {icon}
      </button>
      {label && <span className="text-[10.5px] text-[#8fb8d6] font-mono">{label}</span>}
    </div>
  )
}
