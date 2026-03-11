import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchBQLeads, fetchBQTables } from '@/lib/bigquery'

export const dynamic = 'force-dynamic'

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

// Normalize phone to +51XXXXXXXXX format
// Handles: +51924467759, 51924467759, 924467759, 0051924467759
function normalizePhone(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  // Strip everything except digits
  const digits = String(raw).replace(/\D/g, '')
  if (!digits) return null

  // If starts with 0051 (international prefix)
  if (digits.startsWith('0051') && digits.length >= 13) {
    return '+' + digits.slice(2, 13) // +51XXXXXXXXX
  }
  // If starts with 51 and has 11 digits (51 + 9 digit number)
  if (digits.startsWith('51') && digits.length >= 11) {
    return '+' + digits.slice(0, 11) // +51XXXXXXXXX
  }
  // If it's just 9 digits (Peru mobile)
  if (digits.length === 9) {
    return '+51' + digits // +51XXXXXXXXX
  }
  // Fallback: return with + prefix if long enough
  if (digits.length >= 10) {
    return '+' + digits
  }
  return null
}

// Map a BigQuery row to bd_leads fields
// BigQuery column name → bd_leads field name
const BQ_TO_PRISMA: Record<string, string> = {
  'Nombres': 'nombre',
  'Apellidos': 'apellido',
  'Telefono': 'numero',
  'telefono_normalizado': 'numero',
  'Email': 'correo',
  'email_normalizado': 'correo',
  'Sede': 'zona',
  'Origen': 'origen_lead',
  'SubOrigen': 'suborigen_lead',
  'Linea': 'linea',
  'Estado': 'estado_de_lead',
  'Motivo_Descarte': 'motivo_de_descarte',
  'DNI': 'dni',
}

// Convert variable mapping from BQ column names to bd_leads field names
function normalizeVariables(variables: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {}
  for (const [key, bqColumn] of Object.entries(variables)) {
    // Strip {{ }} if present to get just the index
    const cleanKey = key.replace(/[{}]/g, '')
    normalized[cleanKey] = BQ_TO_PRISMA[bqColumn] || bqColumn.toLowerCase()
  }
  return normalized
}

function mapBQRowToLead(row: Record<string, unknown>) {
  const str = (v: unknown, max?: number) => {
    if (v == null || v === '') return null
    const s = String(v)
    return max ? s.slice(0, max) : s
  }

  return {
    numero: normalizePhone(row.telefono_normalizado || row.Telefono),
    correo: str(row.email_normalizado || row.Email, 100),
    nombre: str(row.Nombres, 100),
    apellido: str(row.Apellidos, 100),
    zona: str(row.Sede, 50),
    origen_lead: str(row.Origen, 50),
    suborigen_lead: str(row.SubOrigen, 50),
    linea: str(row.Linea, 50),
    estado_de_lead: 'en_gestion',
    motivo_de_descarte: str(row.Motivo_Descarte, 100),
  }
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

  // Parse filters
  const filters = typeof body.filters === 'string' ? JSON.parse(body.filters) : body.filters || {}

  // 1. Create campaign
  const campana = await prisma.crm_campanas.create({
    data: {
      nombre: body.name,
      base_datos: table,
      filtros: JSON.stringify(filters),
      total_leads: 0,
      id_plantilla: body.templateId || null,
      variables: body.variables ? normalizeVariables(body.variables) : {},
    },
  })

  // 2. Fetch all leads from BigQuery
  let bqLeads: Record<string, unknown>[]
  try {
    bqLeads = await fetchBQLeads(table, filters)
  } catch (err) {
    console.error('Error fetching BQ leads:', err)
    // Campaign created but no leads imported - still return success
    return NextResponse.json({
      id: campana.id_campana,
      leadsImported: 0,
      error: 'Campaign created but failed to import leads from BigQuery',
    }, { status: 201 })
  }

  // 3. Import leads in batches (sequential to avoid race conditions)
  const BATCH_SIZE = 100
  let leadsImported = 0
  let skippedNoPhone = 0
  let skippedDuplicate = 0
  let errors = 0

  for (let i = 0; i < bqLeads.length; i += BATCH_SIZE) {
    const batch = bqLeads.slice(i, i + BATCH_SIZE)

    for (const row of batch) {
      try {
        const leadData = mapBQRowToLead(row)

        if (!leadData.numero) {
          skippedNoPhone++
          continue
        }

        // Upsert: find existing lead by numero, or create new
        let lead = await prisma.bd_leads.findFirst({
          where: { numero: leadData.numero },
        })

        if (!lead) {
          lead = await prisma.bd_leads.create({
            data: leadData,
          })
        } else {
          // Fill in empty fields from BigQuery data
          const updates: Record<string, string | null> = {}
          const fillable = ['correo', 'nombre', 'apellido', 'zona', 'origen_lead', 'suborigen_lead', 'linea', 'estado_de_lead', 'motivo_de_descarte'] as const
          for (const field of fillable) {
            if (!lead[field] && leadData[field]) {
              updates[field] = leadData[field]
            }
          }
          if (Object.keys(updates).length > 0) {
            await prisma.bd_leads.update({
              where: { id_lead: lead.id_lead },
              data: updates,
            })
          }
        }

        // Create campaign-lead link (ignore if already exists)
        try {
          await prisma.crm_campana_leads.create({
            data: {
              id_campana: campana.id_campana,
              id_lead: lead.id_lead,
              estado_envio: 'pendiente',
            },
          })
          leadsImported++
        } catch {
          skippedDuplicate++
        }
      } catch (err) {
        errors++
        console.error('Error importing lead:', err)
      }
    }
  }

  // 4. Update total_leads count
  await prisma.crm_campanas.update({
    where: { id_campana: campana.id_campana },
    data: { total_leads: leadsImported },
  })

  console.log(`Campaign ${campana.id_campana}: ${leadsImported} imported, ${skippedNoPhone} no phone, ${skippedDuplicate} duplicate, ${errors} errors (from ${bqLeads.length} BQ rows)`)

  return NextResponse.json({
    id: campana.id_campana,
    leadsImported,
    totalBQ: bqLeads.length,
    skippedNoPhone,
    skippedDuplicate,
    errors,
  }, { status: 201 })
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
