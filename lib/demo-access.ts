/**
 * Acceso a funcionalidades en prueba.
 *
 * Mientras una función está en fase de demo, debe verse SOLO en el perfil de
 * prueba, para que los asesores reales no se topen con experimentos.
 * Se filtra por email en vez de por rol justamente para aislar el experimento.
 *
 * Funciones en demo hoy: llamadas/videollamadas, y la reactivación de la base
 * tibia ("gestionar primero" en la bandeja).
 */

export const EMAILS_DEMO = ['danielcastillorios811@gmail.com']

/** Chequeo base por email (sirve en cliente y en API/servidor). */
export function esEmailDemo(email?: string | null): boolean {
  const e = email?.toLowerCase().trim()
  return !!e && EMAILS_DEMO.includes(e)
}

/** ¿Este usuario es el perfil de prueba? */
export function esPerfilDemo(user?: { email?: string | null } | null): boolean {
  return esEmailDemo(user?.email)
}

/** Alias histórico usado por los botones de llamada. */
export function puedeUsarLlamadas(user?: { email?: string | null } | null): boolean {
  return esEmailDemo(user?.email)
}
