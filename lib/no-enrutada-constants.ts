// Constantes de la "base no enrutada" (segmentos X1-X7 del piloto Retadora).
//
// Fuente de la logica: cambios_yomira/METODOLOGIA_MAPA_BASES_ACTUALIZADO.md
// (secciones 7 y 8) y scripts/_refresh_slides_3_4_actionable.mjs, que es el
// script que genera el slide 3 de cambios_yomira/Mapa_base_piloto.html.
//
// Este archivo NO importa prisma: lo consumen tanto el cliente (modal de
// campanas) como el servidor (rutas de API).

// Inicio del piloto de la base Retadora. Es el corte de fecha_creacion que
// define el universo. Si se cambia el piloto, cambiarlo aqui y en ningun otro
// lado (el script de analisis lo tiene como constante PILOTO).
export const PILOTO_RETADORA_DESDE = '2026-04-14T00:00:00-05:00'

// Umbrales de score que separan las olas de X1 y X2.
// Ola 1: score >= 0,50 | Ola 2: score 0,30-0,49 | Ola 3: el resto.
export const SCORE_OLA_1 = 0.5
export const SCORE_OLA_2 = 0.3

export type GrupoNoEnrutada = 'X1_OLA3' | 'X2_OLA3' | 'X3' | 'X4' | 'X5'

export const GRUPOS_NO_ENRUTADA: GrupoNoEnrutada[] = ['X1_OLA3', 'X2_OLA3', 'X3', 'X4', 'X5']

export function esGrupoNoEnrutada(value: string): value is GrupoNoEnrutada {
  return (GRUPOS_NO_ENRUTADA as string[]).includes(value)
}

// Grupos que se ofrecen como filtro en la creacion de campanas.
//
// Los segmentos X1-X7 se calculan completos (la cascada tiene que resolverse
// entera para que no haya solapamientos), pero solo estos cinco son
// seleccionables porque son los que el plan del slide 3 manda a campana:
//
//   - X1 y X2 olas 1 y 2  -> van a ASESOR DIRECTO, no a campana.
//   - X6 Provincia        -> esperando validacion de acceso y cobertura.
//   - X7 Descartado       -> requiere revisar el motivo antes de reactivar.
export const GRUPOS_CAMPANA: {
  code: GrupoNoEnrutada
  label: string
  help: string
}[] = [
  {
    code: 'X1_OLA3',
    label: 'Con DNI · ola 3',
    help: 'Tiene DNI pero le falta nombre o linea, o su score es menor a 0,30. No se puede enrutar hasta completar esos datos',
  },
  {
    code: 'X2_OLA3',
    label: 'Converso en serio · ola 3',
    help: 'Converso mucho con el bot pero, ademas del DNI, le falta nombre o linea, o su score es menor a 0,30',
  },
  {
    code: 'X3',
    label: 'Converso algo',
    help: 'Entre 3 y 6 mensajes de respuesta al bot y sin DNI. Hay interes pero falta calificarlo',
  },
  {
    code: 'X4',
    label: 'Una o dos frases',
    help: 'Respondio 1 o 2 veces al bot y sin DNI. Es el grupo mas grande y el menos calificado',
  },
  {
    code: 'X5',
    label: 'Sin respuesta',
    help: 'Nunca respondio al bot. Solo tiene sentido con un mensaje de reenganche distinto',
  },
]

// Etiqueta descriptiva de todos los grupos, incluidos los que no son
// seleccionables (se usan en el preview y en los resumenes).
export const ETIQUETA_GRUPO: Record<string, string> = {
  X1_OLA1: 'Con DNI · ola 1 (asesor)',
  X1_OLA2: 'Con DNI · ola 2 (asesor)',
  X1_OLA3: 'Con DNI · ola 3',
  X2_OLA1: 'Converso en serio · ola 1 (asesor)',
  X2_OLA2: 'Converso en serio · ola 2 (asesor)',
  X2_OLA3: 'Converso en serio · ola 3',
  X3: 'Converso algo',
  X4: 'Una o dos frases',
  X5: 'Sin respuesta',
  X6: 'Provincia',
  X7: 'Descartado',
}
