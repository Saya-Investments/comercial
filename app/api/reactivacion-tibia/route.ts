import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { REACTIVACION_LIVE } from '@/lib/tibia-constants'

export const dynamic = 'force-dynamic'

// Seguimiento de la reactivacion de base tibia: de los leads marcados como
// "Gestionar primero" en la bandeja del asesor, cuantos se gestionaron despues
// de que la vista salio a produccion.
//
// "Gestionado" = tiene al menos una accion comercial registrada posterior al
// despliegue. Ojo: mide lo REGISTRADO en el CRM, que por el subregistro conocido
// es un piso, no el total real de gestion.

type DetalleRow = {
  id_lead: string
  nombre: string | null
  apellido: string | null
  numero: string | null
  dni: string | null
  fecha_creacion: Date | null
  escalon: string
  ola: number
  asesor: string | null
  acciones_post: number
  primera_post: Date | null
  ultima_accion: Date | null
  ultimo_estado: string | null
  estado_inicial: string | null
}

export async function GET() {
  const detalle = await prisma.$queryRawUnsafe<DetalleRow[]>(
    `WITH marcados AS (
       SELECT id_lead, escalon, ola, ultimo_estado_asesor_inicial
       FROM comercial.reactivacion_tibia
       WHERE activo = true
     ),
     asig AS (
       SELECT m.*, a.nombre_asesor AS asesor
       FROM marcados m
       LEFT JOIN LATERAL (
         SELECT mt.id_asesor FROM comercial.matching mt
         WHERE mt.id_lead = m.id_lead AND mt.asignado = true
         ORDER BY mt.fecha_asignacion DESC LIMIT 1
       ) mt ON true
       LEFT JOIN comercial.bd_asesores a ON a.id_asesor = mt.id_asesor
     )
     SELECT s.id_lead::text, l.nombre, l.apellido, l.numero, l.dni, l.fecha_creacion,
            s.escalon, s.ola, s.asesor,
            s.ultimo_estado_asesor_inicial AS estado_inicial,
            (SELECT COUNT(*)::int FROM comercial.crm_acciones_comerciales x
              WHERE x.id_lead = s.id_lead AND x.fecha_creacion >= $1::timestamptz) AS acciones_post,
            (SELECT MIN(x.fecha_creacion) FROM comercial.crm_acciones_comerciales x
              WHERE x.id_lead = s.id_lead AND x.fecha_creacion >= $1::timestamptz) AS primera_post,
            (SELECT MAX(x.fecha_creacion) FROM comercial.crm_acciones_comerciales x
              WHERE x.id_lead = s.id_lead) AS ultima_accion,
            (SELECT x.estado_asesor FROM comercial.crm_acciones_comerciales x
              WHERE x.id_lead = s.id_lead ORDER BY x.fecha_creacion DESC LIMIT 1) AS ultimo_estado
     FROM asig s
     JOIN comercial.bd_leads l ON l.id_lead = s.id_lead
     ORDER BY s.escalon, s.asesor NULLS LAST`,
    REACTIVACION_LIVE
  )

  // Control: el resto de la bandeja de esos mismos asesores en la misma ventana.
  // Es lo que da sentido al numero: sin esto, un 24% no se sabe si es mucho o poco.
  const control = await prisma.$queryRawUnsafe<{ leads: number; gestionados: number }[]>(
    `WITH marcados AS (SELECT id_lead FROM comercial.reactivacion_tibia WHERE activo = true),
     asesores AS (
       SELECT DISTINCT mt.id_asesor FROM comercial.matching mt
       WHERE mt.id_lead IN (SELECT id_lead FROM marcados) AND mt.asignado = true
     ),
     bandeja AS (
       SELECT DISTINCT mt.id_lead FROM comercial.matching mt
       WHERE mt.asignado = true AND mt.id_asesor IN (SELECT id_asesor FROM asesores)
         AND mt.id_lead NOT IN (SELECT id_lead FROM marcados)
     )
     SELECT COUNT(*)::int AS leads,
       COUNT(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM comercial.crm_acciones_comerciales x
         WHERE x.id_lead = b.id_lead AND x.fecha_creacion >= $1::timestamptz))::int AS gestionados
     FROM bandeja b`,
    REACTIVACION_LIVE
  )

  const olas = await prisma.$queryRawUnsafe<{ escalon: string; ola: number; activo: boolean; n: number }[]>(
    `SELECT escalon, ola::int, activo, COUNT(*)::int AS n
     FROM comercial.reactivacion_tibia GROUP BY 1,2,3 ORDER BY 1`
  )

  const leads = detalle.map((d) => ({
    idLead: d.id_lead,
    nombre: [d.nombre, d.apellido].filter(Boolean).join(' ') || null,
    numero: d.numero,
    dni: d.dni,
    fechaCreacion: d.fecha_creacion ? new Date(d.fecha_creacion).toISOString() : null,
    escalon: d.escalon,
    ola: Number(d.ola),
    asesor: d.asesor,
    accionesPost: Number(d.acciones_post),
    primeraPost: d.primera_post ? new Date(d.primera_post).toISOString() : null,
    ultimaAccion: d.ultima_accion ? new Date(d.ultima_accion).toISOString() : null,
    ultimoEstado: d.ultimo_estado,
    estadoInicial: d.estado_inicial,
  }))

  const gestionados = leads.filter((l) => l.accionesPost > 0)

  const porAsesorMap = new Map<string, { asesor: string; asignados: number; gestionados: number; acciones: number }>()
  for (const l of leads) {
    const key = l.asesor || 'Sin asesor asignado'
    const row = porAsesorMap.get(key) || { asesor: key, asignados: 0, gestionados: 0, acciones: 0 }
    row.asignados++
    row.acciones += l.accionesPost
    if (l.accionesPost > 0) row.gestionados++
    porAsesorMap.set(key, row)
  }

  const ctrl = control[0] ?? { leads: 0, gestionados: 0 }

  return NextResponse.json({
    live: REACTIVACION_LIVE,
    resumen: {
      priorizados: leads.length,
      gestionados: gestionados.length,
      pendientes: leads.length - gestionados.length,
      acciones: leads.reduce((a, l) => a + l.accionesPost, 0),
      control: {
        leads: ctrl.leads,
        gestionados: ctrl.gestionados,
      },
    },
    porAsesor: Array.from(porAsesorMap.values()).sort(
      (a, b) => b.gestionados / b.asignados - a.gestionados / a.asignados || b.asignados - a.asignados
    ),
    leads,
    olas: olas.map((o) => ({ escalon: o.escalon, ola: Number(o.ola), activo: o.activo, n: Number(o.n) })),
  })
}
