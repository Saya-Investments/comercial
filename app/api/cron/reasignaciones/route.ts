import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET || 'cron-secret-key'
const HORAS_LIMITE = 24

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const vercelCron = req.headers.get('x-vercel-cron-secret')
  const isAuthorized = authHeader === `Bearer ${CRON_SECRET}` || vercelCron === CRON_SECRET
  if (!isAuthorized) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const now = new Date()
  const limite = new Date(now.getTime() - HORAS_LIMITE * 60 * 60 * 1000)

  // 1. Buscar matchings asignados cuya fecha_asignacion supero las 24h
  const matchingsVencidos = await prisma.matching.findMany({
    where: {
      asignado: true,
      fecha_asignacion: { not: null, lt: limite },
    },
    include: {
      bd_leads: {
        select: { id_lead: true, ultimo_asesor_asignado: true },
      },
    },
  })

  let reasignados = 0
  let sinCapacidad = 0
  const errores: string[] = []

  for (const match of matchingsVencidos) {
    try {
      const leadId = match.id_lead
      const asesorActualId = match.id_asesor

      // 2. Verificar si el asesor ya gestiono el lead (tiene acciones comerciales desde la asignacion)
      const acciones = await prisma.crm_acciones_comerciales.findFirst({
        where: {
          id_lead: leadId,
          fecha_creacion: { gte: match.fecha_asignacion! },
        },
      })

      // Si ya tiene acciones, el asesor SI gestiono -> no reasignar
      if (acciones) continue

      // 3. Buscar la posicion actual del asesor en el ranking
      const posicionActual = await prisma.ranking_routing.findFirst({
        where: { id_lead: leadId, id_asesor: asesorActualId },
        select: { posicion: true },
      })

      if (!posicionActual) {
        errores.push(`Lead ${leadId}: asesor ${asesorActualId} no encontrado en ranking_routing`)
        continue
      }

      // 4. Buscar el siguiente asesor disponible en el ranking (posicion mayor, no asignado)
      const siguientes = await prisma.ranking_routing.findMany({
        where: {
          id_lead: leadId,
          posicion: { gt: posicionActual.posicion },
          asignado: false,
        },
        include: {
          bd_asesores: { select: { id_asesor: true, leads_en_cola: true, capacidad_maxima: true, disponibilidad: true } },
        },
        orderBy: { posicion: 'asc' },
      })

      // 5. Encontrar el primero con capacidad
      const siguiente = siguientes.find(
        (r) =>
          r.bd_asesores.disponibilidad === 'disponible' &&
          (r.bd_asesores.leads_en_cola ?? 0) < r.bd_asesores.capacidad_maxima
      )

      if (!siguiente) {
        sinCapacidad++
        errores.push(`Lead ${leadId}: no hay asesores disponibles en el ranking`)
        continue
      }

      const nuevoAsesorId = siguiente.id_asesor

      // 6. Ejecutar reasignacion en transaccion
      await prisma.$transaction([
        // Desasignar matching actual
        prisma.matching.update({
          where: { id_matching: match.id_matching },
          data: { asignado: false },
        }),

        // Buscar o crear matching para el nuevo asesor y asignarlo
        prisma.matching.updateMany({
          where: { id_lead: leadId, id_asesor: nuevoAsesorId },
          data: { asignado: true, fecha_asignacion: now },
        }),

        // Marcar posicion en ranking como asignada
        prisma.ranking_routing.update({
          where: { id: siguiente.id },
          data: { asignado: true },
        }),

        // Actualizar el lead con el nuevo asesor
        prisma.bd_leads.update({
          where: { id_lead: leadId },
          data: { ultimo_asesor_asignado: nuevoAsesorId },
        }),

        // Decrementar cola del asesor anterior
        prisma.bd_asesores.update({
          where: { id_asesor: asesorActualId },
          data: { leads_en_cola: { decrement: 1 } },
        }),

        // Incrementar cola del nuevo asesor
        prisma.bd_asesores.update({
          where: { id_asesor: nuevoAsesorId },
          data: { leads_en_cola: { increment: 1 } },
        }),

        // Registrar en historial de asignaciones
        prisma.hist_asignaciones.create({
          data: {
            id_lead: leadId,
            id_asesor: nuevoAsesorId,
            estado_gestion: 'en_espera',
            reasignado: true,
            id_asesor_anterior: asesorActualId,
            motivo_reasignacion: `Sin gestion en ${HORAS_LIMITE}h`,
          },
        }),
      ])

      reasignados++
    } catch (err) {
      errores.push(`Lead ${match.id_lead}: ${(err as Error).message}`)
    }
  }

  return NextResponse.json({
    ok: true,
    timestamp: now.toISOString(),
    matchingsRevisados: matchingsVencidos.length,
    reasignados,
    sinCapacidad,
    errores: errores.length > 0 ? errores : undefined,
  })
}
