import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { interpretar, type CategoriaLlamada } from '@/lib/motivo-llamada'

export const dynamic = 'force-dynamic'

/** Tope de filas. El piloto tiene decenas; esto es para que un rango abierto no
 *  se traiga la tabla entera el dia que sean miles. */
const MAX_FILAS = 2000

/**
 * Todas las llamadas del CRM, se hayan concretado o no, con el motivo de las
 * que no.
 *
 * A diferencia de /api/calls (que lee crm_acciones_comerciales, o sea la
 * gestion que el asesor guardo), aca se lee crm_llamadas directo. Es la
 * diferencia entre "que gestiones se registraron" y "que intentos hubo": los
 * intentos que fallaron nunca generan gestion, y son justamente los que este
 * modulo tiene que mostrar.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId') || ''
  const desde = searchParams.get('desde') || ''
  const hasta = searchParams.get('hasta') || ''
  const asesorId = searchParams.get('asesorId') || ''

  if (!userId) {
    return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
  }

  const usuario = await prisma.crm_usuarios.findUnique({
    where: { id_usuario: userId },
    select: { rol: true },
  })

  // Son conversaciones con clientes y desempeño de personas con nombre: solo
  // quien supervisa. (El usuario todavia viene del cliente — mismo pendiente de
  // sesion server-side que el resto del modulo de llamadas.)
  if (!usuario || !['admin', 'supervisor'].includes((usuario.rol || '').toLowerCase())) {
    return NextResponse.json({ error: 'no_autorizado' }, { status: 403 })
  }

  // Las fechas llegan como YYYY-MM-DD y el asesor las piensa en hora peruana,
  // pero fecha_creacion es timestamptz. Sin el -05:00 explicito, "hoy" arrancaria
  // a las 19:00 del dia anterior.
  const rango: { gte?: Date; lte?: Date } = {}
  if (desde) rango.gte = new Date(`${desde}T00:00:00-05:00`)
  if (hasta) rango.lte = new Date(`${hasta}T23:59:59.999-05:00`)

  const enRango = desde || hasta ? { fecha_creacion: rango } : {}

  // Las opciones del filtro salen de quienes efectivamente llamaron en el rango,
  // no de la lista completa de usuarios: no tiene sentido ofrecer filtrar por
  // alguien que no aparece en la tabla.
  const asesoresQueLlamaron = await prisma.crm_llamadas.findMany({
    where: enRango,
    select: { crm_usuarios: { select: { id_usuario: true, nombre: true } } },
    distinct: ['id_usuario'],
  })

  const filas = await prisma.crm_llamadas.findMany({
    where: {
      ...(asesorId ? { id_usuario: asesorId } : {}),
      ...enRango,
    },
    select: {
      id_llamada: true,
      estado: true,
      motivo_fallo: true,
      direccion: true,
      duracion_seg: true,
      fecha_creacion: true,
      grabacion_url: true,
      transcript: true,
      id_accion: true,
      crm_usuarios: { select: { id_usuario: true, nombre: true } },
      bd_leads: { select: { id_lead: true, nombre: true, apellido: true, numero: true } },
    },
    orderBy: { fecha_creacion: 'desc' },
    take: MAX_FILAS,
  })

  const llamadas = filas.map((f) => {
    const r = interpretar(f.estado, f.motivo_fallo)

    return {
      id: f.id_llamada,
      fecha: f.fecha_creacion.toISOString(),
      estado: f.estado,
      categoria: r.categoria,
      etiqueta: r.etiqueta,
      motivo: r.motivo,
      accion: r.accion,
      direccion: f.direccion,
      duracionSeg: f.duracion_seg,
      tieneGrabacion: Boolean(f.grabacion_url),
      tieneTranscript: Boolean(f.transcript),
      // Sin gestion enlazada, la llamada no aparece en las metricas de actividad
      // del asesor aunque haya ocurrido.
      tieneGestion: Boolean(f.id_accion),
      asesor: {
        id: f.crm_usuarios.id_usuario,
        nombre: f.crm_usuarios.nombre,
      },
      lead: {
        id: f.bd_leads.id_lead,
        nombre: [f.bd_leads.nombre, f.bd_leads.apellido].filter(Boolean).join(' ') || 'Sin nombre',
        numero: f.bd_leads.numero ?? '',
      },
    }
  })

  const cuenta = (c: CategoriaLlamada) => llamadas.filter((l) => l.categoria === c).length
  const conectadas = cuenta('conectada')
  const indeterminadas = cuenta('indeterminada')
  const noConectadas = llamadas.length - conectadas - indeterminadas

  // Las indeterminadas no se cuentan en el denominador: no se sabe si el lead
  // atendio, y meterlas para un lado o para el otro inventa un dato.
  const base = conectadas + noConectadas

  const conDuracion = llamadas.filter((l) => l.categoria === 'conectada' && l.duracionSeg)
  const segTotal = conDuracion.reduce((a, l) => a + (l.duracionSeg ?? 0), 0)

  // Los motivos se agrupan por texto y no por categoria: dos llamadas fallidas
  // pueden fallar por cosas distintas, y agruparlas como "Falló" esconde
  // justamente lo que hay que arreglar.
  const motivos = new Map<string, { motivo: string; categoria: CategoriaLlamada; n: number }>()
  for (const l of llamadas) {
    if (l.categoria === 'conectada' || !l.motivo) continue
    const prev = motivos.get(l.motivo)
    if (prev) prev.n++
    else motivos.set(l.motivo, { motivo: l.motivo, categoria: l.categoria, n: 1 })
  }

  return NextResponse.json({
    llamadas,
    truncado: filas.length === MAX_FILAS,
    asesores: asesoresQueLlamaron
      .map((a) => ({ id: a.crm_usuarios.id_usuario, name: a.crm_usuarios.nombre }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    resumen: {
      total: llamadas.length,
      conectadas,
      noConectadas,
      indeterminadas,
      tasaContacto: base > 0 ? Math.round((conectadas / base) * 100) : null,
      duracionTotalSeg: segTotal,
      duracionPromedioSeg: conDuracion.length ? Math.round(segTotal / conDuracion.length) : null,
    },
    porMotivo: Array.from(motivos.values()).sort((a, b) => b.n - a.n),
  })
}
