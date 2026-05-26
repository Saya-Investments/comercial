import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const newTemplateId: string | undefined = body.templateId
  const newCampaignName: string | undefined = body.newCampaignName

  if (!newTemplateId) {
    return NextResponse.json({ error: 'templateId requerido' }, { status: 400 })
  }

  const original = await prisma.crm_campanas.findUnique({
    where: { id_campana: id },
    include: {
      crm_campana_leads: {
        where: { estado_envio: 'pendiente' },
        select: { id: true, id_lead: true },
      },
    },
  })

  if (!original) {
    return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
  }

  const allLeads = shuffle(original.crm_campana_leads)
  const half = Math.ceil(allLeads.length / 2)
  const keepLeads = allLeads.slice(0, half)
  const moveLeads = allLeads.slice(half)

  if (moveLeads.length === 0) {
    return NextResponse.json({ error: 'No hay suficientes leads para dividir' }, { status: 400 })
  }

  const splitName = newCampaignName || `${original.nombre}_v2`
  const moveIds = moveLeads.map((l) => l.id)

  const result = await prisma.$transaction(async (tx) => {
    const newCampaign = await tx.crm_campanas.create({
      data: {
        nombre: splitName,
        base_datos: original.base_datos,
        filtros: original.filtros,
        total_leads: moveLeads.length,
        id_plantilla: newTemplateId,
        variables: original.variables ?? {},
        estado: 'Activa',
      },
    })

    await tx.crm_campana_leads.updateMany({
      where: { id: { in: moveIds } },
      data: { id_campana: newCampaign.id_campana },
    })

    await tx.crm_campanas.update({
      where: { id_campana: id },
      data: { total_leads: keepLeads.length },
    })

    return {
      originalLeads: keepLeads.length,
      newCampaignId: newCampaign.id_campana,
      newCampaignName: newCampaign.nombre,
      newLeads: moveLeads.length,
    }
  })

  return NextResponse.json(result, { status: 201 })
}
