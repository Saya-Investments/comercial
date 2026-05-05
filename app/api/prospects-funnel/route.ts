import { NextResponse } from 'next/server'
import path from 'node:path'
import fs from 'node:fs'
import { read, utils } from 'xlsx'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Rango fijo del funnel (acordado con negocio): desde 14-abr-2026 hasta hoy.
// Por encima de eso, el front puede filtrar por mes via ?mes=YYYY-MM. El mes
// se decide por la fecha_creacion del lead CRM en hora Lima, NO por la fecha
// del Excel ni por el archivo de origen.
const RANGO_DESDE = '2026-04-14T00:00:00-05:00'

// Lista de Excels que se cruzan contra el CRM. Las filas se mezclan en un
// unico indice por telefono — un mismo numero puede aparecer en varios
// archivos y la regla de "Fecha Registro mas reciente posterior a la
// fecha_creacion del lead" opera sobre el conjunto unificado.
// Prospectos_30 vino partido en parte1 + parte2 (ambos de abril).
const XLSX_FILES = [
  path.resolve(process.cwd(), 'scripts', 'prospectos', 'Prospectos_30_parte1.xlsx'),
  path.resolve(process.cwd(), 'scripts', 'prospectos', 'Prospectos_30_parte2.xlsx'),
  path.resolve(process.cwd(), 'scripts', 'prospectos', 'Prospectos_05_mayo.xlsx'),
]

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

// Devuelve el mes (YYYY-MM) de un Date en hora Lima (UTC-5, sin DST). Lo usamos
// para agrupar leads por mes de fecha_creacion: un lead creado el 30-abr 23:00
// UTC = 30-abr 18:00 Lima, asi que cae en abril, no en mayo.
function leadMonthLima(d: Date): string {
  const lima = new Date(d.getTime() - LIMA_OFFSET_MS)
  const y = lima.getUTCFullYear()
  const m = String(lima.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  // ?mes=YYYY-MM filtra leads por su fecha_creacion (hora Lima). Sin parametro
  // o vacio = devuelve todo el rango.
  const mesParam = url.searchParams.get('mes')?.trim() || null

  const [prospectos, leadsCrm] = await Promise.all([
    Promise.resolve().then(readProspectos),
    fetchLeadsCrm(),
  ])

  // Indice: telefono -> lista de registros del excel. Un mismo telefono puede
  // aparecer varias veces (reingresos, archivos distintos), por eso guardamos
  // todos y elegimos despues el mas reciente que cumpla la condicion temporal.
  const idxProsp = new Map<string, ProspExcel[]>()
  for (const p of prospectos) {
    const arr = idxProsp.get(p.phone)
    if (arr) arr.push(p)
    else idxProsp.set(p.phone, [p])
  }

  // Hago el cruce completo (sin filtro de mes) para poder derivar
  // mesesDisponibles independientemente de la seleccion actual del usuario.
  type LeadMatchConMes = LeadMatch & { mes: string }
  const allMatches: LeadMatchConMes[] = []

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

    allMatches.push({
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

  // Meses calculados sobre el universo CRM (no sobre matches), para que el
  // mes en curso aparezca aunque todavia no haya cruces — el usuario igual
  // quiere poder seleccionarlo y ver el funnel vacio.
  const mesesDisponibles = Array.from(
    new Set(leadsCrm.map(l => leadMonthLima(l.fecha_creacion))),
  ).sort()

  // Aplico el filtro por mes al final: la lista de meses disponibles ya quedo
  // calculada sobre el universo completo, asi el selector del front no
  // "pierde" opciones cuando el usuario selecciona un mes.
  const filtered = mesParam ? allMatches.filter(m => m.mes === mesParam) : allMatches

  const counts: Record<string, number> = {}
  const leadsMatched: LeadMatch[] = []
  for (const m of filtered) {
    counts[m.estado] = (counts[m.estado] || 0) + 1
    const { mes: _mes, ...lead } = m
    leadsMatched.push(lead)
  }

  return NextResponse.json({
    counts,
    totalCruzados: leadsMatched.length,
    totalLeadsCrm: leadsCrm.length,
    leads: leadsMatched,
    mesesDisponibles,
    mes: mesParam,
    rango: { desde: RANGO_DESDE, hastaIso: new Date().toISOString() },
  })
}
