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
