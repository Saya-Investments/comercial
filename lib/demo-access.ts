/**
 * Acceso a funcionalidades en prueba.
 *
 * Mientras las llamadas/videollamadas esten en fase de demo (todavia NO marcan
 * de verdad: falta integrar la WhatsApp Calling API), la funcion debe verse
 * SOLO en el perfil de prueba. Los asesores reales no deben toparse con botones
 * que simulan una llamada.
 *
 * Se filtra por email en vez de por rol justamente para que el experimento
 * quede aislado de los asesores de produccion.
 */

const EMAILS_DEMO = ['danielcastillorios811@gmail.com']

export function puedeUsarLlamadas(user?: { email?: string | null } | null): boolean {
  const email = user?.email?.toLowerCase().trim()
  return !!email && EMAILS_DEMO.includes(email)
}
