import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { sendLeadAssignedNotification } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRM_URL = process.env.NEXT_PUBLIC_APP_URL || ''

type Mode = 'ranking' | 'manual'

// Niveles de cuota (Regla 1 — split en cuotas_semanales)
type Nivel = 'high' | 'medium' | 'low'
const NIVELES: Nivel[] = ['high', 'medium', 'low']

function clasificarNivel(score: number): Nivel {
  if (score >= 0.70) return 'high'
  if (score >= 0.40) return 'medium'
  return 'low'
}

interface Notificacion {
  email: string
  nombre: string
  lead: { nombre: string; producto: string; scoring: number; telefono: string }
}

type MatchingBase = {
  id_matching: string
  id_lead: string
  nivel_al_asignar: string | null
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const idAsesor: string | undefined = body.idAsesor
  const mode: Mode = body.mode
  const targetAsesorId: string | undefined = body.targetAsesorId
  const leadId: string | undefined = body.leadId

  if (!idAsesor) {
    return NextResponse.json({ error: 'idAsesor es requerido' }, { status: 400 })
  }
  if (mode !== 'ranking' && mode !== 'manual') {
    return NextResponse.json({ error: 'mode debe ser "ranking" o "manual"' }, { status: 400 })
  }
  if (mode === 'manual' && !targetAsesorId) {
    return NextResponse.json({ error: 'targetAsesorId es requerido para mode "manual"' }, { status: 400 })
  }
  if (mode === 'manual' && targetAsesorId === idAsesor) {
    return NextResponse.json({ error: 'No se puede reasignar al mismo asesor' }, { status: 400 })
  }

  const matchings = await prisma.matching.findMany({
    where: {
      id_asesor: idAsesor,
      asignado: true,
      ...(leadId ? { id_lead: leadId } : {}),
    },
    select: { id_matching: true, id_lead: true, nivel_al_asignar: true },
  })

  if (matchings.length === 0) {
    return NextResponse.json({
      ok: true,
      totalLeads: 0,
      reasignados: 0,
      errores: ['El asesor no tiene leads asignados'],
    })
  }

  if (mode === 'manual') {
    return reasignarManualBatch({
      idAsesor,
      targetAsesorId: targetAsesorId!,
      matchings,
    })
  }

  return reasignarPorRanking({ idAsesor, matchings })
}

