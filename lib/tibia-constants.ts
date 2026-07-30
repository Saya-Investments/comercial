// Constantes de la "base tibia" (cascada de priorizacion P1-P7).
// Fuente de la logica: cambios_yomira/RECONSTRUCCION_CASCADA_P1P7.md
//
// Este archivo NO importa prisma: lo consumen tanto el cliente (modal de campanas)
// como el servidor (rutas de API).

// Ventana de la ultima accion comercial que define la base tibia.
//
// OJO (drift): la tibia se define por la ULTIMA accion dentro de esta ventana fija,
// y ese campo se mueve. Cada vez que un asesor toca un lead tibio, su ultima accion
// avanza y el lead SALE de la ventana. Por eso el universo se encoge con la gestion
// (se observo 1.174 -> 1.150 -> 1.119 en una sola sesion). Si se cambia el piloto,
// cambiar estas dos fechas aqui y en ningun otro lado.
export const VENTANA_TIBIA_DESDE = '2026-03-14T00:00:00-05:00'
export const VENTANA_TIBIA_HASTA = '2026-06-15T00:00:00-05:00'

// Momento en que la seccion "Gestionar primero" quedo visible para los asesores
// reales en produccion (deploy del commit 425feb5, que quito el gate demo).
// Es la linea de corte para medir si un lead priorizado se gestiono DESPUES de
// que el asesor pudo verlo marcado.
export const REACTIVACION_LIVE = '2026-07-27T20:43:03Z'

export type EscalonTibia = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7'

export const ESCALONES_TIBIA: EscalonTibia[] = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']

export function esEscalonTibia(value: string): value is EscalonTibia {
  return (ESCALONES_TIBIA as string[]).includes(value)
}

// Escalones que se ofrecen como filtro en la creacion de campanas.
// La cascada se calcula completa (P1-P7) pero solo estos tres son seleccionables:
// son los leads que ya paso el asesor y que tiene sentido reactivar por campana.
export const ESCALONES_CAMPANA: {
  code: EscalonTibia
  label: string
  help: string
}[] = [
  {
    code: 'P5',
    label: 'Converso pero no avanzo',
    help: 'El asesor logro hablar con el y quedo marcado como contactado, pero nunca dijo que no ni mostro interes claro',
  },
  {
    code: 'P6',
    label: 'Dijo que no (objecion)',
    help: 'El asesor lo marco como no interesado',
  },
  {
    code: 'P7',
    label: 'Nunca se logro conectar',
    help: 'No contesta, numero equivocado, o sin ninguna gestion registrada',
  },
]

// Etiqueta descriptiva para todos los escalones (se usa en el preview y en los
// resumenes, incluidos los que no son seleccionables).
export const ETIQUETA_ESCALON: Record<EscalonTibia, string> = {
  P1: 'Tiene proforma sin cerrar',
  P2: 'Respondio al bot o a una campana',
  P3: 'Es prospecto en NSV',
  P4: 'Senal viva en el CRM',
  P5: 'Converso pero no avanzo',
  P6: 'Dijo que no (objecion)',
  P7: 'Nunca se logro conectar',
}
