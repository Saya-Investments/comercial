import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendLeadAssignedNotification } from '@/lib/email'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET || 'cron-secret-key'
const CRM_URL = process.env.NEXT_PUBLIC_APP_URL || ''

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const vercelCron = req.headers.get('x-vercel-cron-secret')
  const isAuthorized = authHeader === `Bearer ${CRON_SECRET}` || vercelCron === CRON_SECRET
  if (!isAuthorized) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Buscar matchings asignados que aun no fueron notificados
  const pendientes = await prisma.matching.findMany({
    where: {
      asignado: true,
      notificado_asesor: false,
    },
    include: {
      bd_leads: {
        select: {
          nombre: true,
          apellido: true,
          producto: true,
          scoring: true,
          numero: true,
          id_lead: true,
        },
      },
      bd_asesores: {
        select: {
          id_asesor: true,
          nombre_asesor: true,
          crm_usuarios: {
            select: { email: true },
            where: { activo: true },
            take: 1,
          },
        },
      },
      hist_asignaciones: {
        select: { reasignado: true },
        orderBy: { fecha_asignacion: 'desc' },
        take: 1,
      },
    },
  })

  let enviados = 0
  const errores: string[] = []

  for (const match of pendientes) {
    const email = match.bd_asesores.crm_usuarios[0]?.email
    if (!email) {
      // Marcar como notificado para no reintentar si no hay email
      await prisma.matching.update({
        where: { id_matching: match.id_matching },
        data: { notificado_asesor: true },
      })
      errores.push(`Matching ${match.id_matching}: asesor sin email`)
      continue
    }

    try {
      const leadName = `${match.bd_leads.nombre || ''} ${match.bd_leads.apellido || ''}`.trim() || 'Lead'
      const scoring = Math.round(Number(match.bd_leads.scoring || 0) * 100)
      const esReasignacion = match.hist_asignaciones[0]?.reasignado ?? false

      await sendLeadAssignedNotification({
        to: email,
        advisorName: match.bd_asesores.nombre_asesor || 'Asesor',
        leadName,
        producto: match.bd_leads.producto || '',
        scoring,
        telefono: match.bd_leads.numero || '',
        esReasignacion,
        crmUrl: CRM_URL ? `${CRM_URL}` : undefined,
      })

      await prisma.matching.update({
        where: { id_matching: match.id_matching },
        data: { notificado_asesor: true },
      })

      enviados++
    } catch (err) {
      errores.push(`Matching ${match.id_matching}: ${(err as Error).message}`)
    }
  }

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    pendientesRevisados: pendientes.length,
    notificacionesEnviadas: enviados,
    errores: errores.length > 0 ? errores : undefined,
  })
}
