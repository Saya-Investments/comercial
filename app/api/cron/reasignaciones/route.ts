import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { sendLeadAssignedNotification } from '@/lib/email'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET
const HORAS_LIMITE = 24
const CRM_URL = process.env.NEXT_PUBLIC_APP_URL || ''

// Niveles de cuota (split de Regla 1 en cuotas_semanales)
type Nivel = 'high' | 'medium' | 'low'

// Umbrales de score para clasificar nivel del lead.
// Coinciden con los del routing (config_modelo: score_umbral_alto / medio).
// Si en el futuro los umbrales se mueven a config_modelo del CRM, leerlos desde ahi.
function clasificarNivel(score: number): Nivel {
  if (score >= 0.70) return 'high'
  if (score >= 0.40) return 'medium'
  return 'low'
}

export async function GET(req: NextRequest) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
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
        select: { id_lead: true, ultimo_asesor_asignado: true, scoring: true },
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
          bd_asesores: { select: { id_asesor: true, leads_en_cola: true, disponibilidad: true } },
        },
        orderBy: { posicion: 'asc' },
      })

      // 5. Determinar niveles para la dec/inc de cuotas (Regla 1).
      //    nivelAnterior: el nivel con el que se incrementó el contador del asesor original.
      //                   Se lee de matching.nivel_al_asignar (persistido al momento de la asignacion).
      //                   Fallback al score actual si la columna esta NULL (matching antiguo previo a la migracion).
      //    nivelNuevo: el nivel del lead AHORA, usado tanto para filtrar candidatos
      //                como para incrementar el contador del nuevo asesor.
      const scoreLeadActual = Number(match.bd_leads?.scoring ?? 0)
      const nivelNuevo = clasificarNivel(scoreLeadActual)
      const nivelAnterior: Nivel =
        (match.nivel_al_asignar as Nivel | null) ?? nivelNuevo

      // El filtro de candidatos por cuota usa el nivel ACTUAL del lead (asi se respeta
      // la cuota del nivel real al que va el lead reasignado).
      const colCuota = `cuota_${nivelNuevo}`
      const colRecib = `recibidos_${nivelNuevo}`
      const colRecibAnterior = `recibidos_${nivelAnterior}`

      // 6. Enriquecer cada candidato con su progreso de cuota del nivel del lead.
      //    Se filtra disponibilidad aqui mismo para no leer cuotas de no disponibles.
      const enriquecidos: Array<{
        ranking: typeof siguientes[number]
        cuota: number | null
        recibidos: number
        progreso: number
      }> = []

      for (const sig of siguientes) {
        if (sig.bd_asesores.disponibilidad !== 'disponible') continue

        const cuotaRows = await prisma.$queryRaw<Array<{ cuota: number; recibidos: number }>>`
          SELECT ${Prisma.raw(colCuota)}::int AS cuota,
                 ${Prisma.raw(colRecib)}::int AS recibidos
          FROM comercial.cuotas_semanales
          WHERE id_asesor = ${sig.id_asesor}::uuid
            AND semana_inicio = date_trunc('week', CURRENT_DATE)::date
          LIMIT 1
        `

        if (cuotaRows.length === 0) {
          // Sin fila de cuota para esta semana → tratar como cuota no definida (deja pasar con progreso 0)
          enriquecidos.push({ ranking: sig, cuota: null, recibidos: 0, progreso: 0 })
          continue
        }

        const cuota = Number(cuotaRows[0].cuota)
        const recibidos = Number(cuotaRows[0].recibidos)
        const progreso = cuota > 0 ? recibidos / cuota : 1.0
        enriquecidos.push({ ranking: sig, cuota, recibidos, progreso })
      }

      // 7. Regla 1: preferir candidatos con cuota disponible del nivel del lead.
      //    El orden viene ya por posicion ASC del ranking, asi que tomamos el primero con cupo.
      let elegido = enriquecidos.find((e) => e.progreso < 1.0)

      if (!elegido) {
        // Fallback: todos los del ranking ya cumplieron cuota del nivel.
        // Tomar el primero disponible del ranking sin filtro de cuota.
        elegido = enriquecidos[0]
      }

      if (!elegido) {
        sinCapacidad++
        errores.push(`Lead ${leadId}: no hay asesores disponibles en el ranking`)
        continue
      }

      const siguiente = elegido.ranking
      const nuevoAsesorId = siguiente.id_asesor

      // 8. Ejecutar reasignacion en transaccion (callback form para usar $executeRaw)
      await prisma.$transaction(async (tx) => {
        // Desasignar matching actual
        await tx.matching.update({
          where: { id_matching: match.id_matching },
          data: { asignado: false },
        })

        // Buscar o crear matching para el nuevo asesor y asignarlo
        // Tambien se persiste el nivel actual en nivel_al_asignar para que futuras
        // reasignaciones puedan decrementar el nivel correcto.
        await tx.matching.updateMany({
          where: { id_lead: leadId, id_asesor: nuevoAsesorId },
          data: { asignado: true, fecha_asignacion: now, nivel_al_asignar: nivelNuevo },
        })

        // Marcar posicion en ranking como asignada
        await tx.ranking_routing.update({
          where: { id: siguiente.id },
          data: { asignado: true },
        })

        // Actualizar el lead con el nuevo asesor
        await tx.bd_leads.update({
          where: { id_lead: leadId },
          data: { ultimo_asesor_asignado: nuevoAsesorId },
        })

        // Decrementar cola del asesor anterior
        await tx.bd_asesores.update({
          where: { id_asesor: asesorActualId },
          data: { leads_en_cola: { decrement: 1 } },
        })

        // Incrementar cola del nuevo asesor
        await tx.bd_asesores.update({
          where: { id_asesor: nuevoAsesorId },
          data: { leads_en_cola: { increment: 1 } },
        })

        // Regla 1 — Decrementar recibidos_<nivelAnterior> del asesor anterior.
        // nivelAnterior viene de matching.nivel_al_asignar (el nivel persistido al momento
        // de su asignacion original), garantizando que decrementamos el mismo contador
        // que se incremento.
        await tx.$executeRaw`
          UPDATE comercial.cuotas_semanales
          SET ${Prisma.raw(colRecibAnterior)} = GREATEST(${Prisma.raw(colRecibAnterior)} - 1, 0)
          WHERE id_asesor = ${asesorActualId}::uuid
            AND semana_inicio = date_trunc('week', CURRENT_DATE)::date
        `

        // Regla 1 — Incrementar recibidos_<nivelNuevo> del nuevo asesor.
        // nivelNuevo es el nivel del lead AHORA (al momento de la reasignacion).
        await tx.$executeRaw`
          UPDATE comercial.cuotas_semanales
          SET ${Prisma.raw(colRecib)} = ${Prisma.raw(colRecib)} + 1
          WHERE id_asesor = ${nuevoAsesorId}::uuid
            AND semana_inicio = date_trunc('week', CURRENT_DATE)::date
        `

        // Registrar en historial de asignaciones
        await tx.hist_asignaciones.create({
          data: {
            id_lead: leadId,
            id_asesor: nuevoAsesorId,
            estado_gestion: 'en_espera',
            reasignado: true,
            id_asesor_anterior: asesorActualId,
            motivo_reasignacion: `Sin gestion en ${HORAS_LIMITE}h`,
          },
        })
      })

      reasignados++

      // Notificar al nuevo asesor por email
      try {
        const usuario = await prisma.crm_usuarios.findFirst({
          where: { id_asesor: nuevoAsesorId, activo: true },
          select: { email: true, nombre: true },
        })

        if (usuario?.email) {
          const lead = await prisma.bd_leads.findUnique({
            where: { id_lead: leadId },
            select: { nombre: true, apellido: true, producto: true, scoring: true, numero: true },
          })

          const leadName = `${lead?.nombre || ''} ${lead?.apellido || ''}`.trim() || 'Lead'

          await sendLeadAssignedNotification({
            to: usuario.email,
            advisorName: usuario.nombre,
            leadName,
            producto: lead?.producto || '',
            scoring: Math.round(Number(lead?.scoring || 0) * 100),
            telefono: lead?.numero || '',
            esReasignacion: true,
            crmUrl: CRM_URL || undefined,
          })
        }
      } catch (emailErr) {
        errores.push(`Lead ${leadId}: email no enviado - ${(emailErr as Error).message}`)
      }
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
