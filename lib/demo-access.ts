/**
 * Acceso al módulo de llamadas.
 *
 * Se filtra por email en vez de por rol porque el piloto arranca con dos
 * asesores concretos, no con un grupo: el rol "asesor" lo tienen todos y
 * abriría la función a la fuerza de ventas completa.
 *
 * El límite no es solo de producto. Cada llamada levanta grabaciones
 * concurrentes en LiveKit, y el plan contratado documenta un tope bajo; con dos
 * asesores está probado que funciona. Antes de sumar al call center (serían ~8)
 * hay que validar a esa escala o subir de plan.
 *
 * Las cuentas de prueba van aparte de las del piloto: así se puede sacar o
 * cambiar el piloto sin perder de paso el acceso para validar.
 */

/** Cuentas internas de prueba. Se mantienen para poder validar sin tocar el piloto real. */
const EMAILS_PRUEBA = [
  'danielcastillorios811@gmail.com',
  'rossanaslzr9@gmail.com',
]

/** Los dos asesores del piloto en produccion. */
const EMAILS_PILOTO = [
  'nhuayhuas@maquimas.pe',
  'sinfante@maquimas.pe',
]

export const EMAILS_DEMO = [...EMAILS_PILOTO, ...EMAILS_PRUEBA]

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
