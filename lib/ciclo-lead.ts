// Ciclo de vida de un lead en la bandeja del asesor: Nuevo / Reactivado / Archivado.
//
// Para el asesor solo existen tres palabras: "Nuevo", "Reactivado" y
// "Archivado". El porque de cada reactivacion (base tibia, campana del bot,
// cron, retomado a mano) lo ven solo admin y supervisor.
//
// Este archivo NO importa prisma: la ruta /api/leads le pasa los datos ya
// consultados y aqui solo se decide.

/** Dias sin actividad para que un lead pase a Archivado. */
export const DIAS_ARCHIVO = 30

/**
 * Un lead que estuvo al menos este tiempo sin actividad y vuelve a moverse es
 * "Reactivado". Es el mismo corte que el de archivo: volver del archivo es
 * reactivarse.
 */
export const DIAS_DORMIDO = DIAS_ARCHIVO

/**
 * Ventana en la que un lead recien contactado por una campana NO se muestra
 * en los archivados del asesor, para que no lo llame a la vez que el bot.
 */
export const DIAS_CAMPANA_RECIENTE = 7

/** Estados del asesor que hacen a un archivado "recuperable" (va primero). */
const ESTADOS_RECUPERABLES = new Set([
  'Interesado',
  'Seguimiento',
  'Cita_agendada',
  'Llamada_agendada',
  'Venta_cerrada',
])

/** Estados NSV que ya son una salida: no cuentan como recuperables. */
const FUNNEL_SALIDAS = new Set([
  'Rechazado',
  'Devuelto',
  'Firma Rechazada',
  'Firma Cancelada',
  'Firma Expirada',
  'Descartado',
  'Anulado',
])

const MOTIVO_TIBIA: Record<string, string> = {
  P1: 'Proforma pendiente',
  P2: 'Respondió campaña',
  P3: 'Es prospecto',
  P4: 'Señal viva',
}

export type Ciclo = 'nuevo' | 'reactivado' | 'archivado'

export type MotivoReactivacion = {
  tipo: 'tibia' | 'bot' | 'reasignado' | 'retomado'
  detalle: string
}

export type DatosCiclo = {
  fechaCreacion: Date
  /** Cuando le llego el lead al asesor actual (matching vigente). */
  fechaAsignacion: Date | null
  /**
   * Acciones reales de asesores, ordenadas ascendente. Excluye las que el bot
   * registra solo al reactivar ("[REACTIVACION] ..."): esas no son gestion.
   */
  accionesAsesor: Date[]
  /** Ultima reactivacion del bot en la que el lead NO dijo que no le interesa. */
  reactivacionBot: Date | null
  /** Motivo de la ultima asignacion (hist_asignaciones.motivo_reasignacion). */
  motivoUltimaAsignacion: string | null
  /** Marca activa de base tibia ("gestionar primero"). */
  tibia: { escalon: string; ola: number } | null
}

const DIA_MS = 24 * 60 * 60 * 1000

function dias(ms: number): number {
  return Math.floor(ms / DIA_MS)
}

function formatoFecha(d: Date): string {
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', timeZone: 'America/Lima' })
}

export function calcularCiclo(datos: DatosCiclo, ahora: Date = new Date()): {
  ciclo: Ciclo
  motivo: MotivoReactivacion | null
  ultimaActividad: Date
  /**
   * Reactivado por el bot y el asesor todavia no registro nada desde entonces:
   * el lead le contesto al bot y esta esperando. Va al tope de la bandeja.
   */
  esperando: boolean
} {
  const corteArchivo = ahora.getTime() - DIAS_ARCHIVO * DIA_MS
  const dormido = DIAS_DORMIDO * DIA_MS

  const creado = datos.fechaCreacion
  const llego = datos.fechaAsignacion ?? creado
  const acciones = datos.accionesAsesor
  const ultimaAccion = acciones.length > 0 ? acciones[acciones.length - 1] : null
  const accionAntesDeLlegar = [...acciones].reverse().find((a) => a < llego) ?? null
  const accionAnteriorALaUltima = acciones.length > 1 ? acciones[acciones.length - 2] : null

  const ultimaActividad = ultimaAccion && ultimaAccion > llego ? ultimaAccion : llego
  const botReciente = !!datos.reactivacionBot && datos.reactivacionBot.getTime() > corteArchivo

  const activo = ultimaActividad.getTime() > corteArchivo || !!datos.tibia || botReciente

  if (!activo) {
    return { ciclo: 'archivado', motivo: null, ultimaActividad, esperando: false }
  }

  // --- ¿Volvio despues de estar dormido? --------------------------------
  if (datos.tibia) {
    const texto = MOTIVO_TIBIA[datos.tibia.escalon] ?? 'Gestionar primero'
    return {
      ciclo: 'reactivado',
      motivo: { tipo: 'tibia', detalle: `Base tibia ${datos.tibia.escalon} (ola ${datos.tibia.ola}) · ${texto}` },
      ultimaActividad,
      esperando: false,
    }
  }

  const llegoReciente = llego.getTime() > corteArchivo
  if (botReciente || (datos.motivoUltimaAsignacion === 'reactivacion_campana' && llegoReciente)) {
    const cuando = datos.reactivacionBot && botReciente ? datos.reactivacionBot : llego
    return {
      ciclo: 'reactivado',
      motivo: { tipo: 'bot', detalle: `Respondió a una campaña del bot · ${formatoFecha(cuando)}` },
      ultimaActividad,
      esperando: !ultimaAccion || ultimaAccion < cuando,
    }
  }

  if (llegoReciente) {
    const antes = accionAntesDeLlegar && accionAntesDeLlegar > creado ? accionAntesDeLlegar : creado
    const hueco = llego.getTime() - antes.getTime()
    if (hueco > dormido) {
      return {
        ciclo: 'reactivado',
        motivo: { tipo: 'reasignado', detalle: `Le llegó tras ${dias(hueco)} días sin actividad` },
        ultimaActividad,
        esperando: false,
      }
    }
  }

  if (ultimaAccion && ultimaAccion.getTime() > corteArchivo) {
    const antes = accionAnteriorALaUltima && accionAnteriorALaUltima > llego ? accionAnteriorALaUltima : llego
    const hueco = ultimaAccion.getTime() - antes.getTime()
    if (hueco > dormido) {
      return {
        ciclo: 'reactivado',
        motivo: { tipo: 'retomado', detalle: `El asesor lo retomó tras ${dias(hueco)} días sin actividad` },
        ultimaActividad,
        esperando: false,
      }
    }
  }

  return { ciclo: 'nuevo', motivo: null, ultimaActividad, esperando: false }
}

/** Un archivado que conviene mirar primero: quedo en un estado prometedor o avanza en NSV. */
export function esRecuperable(estadoAsesor: string | null | undefined, estadoFunnel: string | null | undefined): boolean {
  if (estadoAsesor && ESTADOS_RECUPERABLES.has(estadoAsesor)) return true
  return !!estadoFunnel && !FUNNEL_SALIDAS.has(estadoFunnel)
}

/** Fecha YYYY-MM-DD en hora de Lima (la que ve el asesor y usa el filtro). */
export function fechaLima(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(d)
}
