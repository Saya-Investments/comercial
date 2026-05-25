import { prisma } from '@/lib/prisma'

/**
 * Cuando el asesor envia un mensaje al lead desde el CRM, registramos
 * automaticamente una accion comercial `Mensaje_WSP` para que:
 *   - El cron de reasignaciones detecte que el lead esta siendo gestionado
 *     y no lo reasigne a las 24h.
 *   - Quede traza en hist de gestion del asesor sin pedirle que marque estado.
 *
 * Solo se crea UNA accion por "racha de gestion" (es decir, solo si no existe
 * ya alguna accion posterior a la fecha_asignacion del matching activo).
 * Las acciones reales que el asesor marque despues (Contactado, Interesado,
 * etc.) se siguen creando normalmente desde la UI.
 */
export async function registrarMensajeWspComoAccion(idLead: string): Promise<void> {
  try {
    // Buscar el matching activo del lead
    const matching = await prisma.matching.findFirst({
      where: { id_lead: idLead, asignado: true },
      orderBy: { fecha_asignacion: 'desc' },
      select: { fecha_asignacion: true, id_asesor: true },
    })

    if (!matching?.fecha_asignacion || !matching.id_asesor) return

    // Si ya existe alguna accion desde la asignacion, no crear nada
    const yaHayAccion = await prisma.crm_acciones_comerciales.findFirst({
      where: {
        id_lead: idLead,
        fecha_creacion: { gte: matching.fecha_asignacion },
      },
      select: { id_accion: true },
    })

    if (yaHayAccion) return

    // Buscar el id_usuario asociado al asesor
    const usuario = await prisma.crm_usuarios.findFirst({
      where: { id_asesor: matching.id_asesor },
      select: { id_usuario: true },
    })

    if (!usuario) return

    await prisma.crm_acciones_comerciales.create({
      data: {
        id_lead: idLead,
        id_usuario: usuario.id_usuario,
        tipo_accion: 'Mensaje_WSP',
        estado_asesor: 'Contactado',
        observaciones: 'Registro automatico: asesor tomo control de la conversacion por WhatsApp',
      },
    })
  } catch (err) {
    // No bloquear el envio si falla el registro
    console.error('[registrarMensajeWspComoAccion] Error:', err)
  }
}
