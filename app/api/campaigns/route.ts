import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchBQLeads, fetchBQTables } from '@/lib/bigquery'

export const dynamic = 'force-dynamic'

const DEFAULT_CAMPAIGN_ZONE = 'LIMA'
const SELECT_BATCH_SIZE = 500
const CREATE_BATCH_SIZE = 250
const UPDATE_BATCH_SIZE = 50
const LINK_BATCH_SIZE = 1000

const BQ_TO_PRISMA: Record<string, string> = {
  nombres: 'nombre',
  apellidos: 'apellido',
  telefono: 'numero',
  telefono_normalizado: 'numero',
  email: 'correo',
  email_normalizado: 'correo',
  bucket: 'bucket',
  base: 'base',
  sede: 'zona',
  origen: 'origen_lead',
  suborigen: 'suborigen_lead',
  linea: 'linea',
  estado: 'estado_de_lead',
  motivo_descarte: 'motivo_de_descarte',
  dni: 'dni',
}

type BQRow = Record<string, unknown>

type ImportedLead = {
  numero: string
  correo: string | null
  nombre: string | null
  apellido: string | null
  zona: string
  bucket: string | null
  base: string
  origen_lead: string | null
  suborigen_lead: string | null
  linea: string | null
  estado_de_lead: string
  motivo_de_descarte: string | null
}

type ExistingLead = {
  id_lead: string
  numero: string | null
  correo: string | null
  nombre: string | null
  apellido: string | null
  zona: string | null
  origen_lead: string | null
  suborigen_lead: string | null
  linea: string | null
  estado_de_lead: string | null
  motivo_de_descarte: string | null
}

type LeadCampaignMetadataUpdate = {
  idLead: string
  bucket: string | null
}

type LeadBucketUpdate = {
  idLead: string
  bucket: string
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }

  return chunks
}

function firstDefined(row: BQRow, ...keys: string[]): unknown {
  const lowered: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = key.trim().toLowerCase()
    if (!(normalizedKey in lowered)) {
      lowered[normalizedKey] = value
    }
  }

  for (const key of keys) {
    const value = lowered[key.trim().toLowerCase()]
    if (value != null && value !== '') return value
  }

  return null
}

function str(value: unknown, max?: number): string | null {
  if (value == null || value === '') return null

  const normalized = String(value).trim()
  if (!normalized) return null

  return max ? normalized.slice(0, max) : normalized
}

// Normalize phone to +51XXXXXXXXX format
// Handles: +51924467759, 51924467759, 924467759, 0051924467759
function normalizePhone(raw: unknown): string | null {
  if (raw == null || raw === '') return null

  const digits = String(raw).replace(/\D/g, '')
  if (!digits) return null

  if (digits.startsWith('0051') && digits.length >= 13) {
    return '+' + digits.slice(2, 13)
  }

  if (digits.startsWith('51') && digits.length >= 11) {
    return '+' + digits.slice(0, 11)
  }

  if (digits.length === 9) {
    return '+51' + digits
  }

  if (digits.length >= 10) {
    return '+' + digits
  }

  return null
}

function normalizeVariables(variables: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {}

  for (const [key, bqColumn] of Object.entries(variables)) {
    const cleanKey = key.replace(/[{}]/g, '')
    const normalizedColumn = String(bqColumn || '').trim().toLowerCase()
    normalized[cleanKey] = BQ_TO_PRISMA[normalizedColumn] || normalizedColumn
  }

  return normalized
}

function mapBQRowToLead(row: BQRow): ImportedLead | null {
  const numero = normalizePhone(
    firstDefined(row, 'telefono_normalizado', 'telefono', 'celular', 'numero', 'phone')
  )

  if (!numero) return null

  return {
    numero,
    correo: str(firstDefined(row, 'email_normalizado', 'email', 'correo'), 100),
    nombre: str(firstDefined(row, 'nombres', 'nombre'), 100),
    apellido: str(firstDefined(row, 'apellidos', 'apellido'), 100),
    zona: DEFAULT_CAMPAIGN_ZONE,
    bucket: str(firstDefined(row, 'bucket'), 50),
    base: 'Stock',
    origen_lead: str(firstDefined(row, 'origen'), 50),
    suborigen_lead: str(firstDefined(row, 'suborigen'), 50),
    linea: str(firstDefined(row, 'linea'), 50),
    estado_de_lead: 'en_gestion',
    motivo_de_descarte: str(firstDefined(row, 'motivo_descarte'), 100),
  }
}

function mergeImportedLead(current: ImportedLead, incoming: ImportedLead): ImportedLead {
  return {
    ...current,
    correo: current.correo || incoming.correo,
    nombre: current.nombre || incoming.nombre,
    apellido: current.apellido || incoming.apellido,
    bucket: current.bucket || incoming.bucket,
    origen_lead: current.origen_lead || incoming.origen_lead,
    suborigen_lead: current.suborigen_lead || incoming.suborigen_lead,
    linea: current.linea || incoming.linea,
    motivo_de_descarte: current.motivo_de_descarte || incoming.motivo_de_descarte,
  }
}

