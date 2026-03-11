import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendAppointmentReminder } from '@/lib/email'

export const dynamic = 'force-dynamic'

// Secret para proteger el endpoint cron
const CRON_SECRET = process.env.CRON_SECRET || 'cron-secret-key'

export async function GET(req: NextRequest) {
  // Validar que la llamada viene de un cron autorizado
  const authHeader = req.headers.get('authorization')
  const vercelCron = req.headers.get('x-vercel-cron-secret')
  const isAuthorized = authHeader === `Bearer ${CRON_SECRET}` || vercelCron === CRON_SECRET
  if (!isAuthorized) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const now = new Date()

  // Buscar citas activas que aun no tienen recordatorio enviado
  // y cuya fecha+hora ya llego o esta en los proximos 15 minutos
  const citas = await prisma.crm_citas.findMany({
    where: {
      estado: 'active',
      recordatorio_enviado: false,
    },
    include: {
      crm_usuarios: { select: { email: true, nombre: true } },
      bd_leads: { select: { nombre: true, apellido: true } },
    },
  })

  let enviados = 0
  const errores: string[] = []

  for (const cita of citas) {
    // Construir el datetime de la cita
    const citaFecha = cita.fecha.toISOString().split('T')[0] // YYYY-MM-DD
    const horaDate = cita.hora as unknown as Date
    const horaStr = horaDate instanceof Date
      ? `${String(horaDate.getUTCHours()).padStart(2, '0')}:${String(horaDate.getUTCMinutes()).padStart(2, '0')}`
      : String(cita.hora).slice(0, 5)

    const [hours, minutes] = horaStr.split(':').map(Number)
    const citaDateTime = new Date(citaFecha + 'T00:00:00')
    citaDateTime.setHours(hours, minutes, 0, 0)

    // Calcular diferencia en minutos
    const diffMs = citaDateTime.getTime() - now.getTime()
    const diffMinutes = diffMs / (1000 * 60)

    // Enviar si faltan 15 minutos o menos (o si ya paso la hora)
    if (diffMinutes <= 15) {
      if (!cita.crm_usuarios.email) {
        errores.push(`Cita ${cita.id_cita}: usuario sin email`)
        continue
      }

      try {
        const leadName = cita.nombre_lead
          || `${cita.bd_leads?.nombre || ''} ${cita.bd_leads?.apellido || ''}`.trim()
          || 'Lead'

        const tipo = cita.tipo === 'llamada' ? 'llamada' : 'cita'

        await sendAppointmentReminder({
          to: cita.crm_usuarios.email,
          advisorName: cita.crm_usuarios.nombre,
          leadName,
          type: tipo as 'llamada' | 'cita',
          date: citaFecha,
          time: horaStr,
          notes: cita.descripcion || undefined,
        })

        // Marcar como enviado
        await prisma.crm_citas.update({
          where: { id_cita: cita.id_cita },
          data: { recordatorio_enviado: true },
        })

        enviados++
      } catch (err) {
        errores.push(`Cita ${cita.id_cita}: ${(err as Error).message}`)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    timestamp: now.toISOString(),
    citasRevisadas: citas.length,
    recordatoriosEnviados: enviados,
    errores: errores.length > 0 ? errores : undefined,
  })
}
