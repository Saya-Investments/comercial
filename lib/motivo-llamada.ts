/**
 * Traduce el estado tecnico de una llamada a algo que se pueda leer en un
 * reporte.
 *
 * `crm_llamadas.estado` sirve para el flujo, no para explicar: "sin_permiso" y
 * "fallida" no le dicen nada a quien mira el modulo, y `motivo_fallo` guarda el
 * error crudo de Meta (un JSON de 1000 caracteres). Aca se convierte una cosa
 * en la otra, en un solo lugar, para que la tabla y el resumen cuenten lo mismo.
 */

export type CategoriaLlamada =
  | 'conectada'
  | 'no_contesto'
  | 'sin_permiso'
  | 'fallida'
  | 'indeterminada'

export interface ResultadoLlamada {
  categoria: CategoriaLlamada
  /** Etiqueta corta, para el badge de la tabla. */
  etiqueta: string
  /** Por que no se concreto. `null` cuando si se concreto. */
  motivo: string | null
  /** Que se puede hacer al respecto, cuando hay algo que hacer. */
  accion: string | null
}

export const ETIQUETAS: Record<CategoriaLlamada, string> = {
  conectada: 'Conectada',
  no_contesto: 'No contestó',
  sin_permiso: 'Sin permiso',
  fallida: 'Falló',
  indeterminada: 'Sin cerrar',
}

/**
 * Errores de Meta que ya vimos o que son esperables en este flujo. El codigo va
 * primero porque el texto del mensaje cambia entre versiones de la API; el
 * numero no.
 */
const ERRORES_META: { patron: RegExp; motivo: string; accion?: string }[] = [
  {
    patron: /138006|call permission/i,
    motivo: 'El lead no autorizó recibir llamadas por WhatsApp',
    accion: 'Pedirle el permiso desde el chat antes de volver a llamar',
  },
  {
    patron: /131026|not a valid whatsapp user|no es un usuario/i,
    motivo: 'El número no tiene WhatsApp',
    accion: 'Verificar el número en la ficha del lead',
  },
  {
    patron: /131047|re-?engagement|24 hour|ventana/i,
    motivo: 'La ventana de 24 h está cerrada',
    accion: 'Escribirle con una plantilla para reabrir la conversación',
  },
  {
    patron: /131048|130429|rate limit|too many/i,
    motivo: 'Meta limitó la cantidad de llamadas por ahora',
    accion: 'Reintentar más tarde',
  },
  {
    patron: /\b190\b|access token|session has expired|OAuth/i,
    motivo: 'El token de Meta venció',
    accion: 'Renovar WHATSAPP_ACCESS_TOKEN (es un problema de configuración, no del asesor)',
  },
  {
    patron: /timeout|ETIMEDOUT|ECONNRESET|network/i,
    motivo: 'Se cortó la conexión al intentar marcar',
    accion: 'Reintentar',
  },
]

/** Saca el texto util del error crudo que devolvio Meta. */
function mensajeDelError(crudo: string): string {
  try {
    const obj = JSON.parse(crudo)
    const m = obj?.error?.message ?? obj?.message
    if (typeof m === 'string' && m.trim()) return m
  } catch {
    // El campo no siempre es JSON valido: viene recortado a 1000 caracteres, asi
    // que un error largo queda partido a la mitad. Por eso el regex de abajo.
  }
  const m = /"message"\s*:\s*"([^"]+)"/.exec(crudo)
  return m ? m[1] : crudo
}

export function interpretar(
  estado: string,
  motivoFallo?: string | null,
): ResultadoLlamada {
  const crudo = motivoFallo ?? ''

  switch (estado) {
    case 'finalizada':
      return { categoria: 'conectada', etiqueta: ETIQUETAS.conectada, motivo: null, accion: null }

    // El lead contesto pero nunca llego el cierre. Cuenta como conectada —
    // hubo conversacion — pero la duracion que se ve esta incompleta.
    case 'conectada':
      return {
        categoria: 'conectada',
        etiqueta: 'Conectada (sin cerrar)',
        motivo: 'El lead contestó, pero el registro no se cerró: la duración está incompleta',
        accion: null,
      }

    case 'no_contesto':
      return {
        categoria: 'no_contesto',
        etiqueta: ETIQUETAS.no_contesto,
        motivo: 'Timbró y el lead no atendió',
        accion: 'Reintentar en otro horario',
      }

    case 'sin_permiso':
      return {
        categoria: 'sin_permiso',
        etiqueta: ETIQUETAS.sin_permiso,
        motivo: 'El lead no autorizó recibir llamadas por WhatsApp',
        accion: 'Pedirle el permiso desde el chat antes de volver a llamar',
      }

    case 'fallida': {
      const conocido = ERRORES_META.find((e) => e.patron.test(crudo))
      if (conocido) {
        return {
          categoria: 'fallida',
          etiqueta: ETIQUETAS.fallida,
          motivo: conocido.motivo,
          accion: conocido.accion ?? null,
        }
      }
      // Un error que no reconocemos se muestra tal cual en vez de esconderlo
      // detras de un "Error desconocido": el texto de Meta es lo unico que
      // permite entender que paso.
      const texto = mensajeDelError(crudo).trim()
      return {
        categoria: 'fallida',
        etiqueta: ETIQUETAS.fallida,
        motivo: texto ? texto.slice(0, 200) : 'Falló al marcar, sin detalle registrado',
        accion: null,
      }
    }

    // 'iniciada': Meta acepto la llamada y despues no se supo mas. Pasa cuando
    // el asesor cierra la pestaña sin colgar. No se puede afirmar que el lead no
    // contesto, asi que se cuenta aparte en vez de ensuciar la tasa de contacto.
    case 'iniciada':
      return {
        categoria: 'indeterminada',
        etiqueta: ETIQUETAS.indeterminada,
        motivo: 'Se marcó pero nunca llegó el cierre: no se sabe si el lead contestó',
        accion: 'Suele ser que el asesor cerró la pestaña sin colgar',
      }

    default:
      return {
        categoria: 'indeterminada',
        etiqueta: estado,
        motivo: 'Estado no reconocido',
        accion: null,
      }
  }
}
