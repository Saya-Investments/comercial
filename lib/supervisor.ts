import { prisma } from '@/lib/prisma'

/**
 * Returns the asesor IDs supervised by a given supervisor user.
 * Returns null if supervisorId is not provided.
 */
export async function getSupervisedAsesorIds(supervisorId: string | null): Promise<string[] | null> {
  if (!supervisorId) return null

  const supervisados = await prisma.crm_usuarios.findMany({
    where: { id_supervisor: supervisorId, activo: true },
    select: { id_asesor: true },
  })

  return supervisados
    .map((s) => s.id_asesor)
    .filter((id): id is string => id !== null)
}

/**
 * Returns the IDs of asesores to include in admin/supervisor dashboards.
 *
 * - If supervisorId is given: only asesores supervised by that user AND with disponibilidad = 'disponible'.
 * - If not (admin view): all asesores with disponibilidad = 'disponible'.
 *
 * Always returns an array (possibly empty). Use length === 0 as "no match → return empty response".
 * This excludes inactive asesores (renuncias, pruebas, etc.) de dashboards.
 */
export async function getActiveAsesorIds(supervisorId: string | null): Promise<string[]> {
  const supervisedIds = await getSupervisedAsesorIds(supervisorId)

  if (supervisedIds && supervisedIds.length === 0) {
    return []
  }

  const activos = await prisma.bd_asesores.findMany({
    where: {
      disponibilidad: 'disponible',
      ...(supervisedIds ? { id_asesor: { in: supervisedIds } } : {}),
    },
    select: { id_asesor: true },
  })

  return activos.map((a) => a.id_asesor)
}

// Codigos de asesores que no son parte del piloto (asesores de prueba).
// VELA NAVARRO MARGARITA (FC003133) fue una asesora de prueba, no estuvo
// activa cuando el piloto arranco, asi que no se lista en vistas orientadas
// al piloto (ej. reasignaciones).
const PILOT_EXCLUDED_CODES = ['FC003133']

/**
 * Returns the IDs of asesores del PILOTO — incluye activos e inactivos (ej. renuncias),
 * pero excluye asesores de prueba que nunca participaron realmente.
 *
 * Se usa en vistas que necesitan mostrar el historial de asesores del piloto aunque
 * esten inactivos (ej. reasignaciones — Reategui renuncio y perdio sus leads,
 * pero igual aparece en el reporte de "quitados").
 */
export async function getPilotAsesorIds(supervisorId: string | null): Promise<string[]> {
  const supervisedIds = await getSupervisedAsesorIds(supervisorId)

  if (supervisedIds && supervisedIds.length === 0) {
    return []
  }

  const pilot = await prisma.bd_asesores.findMany({
    where: {
      cod_asesor: { notIn: PILOT_EXCLUDED_CODES },
      ...(supervisedIds ? { id_asesor: { in: supervisedIds } } : {}),
    },
    select: { id_asesor: true },
  })

  return pilot.map((a) => a.id_asesor)
}