function buildLeadUpdate(existing: ExistingLead, incoming: ImportedLead) {
  const update: Record<string, string> = {}

  if (!existing.correo && incoming.correo) update.correo = incoming.correo
  if (!existing.nombre && incoming.nombre) update.nombre = incoming.nombre
  if (!existing.apellido && incoming.apellido) update.apellido = incoming.apellido
  if (!existing.zona && incoming.zona) update.zona = incoming.zona
  if (!existing.origen_lead && incoming.origen_lead) update.origen_lead = incoming.origen_lead
  if (!existing.suborigen_lead && incoming.suborigen_lead) update.suborigen_lead = incoming.suborigen_lead
  if (!existing.linea && incoming.linea) update.linea = incoming.linea
  if (!existing.estado_de_lead && incoming.estado_de_lead) update.estado_de_lead = incoming.estado_de_lead
  if (!existing.motivo_de_descarte && incoming.motivo_de_descarte) {
    update.motivo_de_descarte = incoming.motivo_de_descarte
  }

  return update
}

async function applyMetadataToNewLeads(
  tx: Prisma.TransactionClient,
  updates: LeadCampaignMetadataUpdate[]
) {
  for (const updateChunk of chunkArray(updates, UPDATE_BATCH_SIZE)) {
    await Promise.all(
      updateChunk.map((lead) =>
        tx.$executeRawUnsafe(
          'UPDATE comercial.bd_leads SET "Bucket" = $1, "Base" = $2 WHERE id_lead = $3',
          lead.bucket,
          'Stock',
          lead.idLead
        )
      )
    )
  }
}

async function applyBucketToExistingLeadsIfMissing(
  tx: Prisma.TransactionClient,
  updates: LeadBucketUpdate[]
) {
  for (const updateChunk of chunkArray(updates, UPDATE_BATCH_SIZE)) {
    await Promise.all(
      updateChunk.map((lead) =>
        tx.$executeRawUnsafe(
          'UPDATE comercial.bd_leads SET "Bucket" = COALESCE("Bucket", $1) WHERE id_lead = $2',
          lead.bucket,
          lead.idLead
        )
      )
    )
  }
}

