import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const { leadId, userId } = await req.json()

  if (!leadId || !userId) {
    return NextResponse.json({ error: 'leadId y userId son requeridos' }, { status: 400 })
  }

  // 1. Obtener datos del lead con su asesor
  const lead = await prisma.bd_leads.findUnique({
    where: { id_lead: leadId },
    include: {
      bd_asesores: { select: { cod_asesor: true } },
    },
  })

  if (!lead) {
    return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
  }

  if (!lead.bd_asesores?.cod_asesor) {
    return NextResponse.json({ error: 'El lead no tiene asesor asignado con codigo' }, { status: 400 })
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

  // 3. Separar apellidos (paterno y materno)
  const apellidos = (lead.apellido || '').trim().split(/\s+/)
  const lastname = apellidos[0] || ''
  const secondLastname = apellidos.slice(1).join(' ') || ''

  // 4. Registrar prospecto en API NSV
  const body = {
    customer: {
      doctype: 'DNI',
      docnumber: lead.dni || '',
      name: lead.nombre || '',
      lastname,
      second_lastname: secondLastname,
      phonenumber: lead.numero || '',
      email: lead.correo || '',
      address: '',
    },
    sales: {
      agent_docnumber: '05364142',
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

  return NextResponse.json({ success: true, data: result })
}
