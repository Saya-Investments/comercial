import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const supervisorId = searchParams.get('supervisorId')

  // If supervisor filter, only return asesores supervised by this user
  let asesorFilter: Record<string, unknown> | undefined
  if (supervisorId) {
    const supervisados = await prisma.crm_usuarios.findMany({
      where: { id_supervisor: supervisorId, activo: true },
      select: { id_asesor: true },
    })
    const asesorIds = supervisados
      .map((s) => s.id_asesor)
      .filter((id): id is string => id !== null)
    asesorFilter = { id_asesor: { in: asesorIds } }
  }

  const [asesores, accionesPorUsuario] = await Promise.all([
    prisma.bd_asesores.findMany({
      where: asesorFilter,
      include: {
        hist_asignaciones_hist_asignaciones_id_asesorTobd_asesores: {
          select: { estado_gestion: true, cerro_venta: true },
        },
        crm_usuarios: {
          select: { id_usuario: true },
        },
      },
      orderBy: { nombre_asesor: 'asc' },
    }),
    prisma.crm_acciones_comerciales.groupBy({
      by: ['id_usuario'],
      _count: { id_accion: true },
    }),
  ])

  // Mapa de id_usuario -> conteo de acciones comerciales
  const accionesMap = new Map<string, number>()
  for (const row of accionesPorUsuario) {
    accionesMap.set(row.id_usuario, row._count.id_accion)
  }

  const mapped = asesores.map((a) => {
    const asigs = a.hist_asignaciones_hist_asignaciones_id_asesorTobd_asesores
    const completadas = asigs.filter((x) => x.estado_gestion !== 'en_espera').length
    const pendientes = asigs.filter((x) => x.estado_gestion === 'en_espera').length
    const ventas = asigs.filter((x) => x.cerro_venta).length

    // Sumar acciones comerciales de todos los usuarios vinculados a este asesor
    const accionesComerciales = a.crm_usuarios.reduce(
      (sum, u) => sum + (accionesMap.get(u.id_usuario) || 0),
      0
    )

    let performance: string = 'average'
    const ratio = Number(a.ratio_conversion_de_venta) || 0
    if (ratio >= 0.3) performance = 'excellent'
    else if (ratio >= 0.15) performance = 'good'
    else if (ratio < 0.05) performance = 'needs-improvement'

    return {
      id: a.id_asesor,
      name: a.nombre_asesor || a.cod_asesor || 'Sin nombre',
      role: a.especialidad || 'Asesor',
      calls: asigs.length,
      tasksCompleted: completadas,
      pending: pendientes,
      ventas,
      accionesComerciales,
      performance,
      disponibilidad: a.disponibilidad || 'no disponible',
      leadsEnCola: a.leads_en_cola || 0,
    }
  })

  return NextResponse.json(mapped)
}
