import { prisma } from '@/lib/prisma'

// Rango fijo del piloto: desde 14-abr-2026.
export const RANGO_DESDE = '2026-04-14T00:00:00-05:00'

const LIMA_OFFSET_MS = 5 * 3600 * 1000

export type ProspectMatch = {
  id_lead: string
  dni: string | null
  numero: string | null
  nombre: string | null
  apellido: string | null
  base: string | null
  fecha_creacion: string
  fecha_registro_prosp: string | null
  fecha_inscrito: string | null
  asesor: string | null
  call_center: string | null
  origen_gestion: 'asesor' | 'call_center'
  responsable_gestion: string | null
  vendedor_nsv: string | null
  estado: string
  mes: string
  mes_cierre: string | null
  // Reactivacion por bot: ultima accion Mensaje_WSP con [REACTIVACION] en obs.
  bot_intervino: boolean
  bot_intervino_fecha: string | null
  bot_razon: string | null
}

export function leadMonthLima(d: Date): string {
  const lima = new Date(d.getTime() - LIMA_OFFSET_MS)
  const y = lima.getUTCFullYear()
  const m = String(lima.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

// Un solo JOIN en SQL: más rápido que traer todo a memoria y cruzar en JS.
// Lógica idéntica a la anterior:
//   - prospecto.fecha_registro > lead.fecha_creacion
//   - match por teléfono normalizado (últimos 9 dígitos)
//   - si hay varios prospectos para el mismo lead, se elige el más reciente
type RawMatch = {
  id_lead: string
  numero: string | null
  dni: string | null
  nombre: string | null
  apellido: string | null
  base: string | null
  fecha_creacion: Date
  asesor: string | null
  call_center: string | null
  asignado_call_center: string | null
  via_call_center: boolean | null
  vendedor_nsv: string | null
  estado: string
  fecha_registro_prosp: Date | null
  fecha_inscrito: Date | null
  bot_intervino_fecha: Date | null
  bot_observaciones: string | null
}

export async function crossProspectsWithLeads(options?: {
  idAsesor?: string
}): Promise<{
  matches: ProspectMatch[]
  totalLeadsCrm: number
  mesesDisponibles: string[]
  mesesCierre: string[]
}> {
  const idAsesor = options?.idAsesor ?? null

  const [rawMatches, totalRow] = await Promise.all([
    // Cruce: LATERAL JOIN toma el prospecto más reciente posterior a la creación del lead
    idAsesor
      ? prisma.$queryRaw<RawMatch[]>`
          SELECT
            l.id_lead::text,
            l.numero,
            l.dni,
            l.nombre,
            l.apellido,
            l."Base"               AS base,
            l.fecha_creacion,
            a.nombre_asesor        AS asesor,
            COALESCE(cc_actual.nombre, cc_hist.nombre, cc_accion.nombre) AS call_center,
            l.asignado_call_center::text AS asignado_call_center,
            EXISTS (
              SELECT 1
              FROM comercial.hist_asignaciones ha
              WHERE ha.id_lead = l.id_lead
                AND ha.via_call_center = true
            ) AS via_call_center,
            p.estado_documento     AS estado,
            p.fecha_registro       AS fecha_registro_prosp,
            p.fecha_inscrito       AS fecha_inscrito,
            p.vendedor             AS vendedor_nsv,
            b.fecha_creacion       AS bot_intervino_fecha,
            b.observaciones        AS bot_observaciones
          FROM comercial.bd_leads l
          LEFT JOIN comercial.bd_asesores a
            ON a.id_asesor = l.ultimo_asesor_asignado
          LEFT JOIN comercial.bd_call_center cc_actual
            ON cc_actual.id_call_center = l.asignado_call_center
          LEFT JOIN LATERAL (
            SELECT cc.nombre
            FROM comercial.hist_cc_derivaciones hcc
            JOIN comercial.bd_call_center cc
              ON cc.id_call_center = hcc.id_call_center
            WHERE hcc.id_lead = l.id_lead
            ORDER BY hcc.fecha_asignacion_cc DESC
            LIMIT 1
          ) cc_hist ON true
          LEFT JOIN LATERAL (
            SELECT cc.nombre
            FROM comercial.crm_acciones_comerciales ac
            JOIN comercial.crm_usuarios u
              ON u.id_usuario = ac.id_usuario
            JOIN comercial.bd_call_center cc
              ON cc.id_call_center = u.id_call_center
            WHERE ac.id_lead = l.id_lead
              AND u.id_call_center IS NOT NULL
            ORDER BY ac.fecha_creacion DESC
            LIMIT 1
          ) cc_accion ON true
          JOIN LATERAL (
            SELECT np.estado_documento, np.fecha_registro, np.fecha_inscrito, np.vendedor
            FROM comercial.nsv_prospectos np
            WHERE np.telefono_norm = RIGHT(
                    REGEXP_REPLACE(COALESCE(l.numero, ''), '[^0-9]', '', 'g'), 9)
              AND np.fecha_registro > l.fecha_creacion
            ORDER BY np.fecha_registro DESC
            LIMIT 1
          ) p ON true
          LEFT JOIN LATERAL (
            SELECT ac.fecha_creacion, ac.observaciones
            FROM comercial.crm_acciones_comerciales ac
            WHERE ac.id_lead = l.id_lead
              AND ac.tipo_accion = 'Mensaje_WSP'
              AND ac.observaciones LIKE '[REACTIVACION]%'
            ORDER BY ac.fecha_creacion DESC
            LIMIT 1
          ) b ON true
          WHERE l.fecha_creacion >= ${RANGO_DESDE}::timestamptz
            AND l.fecha_creacion <= NOW()
            AND l.ultimo_asesor_asignado = ${idAsesor}::uuid
        `
      : prisma.$queryRaw<RawMatch[]>`
          SELECT
            l.id_lead::text,
            l.numero,
            l.dni,
            l.nombre,
            l.apellido,
            l."Base"               AS base,
            l.fecha_creacion,
            a.nombre_asesor        AS asesor,
            COALESCE(cc_actual.nombre, cc_hist.nombre, cc_accion.nombre) AS call_center,
            l.asignado_call_center::text AS asignado_call_center,
            EXISTS (
              SELECT 1
              FROM comercial.hist_asignaciones ha
              WHERE ha.id_lead = l.id_lead
                AND ha.via_call_center = true
            ) AS via_call_center,
            p.estado_documento     AS estado,
            p.fecha_registro       AS fecha_registro_prosp,
            p.fecha_inscrito       AS fecha_inscrito,
            p.vendedor             AS vendedor_nsv,
            b.fecha_creacion       AS bot_intervino_fecha,
            b.observaciones        AS bot_observaciones
          FROM comercial.bd_leads l
          LEFT JOIN comercial.bd_asesores a
            ON a.id_asesor = l.ultimo_asesor_asignado
          LEFT JOIN comercial.bd_call_center cc_actual
            ON cc_actual.id_call_center = l.asignado_call_center
          LEFT JOIN LATERAL (
            SELECT cc.nombre
            FROM comercial.hist_cc_derivaciones hcc
            JOIN comercial.bd_call_center cc
              ON cc.id_call_center = hcc.id_call_center
            WHERE hcc.id_lead = l.id_lead
            ORDER BY hcc.fecha_asignacion_cc DESC
            LIMIT 1
          ) cc_hist ON true
          LEFT JOIN LATERAL (
            SELECT cc.nombre
            FROM comercial.crm_acciones_comerciales ac
            JOIN comercial.crm_usuarios u
              ON u.id_usuario = ac.id_usuario
            JOIN comercial.bd_call_center cc
              ON cc.id_call_center = u.id_call_center
            WHERE ac.id_lead = l.id_lead
              AND u.id_call_center IS NOT NULL
            ORDER BY ac.fecha_creacion DESC
            LIMIT 1
          ) cc_accion ON true
          JOIN LATERAL (
            SELECT np.estado_documento, np.fecha_registro, np.fecha_inscrito, np.vendedor
            FROM comercial.nsv_prospectos np
            WHERE np.telefono_norm = RIGHT(
                    REGEXP_REPLACE(COALESCE(l.numero, ''), '[^0-9]', '', 'g'), 9)
              AND np.fecha_registro > l.fecha_creacion
            ORDER BY np.fecha_registro DESC
            LIMIT 1
          ) p ON true
          LEFT JOIN LATERAL (
            SELECT ac.fecha_creacion, ac.observaciones
            FROM comercial.crm_acciones_comerciales ac
            WHERE ac.id_lead = l.id_lead
              AND ac.tipo_accion = 'Mensaje_WSP'
              AND ac.observaciones LIKE '[REACTIVACION]%'
            ORDER BY ac.fecha_creacion DESC
            LIMIT 1
          ) b ON true
          WHERE l.fecha_creacion >= ${RANGO_DESDE}::timestamptz
            AND l.fecha_creacion <= NOW()
        `,

    // Total de leads CRM en el rango (para el denominador del front)
    idAsesor
      ? prisma.$queryRaw<[{ total: bigint }]>`
          SELECT COUNT(*)::bigint AS total
          FROM comercial.bd_leads l
          WHERE l.fecha_creacion >= ${RANGO_DESDE}::timestamptz
            AND l.fecha_creacion <= NOW()
            AND l.ultimo_asesor_asignado = ${idAsesor}::uuid
        `
      : prisma.$queryRaw<[{ total: bigint }]>`
          SELECT COUNT(*)::bigint AS total
          FROM comercial.bd_leads l
          WHERE l.fecha_creacion >= ${RANGO_DESDE}::timestamptz
            AND l.fecha_creacion <= NOW()
        `,
  ])

  const totalLeadsCrm = Number(totalRow[0].total)

  const matches: ProspectMatch[] = rawMatches.map((r) => {
    // Extraer la razon del observaciones: viene como "[REACTIVACION] <razon real>"
    let bot_razon: string | null = null
    if (r.bot_observaciones) {
      const cleaned = r.bot_observaciones.replace(/^\s*\[REACTIVACION\]\s*/i, '').trim()
      bot_razon = cleaned || null
    }
    const origen_gestion = r.asignado_call_center || r.via_call_center ? 'call_center' : 'asesor'
    const responsable_gestion = origen_gestion === 'call_center' ? r.call_center : r.asesor

    return {
      id_lead: r.id_lead,
      dni: r.dni,
      numero: r.numero,
      nombre: r.nombre,
      apellido: r.apellido,
      base: r.base,
      fecha_creacion: r.fecha_creacion.toISOString(),
      fecha_registro_prosp: r.fecha_registro_prosp ? r.fecha_registro_prosp.toISOString() : null,
      fecha_inscrito: r.fecha_inscrito ? r.fecha_inscrito.toISOString() : null,
      asesor: r.asesor,
      call_center: r.call_center,
      origen_gestion,
      responsable_gestion,
      vendedor_nsv: r.vendedor_nsv,
      estado: r.estado?.trim() || '(sin estado)',
      mes: leadMonthLima(r.fecha_creacion),
      mes_cierre: r.fecha_inscrito ? leadMonthLima(r.fecha_inscrito) : null,
      bot_intervino: r.bot_intervino_fecha !== null,
      bot_intervino_fecha: r.bot_intervino_fecha ? r.bot_intervino_fecha.toISOString() : null,
      bot_razon,
    }
  })

  const mesesDisponibles = Array.from(
    new Set(rawMatches.map((r) => leadMonthLima(r.fecha_creacion))),
  ).sort()

  const mesesCierre = Array.from(
    new Set(rawMatches.map((r) => r.fecha_inscrito ? leadMonthLima(r.fecha_inscrito) : null).filter((m): m is string => m !== null)),
  ).sort()

  return { matches, totalLeadsCrm, mesesDisponibles, mesesCierre }
}
