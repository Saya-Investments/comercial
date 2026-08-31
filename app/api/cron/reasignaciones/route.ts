import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET
// Cuanto tiempo tiene el asesor antes de que se le quite el lead.
// Estaba en 24h, por debajo del ritmo real del equipo: la mediana hasta la
// primera gestion es de 22 horas, o sea justo pegada al limite. Medido sobre
// 535 leads gestionados, el corte a 24h dejaba fuera al 48% de los que SI se
// iban a trabajar; a 48h solo al 29%. Reasignar antes de que el asesor
// llegue no rescata nada: reinicia el contacto con otro que empieza de cero,
// y era la causa del rebote (leads pasando por 3 asesores) y del volumen
// (148 reasignaciones en un dia).
const HORAS_LIMITE = 48
const MAX_POR_CORRIDA = 25
// Un lead sin ningun toque hace mas de esto ya no es material de
// enrutamiento: va a campana de reactivacion.
const DIAS_FRESCURA = 60

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

  // 1. Buscar matchings asignados cuya fecha_asignacion supero las 24h.
  // Se excluyen leads que estan actualmente en el Call Center: mientras el
  // CC los trabaja, el timer del asesor backup no debe correr (el cron de
  // derivacion-cc se encarga de liberar al asesor si el CC se pasa de 2h).
  // El descarte de los ya gestionados va en ESTA consulta, no dentro del loop.
  // Si se deja para el loop, el tope por corrida se consume con matchings
  // viejos que el asesor ya trabajo: se descartan uno por uno y el cron nunca
  // alcanza a los reasignables. Pasaba exactamente eso — los 25 mas viejos
  // estaban gestionados los 25, asi que cada corrida cerraba con
  // reasignados=0 y el backlog quedaba intacto.
  //
  // Va en SQL crudo porque la condicion compara dos columnas
  // (acciones.fecha_creacion >= matching.fecha_asignacion), y eso el filtro
  // relacional de Prisma no lo expresa: obligaria a usar un umbral fijo, que
  // dejaria pasar leads con gestion vieja y volveria a gastar el cupo.
  //
  // El tope existe porque cada lead implica una transaccion y un email al
  // asesor: sin el, una acumulacion (p.ej. tras destrabar leads atascados) se
  // vaciaria de golpe, inundando de notificaciones y arriesgando timeout.
  // Con 25 cada 10 min se drenan 150/hora, de sobra para el ritmo normal.
  const idsPendientes = await prisma.$queryRaw<Array<{ id_matching: string; asesor_inactivo: boolean }>>`
    SELECT m.id_matching,
           (asr.disponibilidad IS DISTINCT FROM 'disponible') AS asesor_inactivo
    FROM comercial.matching m
    JOIN comercial.bd_leads l ON l.id_lead = m.id_lead
    JOIN comercial.bd_asesores asr ON asr.id_asesor = m.id_asesor
    WHERE m.asignado = true
      -- El asesor DEMO es ficticio (se usa para probar el CRM y el piloto de
      -- llamadas). Sus leads no deben entrar nunca al enrutamiento real.
      AND asr.nombre_asesor NOT ILIKE 'DEMO%'
      AND m.fecha_asignacion IS NOT NULL
      AND m.fecha_asignacion < ${limite}
      AND l.asignado_call_center IS NULL
      AND (
        -- Asesor que ya no esta en el piloto: se reasigna SIEMPRE, haya sido
        -- gestionado o no. La regla de las 24h solo cubre al lead que nadie
        -- toco; un lead trabajado una vez y huerfano despues quedaba con su
        -- ex-asesor para siempre. Medido: 182 leads en ese limbo (93 de uno
        -- que salio en junio, 89 de otra que salio en mayo, sin que nadie
        -- los mirara en ~4 meses).
        (asr.disponibilidad IS DISTINCT FROM 'disponible'
         -- ...pero solo si el lead sigue tibio. Un lead helado hace meses no
         -- se recupera volcandoselo a un asesor como si fuera nuevo: ese es
         -- material de campana de reactivacion, no de enrutamiento. Sin este
         -- corte, la regla habria repartido 184 leads con 109-132 dias sin
         -- que nadie los tocara.
         AND COALESCE(
               (SELECT MAX(ac2.fecha_creacion) FROM comercial.crm_acciones_comerciales ac2
                WHERE ac2.id_lead = m.id_lead),
               m.fecha_asignacion
             ) > now() - (${DIAS_FRESCURA} * INTERVAL '1 day'))
        OR NOT EXISTS (
          SELECT 1 FROM comercial.crm_acciones_comerciales ac
          WHERE ac.id_lead = m.id_lead
            AND ac.fecha_creacion >= m.fecha_asignacion
        )
      )
      -- Tiene que existir a donde moverlo. Un lead que ya paso por todos los
      -- asesores disponibles no se puede reasignar, pero al no moverse su
      -- fecha_asignacion queda vieja y se amontona al frente de la cola:
      -- consumia los 25 cupos de cada corrida y los que SI se podian mover
      -- nunca se procesaban. Medido: 35 inamovibles tapando a 53 movibles,
      -- con el cron devolviendo sinCapacidad=25 y reasignados=0.
      AND EXISTS (
        SELECT 1 FROM comercial.ranking_routing r
        JOIN comercial.bd_asesores ra ON ra.id_asesor = r.id_asesor
        WHERE r.id_lead = m.id_lead
          AND r.id_asesor <> m.id_asesor
          AND r.asignado = false
          AND ra.disponibilidad = 'disponible'
      )
    ORDER BY m.fecha_asignacion ASC
    LIMIT ${MAX_POR_CORRIDA}
  `

  // Que matchings vienen por la via "asesor inactivo": el loop no debe
  // descartarlos por tener gestion previa.
  const porAsesorInactivo = new Set(
    idsPendientes.filter((r) => r.asesor_inactivo).map((r) => r.id_matching)
  )

  const matchingsVencidos = idsPendientes.length === 0 ? [] : await prisma.matching.findMany({
    where: { id_matching: { in: idsPendientes.map((r) => r.id_matching) } },
    include: {
      bd_leads: {
        select: { id_lead: true, ultimo_asesor_asignado: true, scoring: true },
      },
    },
    orderBy: { fecha_asignacion: 'asc' },
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

      // Si ya tiene acciones, el asesor SI gestiono -> no reasignar.
      // Salvo que el asesor ya no este en el piloto: ahi la gestion previa es
      // irrelevante, porque no va a haber una siguiente.
      if (acciones && !porAsesorInactivo.has(match.id_matching)) continue

      // 3. Candidatos: CUALQUIER asesor del ranking que todavia no haya tenido
      //    este lead. `asignado: false` es lo que evita el ping-pong (no vuelve
      //    a alguien que ya lo dejo caer); quien decide es el balance de cuota
      //    de mas abajo, no la posicion.
      //
      //    ANTES se exigia `posicion > posicionActual`, y eso causaba dos bugs:
      //
      //    a) TRINQUETE — un lead reasignado solo podia bajar en el ranking,
      //       nunca subir. Como cada posicion usada queda marcada, los leads
      //       abandonados descendian sin retorno hasta el ULTIMO del ranking y
      //       ahi se quedaban (no hay "siguiente"). Medido: un asesor recibio
      //       253 reasignaciones y solo perdio 5 — un pozo. Eso le llenaba la
      //       cuota semanal y el routing dejaba de mandarle leads NUEVOS
      //       (0 durante dos semanas seguidas), asi que solo trabajaba sobras.
      //       Que un lead lleve 24h sin gestion no lo hace peor lead: no hay
      //       razon para mandarlo al peor asesor.
      //
      //    b) Si el asesor actual no figuraba en ranking_routing, `posicionActual`
      //       venia null y se hacia `continue`: sus leads abandonados NUNCA se
      //       reasignaban. Le pasaba a un asesor que entro despues de calcularse
      //       el modelo (0 leads reasignados fuera de el en 30 dias).
      const siguientes = await prisma.ranking_routing.findMany({
        where: {
          id_lead: leadId,
          id_asesor: { not: asesorActualId },
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

      // 7. Regla 1: priorizar BALANCE de cuota sobre orden del ranking.
      //    Igual que el routing inicial (comercial_routing/app.py): ordenamos
      //    candidatos por progreso ASC y desempatamos por posicion ASC del
      //    ranking. Asi un asesor con menor carga de cuota gana sobre uno con
      //    mejor score que ya viene cargado.
      //    Sin esto, las reasignaciones caen siempre al primero del ranking
      //    con cupo, generando desbalance (ej: todos los leads reasignados
      //    terminan en el mismo asesor mientras otros estan en 0%).
      const conCupo = enriquecidos
        .filter((e) => e.progreso < 1.0)
        .sort((a, b) => {
          if (a.progreso !== b.progreso) return a.progreso - b.progreso
          return a.ranking.posicion - b.ranking.posicion
        })

      let elegido = conCupo[0]

      if (!elegido) {
        // Fallback: todos los del ranking ya cumplieron cuota del nivel.
        // Tomar el primero disponible del ranking sin filtro de cuota
        // (orden original por posicion ASC).
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

        // Buscar o crear matching para el nuevo asesor y asignarlo.
        // Se persiste el nivel actual en nivel_al_asignar para que futuras
        // reasignaciones puedan decrementar el nivel correcto.
        const existingMatching = await tx.matching.findFirst({
          where: { id_lead: leadId, id_asesor: nuevoAsesorId },
        })
        // notificado_asesor=false asegura que el cron notificar-asignacion
        // emita el email al nuevo asesor en su proximo tick. Es el unico
        // responsable de notificar al asesor (responsabilidad unica).
        if (existingMatching) {
          await tx.matching.update({
            where: { id_matching: existingMatching.id_matching },
            data: {
              asignado: true,
              fecha_asignacion: now,
              nivel_al_asignar: nivelNuevo,
              notificado_asesor: false,
            },
          })
        } else {
          await tx.matching.create({
            data: {
              id_lead: leadId,
              id_asesor: nuevoAsesorId,
              asignado: true,
              fecha_asignacion: now,
              nivel_al_asignar: nivelNuevo,
              notificado_asesor: false,
              score_c: siguiente.score_c,
              score_v: siguiente.score_v,
              score_p: siguiente.score_p,
              score_total: siguiente.score_total,
            },
          })
        }

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
      }, { timeout: 30000, maxWait: 10000 })

      reasignados++

      // Email al nuevo asesor lo envia el cron notificar-asignacion en su
      // proximo tick (captura el matching con notificado_asesor=false).
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
