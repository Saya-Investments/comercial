import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type TitularInput = {
  nombre?: string | null
  apellido?: string | null
  dni?: string | null
  numero?: string | null
  correo?: string | null
  direccion?: string | null
}

const clean = (v: unknown) => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

export async function POST(req: NextRequest) {
  const { leadId, userId, titular } = (await req.json()) as {
    leadId?: string
    userId?: string
    titular?: TitularInput
  }

  if (!leadId || !userId) {
    return NextResponse.json({ error: 'leadId y userId son requeridos' }, { status: 400 })
  }

  const titularData = {
    nombre: clean(titular?.nombre),
    apellido: clean(titular?.apellido),
    dni: clean(titular?.dni),
    numero: clean(titular?.numero),
    correo: clean(titular?.correo),
    direccion: clean(titular?.direccion),
  }

  // 1. Obtener datos del lead con su asesor
  const lead = await prisma.bd_leads.findUnique({
    where: { id_lead: leadId },
    include: {
      bd_asesores: { select: { cod_asesor: true, dni: true } },
    },
  })

  if (!lead) {
    return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
  }

  if (!lead.bd_asesores?.cod_asesor) {
    return NextResponse.json({ error: 'El lead no tiene asesor asignado con codigo' }, { status: 400 })
  }

  if (!lead.bd_asesores?.dni) {
    return NextResponse.json({ error: 'El asesor del lead no tiene DNI registrado' }, { status: 400 })
  }

  if (lead.ultimo_estado_asesor === 'Prospecto') {
    return NextResponse.json({ success: true, alreadyRegistered: true })
  }

  // 2. Login en API NSV para obtener token
  const loginRes = await fetch(process.env.NSV_LOGIN_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.NSV_BOT_EMAIL,
      password: process.env.NSV_BOT_PASSWORD,
      idAplicacion: process.env.NSV_APP_ID,
    }),
  })

  if (!loginRes.ok) {
    return NextResponse.json({ error: 'Error al autenticar con API NSV' }, { status: 502 })
  }

  const loginData = await loginRes.json()

  if (!loginData.accessToken) {
    return NextResponse.json({ error: 'No se obtuvo token de autenticacion' }, { status: 502 })
  }

  // 3. Resolver datos del titular (titular_* si viene, sino lead)
  const resolvedNombre = titularData.nombre ?? lead.nombre ?? ''
  const resolvedApellido = titularData.apellido ?? lead.apellido ?? ''
  const resolvedDni = titularData.dni ?? lead.dni ?? ''
  const resolvedNumero = titularData.numero ?? lead.numero ?? ''
  const resolvedCorreo = titularData.correo ?? lead.correo ?? ''
  const resolvedDireccion = titularData.direccion ?? ''

  // 4. Separar apellidos (paterno y materno)
  const apellidos = resolvedApellido.trim().split(/\s+/).filter(Boolean)
  const lastname = apellidos[0] || ''
  const secondLastname = apellidos.slice(1).join(' ') || ''

  // 5. Registrar prospecto en API NSV
  const body = {
    customer: {
      doctype: 'DNI',
      docnumber: resolvedDni,
      name: resolvedNombre,
      lastname,
      second_lastname: secondLastname,
      phonenumber: resolvedNumero,
      email: resolvedCorreo,
      address: resolvedDireccion,
    },
    sales: {
      agent_docnumber: lead.bd_asesores.dni,
      origin: 'LEADS',
      suborigin: 'BOT',
      interest_level: 'CALIENTE',
    },
  }

  const prospRes = await fetch(process.env.NSV_PROSPECTO_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loginData.accessToken}`,
    },
    body: JSON.stringify(body),
  })

  if (!prospRes.ok) {
    const errorText = await prospRes.text()
    return NextResponse.json(
      { error: 'Error al registrar prospecto en NSV', detail: errorText },
      { status: 502 },
    )
  }

  const result = await prospRes.json()

  const asignacion = await prisma.hist_asignaciones.findFirst({
    where: { id_lead: leadId, estado_gestion: 'en_espera' },
    orderBy: { fecha_asignacion: 'desc' },
  })

  await prisma.$transaction(async (tx) => {
    const accion = await tx.crm_acciones_comerciales.create({
      data: {
        id_lead: leadId,
        id_asignacion: asignacion?.id_asignacion || null,
        id_usuario: userId,
        tipo_accion: 'Llamada',
        estado_asesor: 'Prospecto',
        observaciones: 'Lead registrado como prospecto',
      },
    })

    await tx.hist_estado_asesor.create({
      data: {
        id_lead: leadId,
        id_accion: accion.id_accion,
        id_usuario: userId,
        estado_anterior: lead.ultimo_estado_asesor || null,
        estado_nuevo: 'Prospecto',
      },
    })

    await tx.bd_leads.update({
      where: { id_lead: leadId },
      data: {
        ultimo_estado_asesor: 'Prospecto',
        fecha_actualizacion: new Date(),
        titular_nombre: titularData.nombre,
        titular_apellido: titularData.apellido,
        titular_dni: titularData.dni,
        titular_numero: titularData.numero,
        titular_correo: titularData.correo,
        titular_direccion: titularData.direccion,
      },
    })
  })

  return NextResponse.json({ success: true, data: result })
}