export async function GET() {
  const campanas = await prisma.crm_campanas.findMany({
    include: {
      _count: { select: { crm_campana_leads: true } },
      crm_plantillas: { select: { nombre: true } },
    },
    orderBy: { fecha_creacion: 'desc' },
  })

  const mapped = campanas.map((c) => ({
    id: c.id_campana,
    name: c.nombre,
    database: c.base_datos || '',
    filters: c.filtros || '',
    template: c.crm_plantillas?.nombre || '',
    templateId: c.id_plantilla || '',
    status: c.estado as 'Activa' | 'Pausada' | 'Completada',
    leads: c._count.crm_campana_leads || c.total_leads || 0,
    createdDate: c.fecha_creacion.toISOString().split('T')[0],
  }))

  return NextResponse.json(mapped)
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const table = body.database as string
  if (!table) {
    return NextResponse.json({ error: 'Database/table required' }, { status: 400 })
  }

  const validTables = await fetchBQTables()
  if (!validTables.includes(table)) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
  }

  const filters = typeof body.filters === 'string' ? JSON.parse(body.filters) : body.filters || {}

  let bqLeads: BQRow[]
  try {
    bqLeads = await fetchBQLeads(table, filters)
  } catch (err) {
    console.error('Error fetching BQ leads:', err)
    return NextResponse.json(
      {
        error: 'Failed to fetch leads from BigQuery. No campaign was created.',
      },
      { status: 500 }
    )
  }

  let skippedNoPhone = 0
  const importedByPhone = new Map<string, ImportedLead>()

  for (const row of bqLeads) {
    const mappedLead = mapBQRowToLead(row)

    if (!mappedLead) {
      skippedNoPhone++
      continue
    }

    const current = importedByPhone.get(mappedLead.numero)
    importedByPhone.set(
      mappedLead.numero,
      current ? mergeImportedLead(current, mappedLead) : mappedLead
    )
  }

  const importedLeads = Array.from(importedByPhone.values())

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const campana = await tx.crm_campanas.create({
          data: {
            nombre: body.name,
            base_datos: table,
            filtros: JSON.stringify(filters),
            total_leads: 0,
            id_plantilla: body.templateId || null,
            variables: body.variables ? normalizeVariables(body.variables) : {},
          },
        })

        const numbers = importedLeads.map((lead) => lead.numero)
        const existingByPhone = new Map<string, ExistingLead>()

        for (const numberChunk of chunkArray(numbers, SELECT_BATCH_SIZE)) {
          const existingChunk = await tx.bd_leads.findMany({
            where: { numero: { in: numberChunk } },
            select: {
              id_lead: true,
              numero: true,
              correo: true,
              nombre: true,
              apellido: true,
              zona: true,
              origen_lead: true,
              suborigen_lead: true,
              linea: true,
              estado_de_lead: true,
              motivo_de_descarte: true,
            },
          })

          for (const lead of existingChunk) {
            if (lead.numero) {
              existingByPhone.set(lead.numero, lead)
            }
          }
        }

        const leadsToCreate = importedLeads
          .filter((lead) => !existingByPhone.has(lead.numero))
          .map((lead) => ({
            numero: lead.numero,
            correo: lead.correo,
            nombre: lead.nombre,
            apellido: lead.apellido,
            zona: lead.zona,
            origen_lead: lead.origen_lead,
            suborigen_lead: lead.suborigen_lead,
            linea: lead.linea,
            estado_de_lead: lead.estado_de_lead,
            motivo_de_descarte: lead.motivo_de_descarte,
          }))

        const leadIdByPhone = new Map<string, string>()

        for (const [numero, lead] of existingByPhone.entries()) {
          leadIdByPhone.set(numero, lead.id_lead)
        }

        const newLeadMetadataUpdates: LeadCampaignMetadataUpdate[] = []

        for (const createChunk of chunkArray(leadsToCreate, CREATE_BATCH_SIZE)) {
          const createdLeads = await tx.bd_leads.createManyAndReturn({
            data: createChunk,
            select: {
              id_lead: true,
              numero: true,
            },
          })

          for (const lead of createdLeads) {
            if (lead.numero) {
              leadIdByPhone.set(lead.numero, lead.id_lead)

              const importedLead = importedByPhone.get(lead.numero)
              newLeadMetadataUpdates.push({
                idLead: lead.id_lead,
                bucket: importedLead?.bucket || null,
              })
            }
          }
        }

        await applyMetadataToNewLeads(tx, newLeadMetadataUpdates)

        const pendingUpdates = importedLeads
          .map((lead) => {
            const existing = existingByPhone.get(lead.numero)
            if (!existing) return null

            const data = buildLeadUpdate(existing, lead)
            if (Object.keys(data).length === 0) return null

            return {
              id_lead: existing.id_lead,
              data,
            }
          })
          .filter((item): item is { id_lead: string; data: Record<string, string> } => item !== null)

        let updatedExisting = 0

        for (const updateChunk of chunkArray(pendingUpdates, UPDATE_BATCH_SIZE)) {
          await Promise.all(
            updateChunk.map((lead) =>
              tx.bd_leads.update({
                where: { id_lead: lead.id_lead },
                data: lead.data,
              })
            )
          )

          updatedExisting += updateChunk.length
        }

        const existingLeadBucketUpdates = importedLeads
          .map((lead) => {
            if (!lead.bucket) return null

            const existing = existingByPhone.get(lead.numero)
            if (!existing) return null

            return {
              idLead: existing.id_lead,
              bucket: lead.bucket,
            }
          })
          .filter((item): item is LeadBucketUpdate => item !== null)

        await applyBucketToExistingLeadsIfMissing(tx, existingLeadBucketUpdates)

        const campaignLinks = importedLeads
          .map((lead) => {
            const idLead = leadIdByPhone.get(lead.numero)
            if (!idLead) return null

            return {
              id_campana: campana.id_campana,
              id_lead: idLead,
              estado_envio: 'pendiente',
            }
          })
          .filter(
            (
              item
            ): item is {
              id_campana: string
              id_lead: string
              estado_envio: string
            } => item !== null
          )

        if (importedLeads.length > 0 && campaignLinks.length === 0) {
          throw new Error('No campaign-lead relations were prepared for insertion.')
        }

        let leadsImported = 0

        for (const linkChunk of chunkArray(campaignLinks, LINK_BATCH_SIZE)) {
          const linkResult = await tx.crm_campana_leads.createMany({
            data: linkChunk,
            skipDuplicates: true,
          })

          leadsImported += linkResult.count
        }

        if (campaignLinks.length > 0 && leadsImported === 0) {
          throw new Error('No rows were inserted into crm_campana_leads.')
        }

        await tx.crm_campanas.update({
          where: { id_campana: campana.id_campana },
          data: { total_leads: leadsImported },
        })

        return {
          id: campana.id_campana,
          leadsImported,
          leadsCreated: leadsToCreate.length,
          updatedExisting,
        }
      },
      {
        maxWait: 10000,
        timeout: 120000,
      }
    )

    const skippedDuplicate = bqLeads.length - skippedNoPhone - result.leadsImported

    console.log(
      `Campaign ${result.id}: ${result.leadsImported} linked, ${result.leadsCreated} new, ${result.updatedExisting} updated, ${skippedNoPhone} no phone, ${skippedDuplicate} duplicate or already linked (from ${bqLeads.length} BQ rows)`
    )

    return NextResponse.json(
      {
        id: result.id,
        leadsImported: result.leadsImported,
        totalBQ: bqLeads.length,
        leadsCreated: result.leadsCreated,
        updatedExisting: result.updatedExisting,
        skippedNoPhone,
        skippedDuplicate,
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('Error creating campaign transaction:', err)
    return NextResponse.json(
      { error: 'Failed to create campaign. No campaign, leads, or relations were saved.' },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json()

  await prisma.crm_campanas.update({
    where: { id_campana: body.id },
    data: {
      estado: body.status,
      fecha_actualizacion: new Date(),
    },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.crm_campanas.delete({ where: { id_campana: id } })
  return NextResponse.json({ ok: true })
}