// ============================================================================
// MANUAL — todos los leads van al mismo asesor destino.
// Estrategia: 1 prefetch en paralelo + 1 transacción con operaciones batch.
// ============================================================================
async function reasignarManualBatch({
  idAsesor,
  targetAsesorId,
  matchings,
}: {
  idAsesor: string
  targetAsesorId: string
  matchings: MatchingBase[]
}) {
  const leadIds = matchings.map((m) => m.id_lead)
  const matchingIds = matchings.map((m) => m.id_matching)

  // 1. Prefetch todo en paralelo (1 round-trip)
  const [leads, existingTargetMatchings, rankingTargets, targetUsuario] = await Promise.all([
    prisma.bd_leads.findMany({
      where: { id_lead: { in: leadIds } },
      select: {
        id_lead: true,
        scoring: true,
        nombre: true,
        apellido: true,
        producto: true,
        numero: true,
      },
    }),
    prisma.matching.findMany({
      where: { id_lead: { in: leadIds }, id_asesor: targetAsesorId },
      select: { id_matching: true, id_lead: true },
    }),
    prisma.ranking_routing.findMany({
      where: { id_lead: { in: leadIds }, id_asesor: targetAsesorId, asignado: false },
      select: { id: true },
    }),
    prisma.crm_usuarios.findFirst({
      where: { id_asesor: targetAsesorId, activo: true },
      select: { email: true, nombre: true },
    }),
  ])

  const leadMap = new Map(leads.map((l) => [l.id_lead, l]))
  const existingMatchingByLead = new Map(
    existingTargetMatchings.map((m) => [m.id_lead, m.id_matching])
  )

  // 2. Calcular niveles y agregaciones en memoria
  const decByNivel: Record<Nivel, number> = { high: 0, medium: 0, low: 0 }
  const incByNivel: Record<Nivel, number> = { high: 0, medium: 0, low: 0 }
  const existingUpdatesByNivel: Record<Nivel, string[]> = { high: [], medium: [], low: [] }
  const newCreates: Prisma.matchingCreateManyInput[] = []
  const now = new Date()

  for (const m of matchings) {
    const lead = leadMap.get(m.id_lead)
    const score = Number(lead?.scoring ?? 0)
    const nivelNuevo = clasificarNivel(score)
    const nivelAnterior = (m.nivel_al_asignar as Nivel | null) ?? nivelNuevo

    decByNivel[nivelAnterior]++
    incByNivel[nivelNuevo]++

    const existingId = existingMatchingByLead.get(m.id_lead)
    if (existingId) {
      existingUpdatesByNivel[nivelNuevo].push(existingId)
    } else {
      newCreates.push({
        id_lead: m.id_lead,
        id_asesor: targetAsesorId,
        asignado: true,
        fecha_asignacion: now,
        notificado_asesor: false,
        nivel_al_asignar: nivelNuevo,
      })
    }
  }

  const histRows: Prisma.hist_asignacionesCreateManyInput[] = matchings.map((m) => ({
    id_lead: m.id_lead,
    id_asesor: targetAsesorId,
    estado_gestion: 'en_espera',
    reasignado: true,
    id_asesor_anterior: idAsesor,
    motivo_reasignacion: 'Reasignación manual a asesor específico',
  }))

  const rankingIdsToMark = rankingTargets.map((r) => r.id)
  const total = matchings.length

  // 3. Una sola transacción con operaciones batch
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.matching.updateMany({
          where: { id_matching: { in: matchingIds } },
          data: { asignado: false },
        })

        await tx.bd_leads.updateMany({
          where: { id_lead: { in: leadIds } },
          data: { ultimo_asesor_asignado: targetAsesorId },
        })

        await tx.bd_asesores.update({
          where: { id_asesor: idAsesor },
          data: { leads_en_cola: { decrement: total } },
        })

        await tx.bd_asesores.update({
          where: { id_asesor: targetAsesorId },
          data: { leads_en_cola: { increment: total } },
        })

        // Regla 1 — actualizar cuotas_semanales: como mucho 6 statements (3 niveles × source/target)
        for (const nivel of NIVELES) {
          const dec = decByNivel[nivel]
          if (dec > 0) {
            const col = `recibidos_${nivel}`
            await tx.$executeRaw`
              UPDATE comercial.cuotas_semanales
              SET ${Prisma.raw(col)} = GREATEST(${Prisma.raw(col)} - ${dec}, 0)
              WHERE id_asesor = ${idAsesor}::uuid
                AND semana_inicio = date_trunc('week', CURRENT_DATE)::date
            `
          }
          const inc = incByNivel[nivel]
          if (inc > 0) {
            const col = `recibidos_${nivel}`
            await tx.$executeRaw`
              UPDATE comercial.cuotas_semanales
              SET ${Prisma.raw(col)} = ${Prisma.raw(col)} + ${inc}
              WHERE id_asesor = ${targetAsesorId}::uuid
                AND semana_inicio = date_trunc('week', CURRENT_DATE)::date
            `
          }
        }

        await tx.hist_asignaciones.createMany({ data: histRows })

        if (rankingIdsToMark.length > 0) {
          await tx.ranking_routing.updateMany({
            where: { id: { in: rankingIdsToMark } },
            data: { asignado: true },
          })
        }

        for (const nivel of NIVELES) {
          const ids = existingUpdatesByNivel[nivel]
          if (ids.length > 0) {
            await tx.matching.updateMany({
              where: { id_matching: { in: ids } },
              data: {
                asignado: true,
                fecha_asignacion: now,
                notificado_asesor: false,
                nivel_al_asignar: nivel,
              },
            })
          }
        }

        if (newCreates.length > 0) {
          await tx.matching.createMany({ data: newCreates })
        }
      },
      { timeout: 30000, maxWait: 10000 }
    )
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        totalLeads: total,
        reasignados: 0,
        errores: [(err as Error).message],
      },
      { status: 500 }
    )
  }

  // 4. Notificaciones en paralelo (no bloquean el éxito)
  if (targetUsuario?.email) {
    const notificaciones: Notificacion[] = matchings.map((m) => {
      const lead = leadMap.get(m.id_lead)
      return {
        email: targetUsuario.email!,
        nombre: targetUsuario.nombre,
        lead: {
          nombre: `${lead?.nombre || ''} ${lead?.apellido || ''}`.trim() || 'Lead',
          producto: lead?.producto || '',
          scoring: Math.round(Number(lead?.scoring || 0) * 100),
          telefono: lead?.numero || '',
        },
      }
    })

    await Promise.allSettled(
      notificaciones.map((n) =>
        sendLeadAssignedNotification({
          to: n.email,
          advisorName: n.nombre,
          leadName: n.lead.nombre,
          producto: n.lead.producto,
          scoring: n.lead.scoring,
          telefono: n.lead.telefono,
          esReasignacion: true,
          crmUrl: CRM_URL || undefined,
        })
      )
    )
  }

  return NextResponse.json({
    ok: true,
    totalLeads: total,
    reasignados: total,
  })
}

