import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET
const HORAS_TIMEOUT = 12

/**
 * Cron de derivacion automatica del Call Center a asesor backup.
 *
 * Si un lead lleva mas del HORAS_TIMEOUT configurado (por defecto 4h)
 * asignado al CC sin ninguna accion comercial registrada por un usuario
 * del CC, lo desasigna del CC. El asesor backup (ultimo_asesor_asignado)
 * ya tiene el matching activo desde el routing inicial (con
 * via_call_center=true en hist_asignaciones), asi que solo hace falta
 * limpiar bd_leads.asignado_call_center, decrementar cola del CC y
 * resetear el timer del matching del asesor. El email lo envia el cron
 * notificar-asignacion en el proximo tick.
 *
 * Excepcion del diseño: si el CC ya contacto al lead (registro cualquier
 * accion), el lead ya no cumple el filtro "sin acciones del CC" y no se
 * deriva. No requiere logica especial.
 */
export async function GET(req: NextRequest) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const now = new Date()

  // Buscar candidatos: leads con CC asignado, >2h desde la asignacion al CC
  // (fecha de hist_asignaciones.via_call_center=true), sin accion de ningun
  // usuario del CC. DISTINCT ON por si historicamente hubo mas de un paso
  // por CC (se usa el mas reciente).
  const candidatos: Array<{
    id_lead: string
    id_call_center: string
    cc_nombre: string
    id_asesor_actual: string
    fecha_asignacion_cc: Date
  }> = await prisma.$queryRaw`
    SELECT DISTINCT ON (l.id_lead)
      l.id_lead,
      l.asignado_call_center AS id_call_center,
      cc.nombre AS cc_nombre,
      l.ultimo_asesor_asignado AS id_asesor_actual,
      h.fecha_asignacion AS fecha_asignacion_cc
    FROM comercial.bd_leads l
    JOIN comercial.bd_call_center cc ON cc.id_call_center = l.asignado_call_center
    JOIN comercial.hist_asignaciones h
      ON h.id_lead = l.id_lead AND h.via_call_center = true
    WHERE l.asignado_call_center IS NOT NULL
      AND l.ultimo_asesor_asignado IS NOT NULL
      AND (NOW() - h.fecha_asignacion) > make_interval(hours => ${HORAS_TIMEOUT})
      AND NOT EXISTS (
        SELECT 1 FROM comercial.crm_acciones_comerciales ac
        JOIN comercial.crm_usuarios u ON u.id_usuario = ac.id_usuario
        WHERE ac.id_lead = l.id_lead
          AND u.id_call_center IS NOT NULL
      )
    ORDER BY l.id_lead, h.fecha_asignacion DESC
  `

  let derivados = 0
  const errores: string[] = []

  for (const c of candidatos) {
    try {
      await prisma.$transaction(async (tx) => {
        // 1. Limpiar asignacion del CC en bd_leads
        await tx.bd_leads.update({
          where: { id_lead: c.id_lead },
          data: { asignado_call_center: null },
        })

        // 2. Decrementar cola del CC (con guardia contra negativos)
        await tx.$executeRaw`
          UPDATE comercial.bd_call_center
          SET leads_en_cola = GREATEST(leads_en_cola - 1, 0),
              fecha_actualizacion = NOW()
          WHERE id_call_center = ${c.id_call_center}::uuid
        `

        // 3. Reiniciar el timer de 24h del asesor backup y marcar
        //    notificado_asesor=false para que el cron notificar-asignacion
        //    le envie el email en su proximo tick (es el unico responsable
        //    de notificar al asesor).
        //    Sin el reset de fecha_asignacion, el cron de reasignaciones
        //    veria un matching de hace >24h y reasignaria al instante.
        await tx.matching.updateMany({
          where: {
            id_lead: c.id_lead,
            id_asesor: c.id_asesor_actual,
            asignado: true,
          },
          data: { fecha_asignacion: now, notificado_asesor: false },
        })

        // 4. Cerrar la fila abierta en hist_cc_derivaciones (la mas reciente
        //    sin fecha_derivacion). Se filtra por id_lead + id_call_center por
        //    si en el futuro un lead pasa por CC mas de una vez — cerramos
        //    solo la que esta actualmente abierta.
        await tx.$executeRaw`
          UPDATE comercial.hist_cc_derivaciones
          SET fecha_derivacion = ${now},
              motivo_derivacion = ${`timeout_${HORAS_TIMEOUT}h`}
          WHERE id_hist_cc = (
            SELECT id_hist_cc FROM comercial.hist_cc_derivaciones
            WHERE id_lead = ${c.id_lead}::uuid
              AND id_call_center = ${c.id_call_center}::uuid
              AND fecha_derivacion IS NULL
            ORDER BY fecha_asignacion_cc DESC
            LIMIT 1
          )
        `
      }, { timeout: 30000, maxWait: 10000 })

      derivados++

      // Email al asesor backup lo envia el cron notificar-asignacion en su
      // proximo tick (captura el matching con notificado_asesor=false y
      // asignado_call_center ya en NULL).
    } catch (err) {
      errores.push(`Lead ${c.id_lead}: ${(err as Error).message}`)
    }
  }

  return NextResponse.json({
    ok: true,
    timestamp: now.toISOString(),
    leadsRevisados: candidatos.length,
    derivados,
    errores: errores.length > 0 ? errores : undefined,
  })
}
