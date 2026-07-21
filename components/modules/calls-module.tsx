'use client'

/**
 * Cola de llamadas.
 *
 * La llamada YA NO ocurre aca: ocurre en el dock flotante (call-dock), que
 * sobrevive a la navegacion. Este modulo es solo la COLA priorizada, util para
 * trabajar leads en tanda. Los puntos de entrada naturales del asesor son la
 * fila del lead (leads-table) y el header de la conversacion.
 */

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Phone, Video, Clock, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react'
import { useCall } from '@/contexts/call-context'

type Perm = 'ok' | 'warn' | 'no'

interface QueueLead {
  id: string
  name: string
  phone: string
  a: 1 | 2 | 3 | 4
  al: string
  motivo: string
  espera: string
  perm: Perm
  permtxt: string
}

const COLA: QueueLead[] = [
  { id: 'q1', name: 'Lucía Fernández', phone: '+51 900 000 101', a: 4, al: 'A4 · Decisión', motivo: 'Pidió llamada', espera: 'hace 3 h', perm: 'ok', permtxt: 'permiso 6d' },
  { id: 'q2', name: 'Elena Vargas', phone: '+51 900 000 107', a: 4, al: 'A4 · Decisión', motivo: 'Pidió llamada', espera: 'hace 4 h', perm: 'ok', permtxt: 'permiso 7d' },
  { id: 'q3', name: 'Marco Salazar', phone: '+51 900 000 102', a: 3, al: 'A3 · Concesionaria', motivo: 'Reintento', espera: 'hace 5 h', perm: 'warn', permtxt: 'vence 1d' },
  { id: 'q4', name: 'Rosa Delgado', phone: '+51 900 000 103', a: 3, al: 'A3 · Concesionaria', motivo: 'Seguimiento', espera: 'hace 8 h', perm: 'ok', permtxt: 'permiso 5d' },
  { id: 'q5', name: 'Carmen Ruiz', phone: '+51 900 000 105', a: 2, al: 'A2 · Financiamiento', motivo: 'Seguimiento', espera: 'hace 20 h', perm: 'ok', permtxt: 'permiso 4d' },
  { id: 'q6', name: 'Jorge Ibáñez', phone: '+51 900 000 104', a: 2, al: 'A2 · Financiamiento', motivo: 'No contestó', espera: 'hace 12 h', perm: 'no', permtxt: 'sin permiso' },
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

export function CallsModule() {
  const { startCall } = useCall()
  const pendientes = COLA.filter((l) => l.perm !== 'no').length

  return (
    <div className="flex flex-col h-full">
      <div className="bg-background border-b border-border p-6">
        <h1 className="text-3xl font-bold text-foreground">Cola de llamadas</h1>
        <p className="text-muted-foreground mt-1">
          Leads que pidieron contacto, priorizados. La llamada se abre en el panel flotante — puedes
          seguir navegando el CRM mientras hablas.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="flex flex-wrap gap-2 mb-4">
          <Badge variant="secondary" className="text-xs">{COLA.length} en cola</Badge>
          <Badge variant="secondary" className="text-xs">{pendientes} llamables ahora</Badge>
          <Badge variant="secondary" className="text-xs">
            {COLA.filter((l) => l.a >= 3).length} en intensión alta (A3–A4)
          </Badge>
        </div>

        <Card className="overflow-hidden">
          {COLA.map((l) => {
            const { cls, Icon } = PERM_META[l.perm]
            const bloqueado = l.perm === 'no'
            return (
              <div
                key={l.id}
                className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-0 hover:bg-secondary/40 transition-colors"
              >
                <div
                  className="w-10 h-10 rounded-full grid place-items-center font-bold text-white text-xs flex-none"
                  style={{ background: 'linear-gradient(135deg,#1B5E7E,#2E8BB0)' }}
                >
                  {l.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
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
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" /> {l.espera}
                  </div>
                </div>

                <div className={`hidden sm:flex items-center gap-1.5 text-xs font-medium min-w-[110px] ${cls}`}>
                  <Icon className="w-3.5 h-3.5" /> {l.permtxt}
                </div>

                <div className="flex gap-1 flex-none">
                  <button
                    title={bloqueado ? 'Sin permiso de llamada' : 'Llamar'}
                    disabled={bloqueado}
                    onClick={() => startCall({ id: l.id, name: l.name, phone: l.phone }, 'voice')}
                    className="w-9 h-9 rounded-lg grid place-items-center border border-border text-foreground hover:text-emerald-600 hover:border-emerald-500 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                  <button
                    title="Videollamada"
                    onClick={() => startCall({ id: l.id, name: l.name, phone: l.phone }, 'video')}
                    className="w-9 h-9 rounded-lg grid place-items-center border border-border text-foreground hover:text-primary hover:border-primary transition-colors"
                  >
                    <Video className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </Card>

        <p className="text-xs text-muted-foreground mt-4">
          Las llamadas quedan registradas en el <strong className="text-foreground">Resumen de la gestión</strong> de
          cada lead, con su duración y grabación.
        </p>
      </div>
    </div>
  )
}
