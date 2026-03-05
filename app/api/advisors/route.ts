import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const asesores = await prisma.bd_asesores.findMany({
    include: {
      _count: {
        select: {
          hist_asignaciones_hist_asignaciones_id_asesorTobd_asesores: true,
          bd_leads: true,
        },
      },
      hist_asignaciones_hist_asignaciones_id_asesorTobd_asesores: {
        select: { estado_gestion: true, cerro_venta: true },
      },
    },
    orderBy: { nombre_asesor: 'asc' },
  })

  const mapped = asesores.map((a) => {
    const asigs = a.hist_asignaciones_hist_asignaciones_id_asesorTobd_asesores
    const completadas = asigs.filter((x) => x.estado_gestion !== 'en_espera').length
    const pendientes = asigs.filter((x) => x.estado_gestion === 'en_espera').length
    const ventas = asigs.filter((x) => x.cerro_venta).length

    let performance: string = 'average'
    const ratio = Number(a.ratio_conversion_de_venta) || 0
    if (ratio >= 0.3) performance = 'excellent'
    else if (ratio >= 0.15) performance = 'good'
    else if (ratio < 0.05) performance = 'needs-improvement'

    return {
      id: a.id_asesor,
      name: a.nombre_asesor || a.cod_asesor || 'Sin nombre',
      role: a.especialidad || 'Asesor',
      calls: a._count.hist_asignaciones_hist_asignaciones_id_asesorTobd_asesores,
      tasksCompleted: completadas,
      pending: pendientes,
      ventas,
      performance,
      disponibilidad: a.disponibilidad || 'no disponible',
      leadsEnCola: a.leads_en_cola || 0,
    }
  })

  return NextResponse.json(mapped)
}
