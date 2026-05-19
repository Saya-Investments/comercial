import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET

// Cuotas por defecto (alineadas con los valores que el equipo viene usando
// desde fines de abril 2026: 150 high / 90 medium / 60 low por semana).
// Si en el futuro se mueven a config_modelo o a una tabla, leerlas desde ahi.
const CUOTA_HIGH = 150
const CUOTA_MEDIUM = 90
const CUOTA_LOW = 60

// Devuelve el lunes 00:00 (UTC) de la semana actual segun hora Lima.
// Se usa hora Lima para que la transicion de semana ocurra a medianoche
// local, no a las 19:00 del domingo (UTC).
function lunesDeEstaSemanaLima(): Date {
  const ahoraUtc = new Date()
  // Hora Lima = UTC - 5h. No hay DST en Peru.
  const ahoraLima = new Date(ahoraUtc.getTime() - 5 * 60 * 60 * 1000)
  const diaSemana = ahoraLima.getUTCDay() // 0 = domingo, 1 = lunes, ...
  const offsetDias = diaSemana === 0 ? 6 : diaSemana - 1
  const lunes = new Date(ahoraLima)
  lunes.setUTCDate(lunes.getUTCDate() - offsetDias)
  lunes.setUTCHours(0, 0, 0, 0)
  return lunes
}

export async function GET(req: NextRequest) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const semanaInicio = lunesDeEstaSemanaLima()

  const asesoresDisponibles = await prisma.bd_asesores.findMany({
    where: { disponibilidad: 'disponible' },
    select: { id_asesor: true, cod_asesor: true, nombre_asesor: true },
  })

  if (asesoresDisponibles.length === 0) {
    return NextResponse.json({
      ok: true,
      semana_inicio: semanaInicio.toISOString().slice(0, 10),
      asesores_disponibles: 0,
      cuotas_creadas: 0,
      mensaje: 'No hay asesores con disponibilidad="disponible", no se creo nada',
    })
  }

  // Insert idempotente: si ya existe una fila para (id_asesor, semana_inicio),
  // no toca nada (ni resetea recibidos, ni cambia las cuotas). Asi se puede
  // re-ejecutar sin riesgo.
  const result = await prisma.cuotas_semanales.createMany({
    data: asesoresDisponibles.map((a) => ({
      id_asesor: a.id_asesor,
      semana_inicio: semanaInicio,
      cuota_high: CUOTA_HIGH,
      cuota_medium: CUOTA_MEDIUM,
      cuota_low: CUOTA_LOW,
    })),
    skipDuplicates: true,
  })

  return NextResponse.json({
    ok: true,
    semana_inicio: semanaInicio.toISOString().slice(0, 10),
    asesores_disponibles: asesoresDisponibles.length,
    cuotas_creadas: result.count,
    cuotas_ya_existentes: asesoresDisponibles.length - result.count,
    config: { cuota_high: CUOTA_HIGH, cuota_medium: CUOTA_MEDIUM, cuota_low: CUOTA_LOW },
  })
}
