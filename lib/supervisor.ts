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