// ============================================================================
// RANKING — cada lead va al siguiente asesor disponible (puede variar).
// Estrategia: prefetch en paralelo + loop con transacción sin queries internas.
// ============================================================================
async function reasignarPorRanking({
  idAsesor,
  matchings,
}: {
  idAsesor: string
  matchings: MatchingBase[]
}) {
  const leadIds = matchings.map((m) => m.id_lead)

  // 1. Prefetch en paralelo
  const [leads, posicionesActuales, rankingsAll, usuariosActivos] = await Promise.all([
    prisma.bd_leads.findMany({
      where: { id_lead: { in: leadIds } },
      select: {
        id_lead: true,
        scoring: true,
        nombre: true,
        apellido: true,
        producto: true,
        numero: true,
      },
    }),
    prisma.ranking_routing.findMany({
      where: { id_lead: { in: leadIds }, id_asesor: idAsesor },
      select: { id_lead: true, posicion: true },
    }),
    prisma.ranking_routing.findMany({
      where: { id_lead: { in: leadIds } },
      select: {
        id: true,
        id_lead: true,
        id_asesor: true,
        posicion: true,
        asignado: true,
        bd_asesores: { select: { disponibilidad: true } },
      },
      orderBy: [{ id_lead: 'asc' }, { posicion: 'asc' }],
    }),
    prisma.crm_usuarios.findMany({
      where: { activo: true },
      select: { id_asesor: true, email: true, nombre: true },
    }),
  ])

  const leadMap = new Map(leads.map((l) => [l.id_lead, l]))
  const posicionMap = new Map(posicionesActuales.map((p) => [p.id_lead, p.posicion]))
  const usuarioByAsesor = new Map(
    usuariosActivos
      .filter((u) => u.id_asesor)
      .map((u) => [u.id_asesor as string, { email: u.email, nombre: u.nombre }])
  )

  // Agrupar rankings por lead
  const rankingsByLead = new Map<
    string,
    typeof rankingsAll
  >()
  for (const r of rankingsAll) {
    const arr = rankingsByLead.get(r.id_lead) ?? []
    arr.push(r)
    rankingsByLead.set(r.id_lead, arr)
  }

  // 2. Decidir destino por lead en memoria
  type Plan = {
    match: MatchingBase
    nuevoAsesorId: string
    rankingIdToMark: number | null
    nivelNuevo: Nivel
    nivelAnterior: Nivel
  }
  const planes: Plan[] = []
  const errores: string[] = []

  // Necesitamos saber qué matchings (id_lead, id_asesor=nuevo) ya existen para no duplicar.
  // Lo resolvemos con un segundo prefetch después de decidir destinos.
  for (const m of matchings) {
    const posActual = posicionMap.get(m.id_lead)
    if (posActual === undefined) {
      errores.push(`Lead ${m.id_lead}: asesor no encontrado en ranking_routing`)
      continue
    }

    const rankings = rankingsByLead.get(m.id_lead) ?? []
    const siguiente = rankings.find(
      (r) =>
        r.posicion > posActual &&
        r.asignado === false &&
        r.bd_asesores?.disponibilidad === 'disponible'
    )

    if (!siguiente) {
      errores.push(`Lead ${m.id_lead}: no hay siguiente asesor disponible en ranking`)
      continue
    }

    const lead = leadMap.get(m.id_lead)
    const score = Number(lead?.scoring ?? 0)
    const nivelNuevo = clasificarNivel(score)
    const nivelAnterior = (m.nivel_al_asignar as Nivel | null) ?? nivelNuevo

    planes.push({
      match: m,
      nuevoAsesorId: siguiente.id_asesor,
      rankingIdToMark: siguiente.id,
      nivelNuevo,
      nivelAnterior,
    })
  }

  // 3. Prefetch matchings ya existentes para los pares (lead, nuevoAsesor) decididos
  const pairsKey = (l: string, a: string) => `${l}::${a}`
  const targetAsesorIds = Array.from(new Set(planes.map((p) => p.nuevoAsesorId)))
  const existingMatchings =
    targetAsesorIds.length > 0
      ? await prisma.matching.findMany({
          where: {
            id_lead: { in: planes.map((p) => p.match.id_lead) },
            id_asesor: { in: targetAsesorIds },
          },
          select: { id_matching: true, id_lead: true, id_asesor: true },
        })
      : []
  const existingMatchingMap = new Map(
    existingMatchings.map((m) => [pairsKey(m.id_lead, m.id_asesor), m.id_matching])
  )

  // 4. Ejecutar cada plan en su propia transacción (sin queries internas)
  const now = new Date()
  let reasignados = 0
  const notificaciones: Notificacion[] = []

  for (const plan of planes) {
    const { match, nuevoAsesorId, rankingIdToMark, nivelNuevo, nivelAnterior } = plan
    const colRecib = `recibidos_${nivelNuevo}`
    const colRecibAnterior = `recibidos_${nivelAnterior}`
    const existingTargetMatchingId = existingMatchingMap.get(pairsKey(match.id_lead, nuevoAsesorId))

    try {
      await prisma.$transaction(
        async (tx) => {
          await tx.matching.update({
            where: { id_matching: match.id_matching },
            data: { asignado: false },
          })

          await tx.bd_leads.update({
            where: { id_lead: match.id_lead },
            data: { ultimo_asesor_asignado: nuevoAsesorId },
          })

          await tx.bd_asesores.update({
            where: { id_asesor: idAsesor },
            data: { leads_en_cola: { decrement: 1 } },
          })

          await tx.bd_asesores.update({
            where: { id_asesor: nuevoAsesorId },
            data: { leads_en_cola: { increment: 1 } },
          })

          await tx.$executeRaw`
            UPDATE comercial.cuotas_semanales
            SET ${Prisma.raw(colRecibAnterior)} = GREATEST(${Prisma.raw(colRecibAnterior)} - 1, 0)
            WHERE id_asesor = ${idAsesor}::uuid
              AND semana_inicio = date_trunc('week', CURRENT_DATE)::date
          `

          await tx.$executeRaw`
            UPDATE comercial.cuotas_semanales
            SET ${Prisma.raw(colRecib)} = ${Prisma.raw(colRecib)} + 1
            WHERE id_asesor = ${nuevoAsesorId}::uuid
              AND semana_inicio = date_trunc('week', CURRENT_DATE)::date
          `

          await tx.hist_asignaciones.create({
            data: {
              id_lead: match.id_lead,
              id_asesor: nuevoAsesorId,
              estado_gestion: 'en_espera',
              reasignado: true,
              id_asesor_anterior: idAsesor,
              motivo_reasignacion: 'Reasignación manual por ranking',
            },
          })

          if (rankingIdToMark !== null) {
            await tx.ranking_routing.update({
              where: { id: rankingIdToMark },
              data: { asignado: true },
            })
          }

          if (existingTargetMatchingId) {
            await tx.matching.update({
              where: { id_matching: existingTargetMatchingId },
              data: {
                asignado: true,
                fecha_asignacion: now,
                notificado_asesor: false,
                nivel_al_asignar: nivelNuevo,
              },
            })
          } else {
            await tx.matching.create({
              data: {
                id_lead: match.id_lead,
                id_asesor: nuevoAsesorId,
                asignado: true,
                fecha_asignacion: now,
                notificado_asesor: false,
                nivel_al_asignar: nivelNuevo,
              },
            })
          }
        },
        { timeout: 15000 }
      )

      reasignados++

      const usuario = usuarioByAsesor.get(nuevoAsesorId)
      if (usuario?.email) {
        const lead = leadMap.get(match.id_lead)
        notificaciones.push({
          email: usuario.email,
          nombre: usuario.nombre,
          lead: {
            nombre: `${lead?.nombre || ''} ${lead?.apellido || ''}`.trim() || 'Lead',
            producto: lead?.producto || '',
            scoring: Math.round(Number(lead?.scoring || 0) * 100),
            telefono: lead?.numero || '',
          },
        })
      }
    } catch (err) {
      errores.push(`Lead ${match.id_lead}: ${(err as Error).message}`)
    }
  }

  await Promise.allSettled(
    notificaciones.map((n) =>
      sendLeadAssignedNotification({
        to: n.email,
        advisorName: n.nombre,
        leadName: n.lead.nombre,
        producto: n.lead.producto,
        scoring: n.lead.scoring,
        telefono: n.lead.telefono,
        esReasignacion: true,
        crmUrl: CRM_URL || undefined,
      })
    )
  )

  return NextResponse.json({
    ok: true,
    totalLeads: matchings.length,
    reasignados,
    errores: errores.length > 0 ? errores : undefined,
  })
}
