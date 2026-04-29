import { NextResponse } from 'next/server'
import path from 'node:path'
import fs from 'node:fs'
import { read, utils } from 'xlsx'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Rango fijo del funnel (acordado con negocio): desde 14-abr-2026 hasta hoy.
const RANGO_DESDE = '2026-04-14T00:00:00-05:00'

const XLSX_PATH = path.resolve(process.cwd(), 'scripts', 'prospectos', 'Prospectos_29.xlsx')

// Ambos lados a string + solo digitos + ultimos 9. Mismo criterio que
// scripts/cruce-excels.mjs para mantener consistencia con el CSV de cruce.
function normPhone(v: unknown): string {
  const s = (v ?? '').toString().replace(/\D/g, '')
  return s.length >= 9 ? s.slice(-9) : s
}

// xlsx devuelve numero (serial Excel: dias desde 1899-12-30) si la celda esta
// formateada como fecha, y string si es texto. Soportamos ambos + Date directo.
// El serial de Excel es wall-clock sin timezone; el back-office lo llena en hora
// Lima (UTC-5, sin DST), por eso sumamos 5h para obtener el UTC equivalente y
// poder comparar contra fecha_creacion del CRM (que ya esta en UTC).
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
  // Si el string trae timezone (Z, +hh:mm, -hh:mm) lo respetamos; si no, lo
  // tratamos como hora Lima.
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)
  const d = new Date(hasTz ? normalized : normalized + '-05:00')
  return Number.isNaN(d.getTime()) ? null : d
}

type ProspExcel = {
  phone: string
  fechaRegistro: Date | null
  estado: string
}

function readProspectos(): ProspExcel[] {
  // xlsx.readFile internamente usa `fs` con el path como argv: falla con paths
  // que tienen caracteres no-ASCII (tildes, ñ) en Windows bajo el runtime de
  // Next.js. Por eso leemos el buffer nosotros y pasamos a `read()`.
  const buf = fs.readFileSync(XLSX_PATH)
  const wb = read(buf, { type: 'buffer' })
  const sheetName = wb.SheetNames.includes('Prospectos') ? 'Prospectos' : wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  if (!ws) return []
  const rows = utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true })
  const out: ProspExcel[] = []
  for (const r of rows) {
    const phone = normPhone(r['Telefono'])
    if (!phone) continue
    out.push({
      phone,
      fechaRegistro: parseExcelDate(r['Fecha Registro']),
      estado: (r['Estado'] ?? '').toString().trim(),
    })
  }
  return out
}

type LeadCrm = {
  id_lead: string
  numero: string | null
  dni: string | null
  nombre: string | null
  apellido: string | null
  base: string | null
  fecha_creacion: Date
  asesor: string | null
}

// Leads CRM con al menos una accion comercial y fecha_creacion >= 14-abr-2026.
// EXISTS es mas barato que INNER JOIN + GROUP BY porque no materializa las acciones.
// LEFT JOIN a bd_asesores para traer el nombre del ultimo asesor asignado (puede ser null).
// La columna fisica "Base" tiene mayuscula (ver schema.prisma @map("Base")), por eso
// va entre comillas dobles en el SELECT — Postgres hace case-fold a minusculas si no.
async function fetchLeadsCrm(): Promise<LeadCrm[]> {
  const rows = await prisma.$queryRaw<LeadCrm[]>`
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
  return rows
}

type LeadMatch = {
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
}

export async function GET() {
  const [prospectos, leadsCrm] = await Promise.all([
    Promise.resolve().then(readProspectos),
    fetchLeadsCrm(),
  ])

  // Indice: telefono -> lista de registros del excel. Un mismo telefono puede
  // aparecer varias veces (reingresos, etc.), por eso guardamos todos y elegimos
  // despues el mas reciente que cumpla la condicion temporal.
  const idxProsp = new Map<string, ProspExcel[]>()
  for (const p of prospectos) {
    const arr = idxProsp.get(p.phone)
    if (arr) arr.push(p)
    else idxProsp.set(p.phone, [p])
  }

  const counts: Record<string, number> = {}
  const leadsMatched: LeadMatch[] = []

  for (const l of leadsCrm) {
    const phone = normPhone(l.numero)
    if (!phone) continue
    const candidatos = idxProsp.get(phone)
    if (!candidatos) continue

    const tCrm = new Date(l.fecha_creacion).getTime()
    // Solo vale el match si la fecha del excel es MAYOR que fecha_creacion del
    // lead CRM: significa que el prospecto nacio en el back-office DESPUES de
    // que el asesor lo gestiono en el CRM.
    let mejor: ProspExcel | null = null
    for (const c of candidatos) {
      if (!(c.fechaRegistro instanceof Date)) continue
      if (c.fechaRegistro.getTime() <= tCrm) continue
      if (!mejor || c.fechaRegistro.getTime() > (mejor.fechaRegistro as Date).getTime()) {
        mejor = c
      }
    }
    if (!mejor) continue

    const key = mejor.estado || '(sin estado)'
    counts[key] = (counts[key] || 0) + 1
    leadsMatched.push({
      id_lead: l.id_lead,
      dni: l.dni,
      numero: l.numero,
      nombre: l.nombre,
      apellido: l.apellido,
      base: l.base,
      fecha_creacion: l.fecha_creacion.toISOString(),
      fecha_registro_prosp: mejor.fechaRegistro ? mejor.fechaRegistro.toISOString() : null,
      asesor: l.asesor,
      estado: key,
    })
  }

  return NextResponse.json({
    counts,
    totalCruzados: leadsMatched.length,
    totalLeadsCrm: leadsCrm.length,
    leads: leadsMatched,
    rango: { desde: RANGO_DESDE, hastaIso: new Date().toISOString() },
  })
}
