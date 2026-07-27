import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { esEmailDemo } from '@/lib/demo-access'

type LeadMetadataRow = {
  id_lead: string
  Base: string | null
  Bucket: string | null
}

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const estado = searchParams.get('estado') || ''
  const producto = searchParams.get('producto') || ''
  const userId = searchParams.get('userId') || ''
  const role = searchParams.get('role') || ''
  const asesorId = searchParams.get('asesorId') || ''
  const callCenterId = searchParams.get('callCenterId') || ''

  const where: Record<string, unknown> = {}

  // Contexto del actor que consulta — usado para calcular "gestionado" filtrando
  // acciones por el actor correcto (asesor o CC).
  let viewerAsesorId: string | null = null
  let viewerCallCenterId: string | null = null
  let viewerEmail: string | null = null

  // Filter by specific asesor (admin filtering)
  if (asesorId) {
    const matchings = await prisma.matching.findMany({
      where: { id_asesor: asesorId, asignado: true },
      select: { id_lead: true },
    })
    const leadIds = matchings.map((m) => m.id_lead)
    where.OR = [
      { id_lead: { in: leadIds } },
      { ultimo_asesor_asignado: asesorId },
    ]
    viewerAsesorId = asesorId
  } else if (userId && role === 'asesor') {
    const usuario = await prisma.crm_usuarios.findUnique({
      where: { id_usuario: userId },
      select: { id_asesor: true, email: true },
    })
    viewerEmail = usuario?.email ?? null

    if (usuario?.id_asesor) {
      // Get lead IDs assigned to this asesor via matching (asignado = true)
      const matchings = await prisma.matching.findMany({
        where: { id_asesor: usuario.id_asesor, asignado: true },
        select: { id_lead: true },
      })
      const leadIds = matchings.map((m) => m.id_lead)

      // Also include leads directly assigned via ultimo_asesor_asignado
      where.OR = [
        { id_lead: { in: leadIds } },
        { ultimo_asesor_asignado: usuario.id_asesor },
      ]
      where.AND = [
        {
          OR: [
            { ultimo_estado_asesor: null },
            { ultimo_estado_asesor: { not: 'No_interesado' } },
          ],
        },
        // Ocultar leads que actualmente estan en Call Center: el asesor backup
        // no debe verlos en su bandeja mientras el CC los trabaja. Reaparecen
        // automaticamente cuando el CC los libera (timeout 12h o derivacion).
        { asignado_call_center: null },
      ]
      viewerAsesorId = usuario.id_asesor
    } else {
      // User has no linked asesor, show nothing
      return NextResponse.json([])
    }
  } else if (userId && role === 'supervisor') {
    // Supervisor: show leads of all supervised asesores
    const supervisados = await prisma.crm_usuarios.findMany({
      where: { id_supervisor: userId, activo: true },
      select: { id_asesor: true },
    })
    const asesorIds = supervisados
      .map((s) => s.id_asesor)
      .filter((id): id is string => id !== null)

    if (asesorIds.length > 0) {
      const matchings = await prisma.matching.findMany({
        where: { id_asesor: { in: asesorIds }, asignado: true },
        select: { id_lead: true },
      })
      const leadIds = matchings.map((m) => m.id_lead)
      where.OR = [
        { id_lead: { in: leadIds } },
        { ultimo_asesor_asignado: { in: asesorIds } },
      ]
      // Igual que asesor: ocultar leads en CC de la vista del supervisor.
      where.AND = [{ asignado_call_center: null }]
    } else {
      return NextResponse.json([])
    }
  } else if (userId && role === 'call center') {
    const usuario = await prisma.crm_usuarios.findUnique({
      where: { id_usuario: userId },
      select: { id_call_center: true },
    })

    if (usuario?.id_call_center) {
      // Show only leads assigned to this call center user
      where.asignado_call_center = usuario.id_call_center
      viewerCallCenterId = usuario.id_call_center
    } else {
      return NextResponse.json([])
    }
  }

  if (search) {
    const searchFilter = [
      { nombre: { contains: search, mode: 'insensitive' } },
      { apellido: { contains: search, mode: 'insensitive' } },
      { dni: { contains: search } },
      { numero: { contains: search } },
    ]
    // Combine search with existing OR (asesor filter) using AND
    if (where.OR) {
      const existingAnd = Array.isArray(where.AND) ? where.AND : []
      where.AND = [...existingAnd, { OR: where.OR }, { OR: searchFilter }]
      delete where.OR
    } else {
      where.OR = searchFilter
    }
  }
  if (callCenterId) where.asignado_call_center = callCenterId
  if (estado) where.estado_de_lead = estado
  if (producto) where.producto = producto

  const leads = await prisma.bd_leads.findMany({
    where,
    include: {
      bd_asesores: { select: { nombre_asesor: true, cod_asesor: true } },
      matching: {
        where: { asignado: true },
        select: { fecha_asignacion: true },
        orderBy: { fecha_asignacion: 'desc' },
        take: 1,
      },
    },
    orderBy: { fecha_creacion: 'desc' },
  })

  const leadIds = leads.map((l) => l.id_lead)
  const leadMetadata = leadIds.length > 0
    ? await prisma.$queryRawUnsafe<LeadMetadataRow[]>(
        'SELECT id_lead, "Base", "Bucket" FROM comercial.bd_leads WHERE id_lead = ANY($1::uuid[])',
        leadIds
      )
    : []
  // "gestionado" se calcula respecto al actor que consulta:
  //   - asesor (incluye admin filtrando por asesorId): solo cuentan acciones
  //     hechas por usuarios vinculados a ese id_asesor.
  //   - call center: solo cuentan acciones hechas por usuarios del mismo CC.
  //   - supervisor / sin contexto: cualquier accion cuenta (vista agregada).
  type AccionAggRow = { id_lead: string; max_fecha: Date | null }
  let accionesAgg: AccionAggRow[] = []
  if (leadIds.length > 0) {
    if (viewerAsesorId) {
      accionesAgg = await prisma.$queryRaw<AccionAggRow[]>`
        SELECT ac.id_lead, MAX(ac.fecha_creacion) AS max_fecha
        FROM comercial.crm_acciones_comerciales ac
        JOIN comercial.crm_usuarios u ON u.id_usuario = ac.id_usuario
        WHERE ac.id_lead = ANY(${leadIds}::uuid[])
          AND u.id_asesor = ${viewerAsesorId}::uuid
        GROUP BY ac.id_lead
      `
    } else if (viewerCallCenterId) {
      accionesAgg = await prisma.$queryRaw<AccionAggRow[]>`
        SELECT ac.id_lead, MAX(ac.fecha_creacion) AS max_fecha
        FROM comercial.crm_acciones_comerciales ac
        JOIN comercial.crm_usuarios u ON u.id_usuario = ac.id_usuario
        WHERE ac.id_lead = ANY(${leadIds}::uuid[])
          AND u.id_call_center = ${viewerCallCenterId}::uuid
        GROUP BY ac.id_lead
      `
    } else {
      const fallback = await prisma.crm_acciones_comerciales.groupBy({
        by: ['id_lead'],
        where: { id_lead: { in: leadIds } },
        _max: { fecha_creacion: true },
      })
      accionesAgg = fallback.map((a) => ({ id_lead: a.id_lead, max_fecha: a._max.fecha_creacion }))
    }
  }
  const maxAccionByLead = new Map(
    accionesAgg.map((a) => [a.id_lead, a.max_fecha])
  )
  const leadMetadataById = new Map(
    leadMetadata.map((row) => [row.id_lead, row])
  )

  // Última fecha en la que el LEAD escribió (inbound).
  type UltimoMsgRow = { id_lead: string; max_ts: Date | null }
  const ultimoMsgAgg: UltimoMsgRow[] = leadIds.length > 0
    ? await prisma.$queryRaw<UltimoMsgRow[]>`
        SELECT id_lead, MAX("timestamp") AS max_ts
        FROM comercial.hist_conversaciones
        WHERE id_lead = ANY(${leadIds}::uuid[])
          AND direccion = 'inbound'
        GROUP BY id_lead
      `
    : []
  const ultimoMsgByLead = new Map(
    ultimoMsgAgg.map((r) => [r.id_lead, r.max_ts])
  )

  // Estado funnel NSV: cruce por telefono_norm. Si falla o tarda, los leads
  // cargan igual con estadoFunnel = null (no bloquea la tabla).
  const phones9 = leads
    .map((l) => (l.numero || '').replace(/\D/g, '').slice(-9))
    .filter((p) => p.length === 9)

  type FunnelEstadoRow = { phone9: string; estado_documento: string | null }
  let funnelByPhone = new Map<string, string | null>()
  if (phones9.length > 0) {
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 3000)
      )
      const funnelRows = await Promise.race([
        prisma.$queryRaw<FunnelEstadoRow[]>`
          SELECT telefono_norm AS phone9,
                 estado_documento
          FROM comercial.nsv_prospectos
          WHERE telefono_norm = ANY(${phones9}::text[])
        `,
        timeout,
      ])
      funnelByPhone = new Map(funnelRows.map((r) => [r.phone9, r.estado_documento]))
    } catch {
      // si falla o supera 3s, los leads cargan sin estado funnel
    }
  }

  // Reactivación de base tibia ("gestionar primero"): SOLO para el perfil demo
  // mientras está en prueba. Para los asesores reales, reactMap queda vacío y
  // la vista se comporta exactamente como antes.
  type ReactInfo = { escalon: string; ola: number }
  let reactMap = new Map<string, ReactInfo>()
  if (esEmailDemo(viewerEmail) && leadIds.length > 0) {
    const react = await prisma.$queryRaw<{ id_lead: string; escalon: string; ola: number }[]>`
      SELECT id_lead, escalon, ola FROM comercial.reactivacion_tibia
      WHERE id_lead = ANY(${leadIds}::uuid[]) AND activo = true
    `
    reactMap = new Map(react.map((r) => [r.id_lead, { escalon: r.escalon, ola: Number(r.ola) }]))
  }

  const mapped = leads.map((l) => {
    const fechaAsignacion = l.matching[0]?.fecha_asignacion ?? null
    const maxAccion = maxAccionByLead.get(l.id_lead) ?? null
    const gestionado = !!(fechaAsignacion && maxAccion && maxAccion >= fechaAsignacion)
    const metadata = leadMetadataById.get(l.id_lead)
    const phone9 = (l.numero || '').replace(/\D/g, '').slice(-9)
    return {
      id: l.id_lead,
      dni: l.dni || '',
      nombre: l.nombre || '',
      apellido: l.apellido || '',
      name: `${l.nombre || ''} ${l.apellido || ''}`.trim(),
      phone: l.numero || '',
      email: l.correo || '',
      base: metadata?.Base || 'Caliente',
      bucket: metadata?.Bucket || '',
      status: l.estado_de_lead || 'lead',
      assignedDate: l.fecha_creacion.toISOString().split('T')[0],
      product: l.producto || '',
      priority: getPriority(l.scoring),
      score: l.scoring ? Math.round(Number(l.scoring) * 100) : 0,
      zona: l.zona || '',
      origen: l.origen_lead || '',
      asesor: l.bd_asesores?.nombre_asesor || 'Sin asignar',
      sentimiento: l.sentimiento_actual || '',
      segmento: l.segmento_de_scoring || '',
      estadoAsesor: l.ultimo_estado_asesor || '',
      fechaAsignacion: fechaAsignacion?.toISOString() || null,
      ultimoMensajeLead: ultimoMsgByLead.get(l.id_lead)?.toISOString() || null,
      gestionado,
      estadoFunnel: funnelByPhone.get(phone9) ?? null,
      reactivacion: reactMap.get(l.id_lead) ?? null,
    }
  })

  // Los marcados "gestionar primero" flotan al tope (por escalón P1..P4);
  // el resto conserva el orden por fecha. sort de V8 es estable → los no
  // marcados mantienen su orden original.
  if (reactMap.size > 0) {
    const escOrder: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 }
    mapped.sort((a, b) => {
      if (a.reactivacion && !b.reactivacion) return -1
      if (!a.reactivacion && b.reactivacion) return 1
      if (a.reactivacion && b.reactivacion) {
        return (escOrder[a.reactivacion.escalon] ?? 9) - (escOrder[b.reactivacion.escalon] ?? 9)
      }
      return 0
    })
  }

  return NextResponse.json(mapped)
}

function getPriority(scoring: unknown): 'Alta' | 'Media' | 'Baja' {
  const s = Number(scoring) || 0
  if (s >= 0.7) return 'Alta'
  if (s >= 0.4) return 'Media'
  return 'Baja'
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const lead = await prisma.bd_leads.create({
    data: {
      dni: body.dni,
      nombre: body.name?.split(' ')[0] || body.name,
      apellido: body.name?.split(' ').slice(1).join(' ') || '',
      numero: body.phone,
      producto: body.product,
      correo: body.email || null,
      estado_de_lead: 'lead',
    },
  })

  await prisma.$executeRawUnsafe(
    'UPDATE comercial.bd_leads SET "Base" = $1 WHERE id_lead = $2',
    'Caliente',
    lead.id_lead
  )

  return NextResponse.json({ id: lead.id_lead }, { status: 201 })
}
