import path from 'node:path'
import fs from 'node:fs'
import { read, utils } from 'xlsx'
import { prisma } from '@/lib/prisma'

// Rango fijo del piloto: desde 14-abr-2026.
export const RANGO_DESDE = '2026-04-14T00:00:00-05:00'

const XLSX_FILES = [
  path.resolve(process.cwd(), 'scripts', 'prospectos', 'Prospectos_30_parte1.xlsx'),
  path.resolve(process.cwd(), 'scripts', 'prospectos', 'Prospectos_30_parte2.xlsx'),
  path.resolve(process.cwd(), 'scripts', 'prospectos', 'Prospectos_04_mayo.xlsx'),
]

function normPhone(v: unknown): string {
  const s = (v ?? '').toString().replace(/\D/g, '')
  return s.length >= 9 ? s.slice(-9) : s
}

const LIMA_OFFSET_MS = 5 * 3600 * 1000
function parseExcelDate(v: unknown): Date | null {
  if (v == null || v === '') return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  if (typeof v === 'number' && Number.isFinite(v)) {
    const epoch = Date.UTC(1899, 11, 30)
    return new Date(epoch + v * 86400000 + LIMA_OFFSET_MS)
  }
  const s = String(v).trim()
  if (!s) return null
  const normalized = s.replace(/\//g, '-')
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)
  const d = new Date(hasTz ? normalized : normalized + '-05:00')
  return Number.isNaN(d.getTime()) ? null : d
}

export type ProspExcel = {
  phone: string
  fechaRegistro: Date | null
  estado: string
}

export function readProspectos(): ProspExcel[] {
  const out: ProspExcel[] = []
  for (const filePath of XLSX_FILES) {
    if (!fs.existsSync(filePath)) continue
    const buf = fs.readFileSync(filePath)
    const wb = read(buf, { type: 'buffer' })
    const sheetName = wb.SheetNames.includes('Prospectos') ? 'Prospectos' : wb.SheetNames[0]
    const ws = wb.Sheets[sheetName]
    if (!ws) continue
    const rows = utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true })
    for (const r of rows) {
      const phone = normPhone(r['Telefono'])
      if (!phone) continue
      out.push({
        phone,
        fechaRegistro: parseExcelDate(r['Fecha Registro']),
        estado: (r['Estado'] ?? '').toString().trim(),
      })
    }
  }
  return out
}

export type LeadCrm = {
  id_lead: string
  numero: string | null
  dni: string | null
  nombre: string | null
  apellido: string | null
  base: string | null
  fecha_creacion: Date
  asesor: string | null
}

export async function fetchLeadsCrm(): Promise<LeadCrm[]> {
  return prisma.$queryRaw<LeadCrm[]>`
    SELECT
      l.id_lead::text AS id_lead,
      l.numero,
      l.dni,
      l.nombre,
      l.apellido,
      l."Base" AS base,
      l.fecha_creacion,
      a.nombre_asesor AS asesor
    FROM comercial.bd_leads l
    LEFT JOIN comercial.bd_asesores a ON a.id_asesor = l.ultimo_asesor_asignado
    WHERE l.fecha_creacion >= ${RANGO_DESDE}::timestamptz
      AND l.fecha_creacion <= NOW()
      AND EXISTS (
        SELECT 1 FROM comercial.crm_acciones_comerciales ac
        WHERE ac.id_lead = l.id_lead
      )
  `
}

export type ProspectMatch = {
  id_lead: string
  dni: string | null
  numero: string | null
  nombre: string | null
  apellido: string | null
  base: string | null
  fecha_creacion: string
  fecha_registro_prosp: string | null
  asesor: string | null
  estado: string
  mes: string
}

export function leadMonthLima(d: Date): string {
  const lima = new Date(d.getTime() - LIMA_OFFSET_MS)
  const y = lima.getUTCFullYear()
  const m = String(lima.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

// Cruza los Excels con los leads CRM. Devuelve los matches y la lista de
// meses disponibles (sobre el universo CRM, no sobre los matches, para que
// el selector del front no pierda opciones cuando filtra por mes).
export async function crossProspectsWithLeads(): Promise<{
  matches: ProspectMatch[]
  totalLeadsCrm: number
  mesesDisponibles: string[]
}> {
  const [prospectos, leadsCrm] = await Promise.all([
    Promise.resolve().then(readProspectos),
    fetchLeadsCrm(),
  ])

  const idxProsp = new Map<string, ProspExcel[]>()
  for (const p of prospectos) {
    const arr = idxProsp.get(p.phone)
    if (arr) arr.push(p)
    else idxProsp.set(p.phone, [p])
  }

  const matches: ProspectMatch[] = []
  for (const l of leadsCrm) {
    const phone = normPhone(l.numero)
    if (!phone) continue
    const candidatos = idxProsp.get(phone)
    if (!candidatos) continue

    const tCrm = new Date(l.fecha_creacion).getTime()
    let mejor: ProspExcel | null = null
    for (const c of candidatos) {
      if (!(c.fechaRegistro instanceof Date)) continue
      if (c.fechaRegistro.getTime() <= tCrm) continue
      if (!mejor || c.fechaRegistro.getTime() > (mejor.fechaRegistro as Date).getTime()) {
        mejor = c
      }
    }
    if (!mejor) continue

    matches.push({
      id_lead: l.id_lead,
      dni: l.dni,
      numero: l.numero,
      nombre: l.nombre,
      apellido: l.apellido,
      base: l.base,
      fecha_creacion: l.fecha_creacion.toISOString(),
      fecha_registro_prosp: mejor.fechaRegistro ? mejor.fechaRegistro.toISOString() : null,
      asesor: l.asesor,
      estado: mejor.estado || '(sin estado)',
      mes: leadMonthLima(l.fecha_creacion),
    })
  }

  const mesesDisponibles = Array.from(
    new Set(leadsCrm.map(l => leadMonthLima(l.fecha_creacion))),
  ).sort()

  return { matches, totalLeadsCrm: leadsCrm.length, mesesDisponibles }
}
