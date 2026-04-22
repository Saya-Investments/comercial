#!/usr/bin/env node
import 'dotenv/config';
import { Client } from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------- Args ----------------
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, ...rest] = a.replace(/^--/, '').split('=');
    return [k, rest.length ? rest.join('=') : true];
  })
);

const todayIso = new Date().toISOString().slice(0, 10);
const daysAgoIso = n => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const desde = args.desde || daysAgoIso(9);
const hasta = args.hasta || todayIso;
const verbose = Boolean(args.verbose);

const prospectosXlsx = args.prospectos
  ? path.resolve(args.prospectos)
  : path.resolve(__dirname, 'prospectos', 'Prospectos_22.xlsx');
const leadsXlsx = args.leads
  ? path.resolve(args.leads)
  : path.resolve(__dirname, 'leads', 'Leads_abril.xlsx');

const outDir = path.resolve(__dirname, 'out');
await fs.mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, `cruce_excels_${desde}_a_${hasta}.csv`);

if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en .env');

console.log(`\n=== Cruce CRM vs Excels (Prospectos + Leads) ===`);
console.log(`CRM fecha_creacion: ${desde}  →  ${hasta}`);
console.log(`Prospectos xlsx:    ${prospectosXlsx}`);
console.log(`Leads xlsx:         ${leadsXlsx}`);
console.log(`Salida:             ${outPath}\n`);

// ---------------- Normalization ----------------
// Casteo a string + solo digitos. DNI / telefono en los excels a veces
// vienen como number, asi que forzamos toString antes de limpiar.
const normPhone = v => {
  const s = (v ?? '').toString().replace(/\D/g, '');
  return s.length >= 9 ? s.slice(-9) : s;
};

// xlsx devuelve numero (serial de Excel: dias desde 1899-12-30) si la celda
// tiene formato de fecha, y string si esta formateada como texto. Soportamos
// ambos + el caso Date directo.
function parseExcelDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + v * 86400000);
  }
  const s = String(v).trim();
  if (!s) return null;
  // Formatos tipicos: "2026/04/22 10:04 AM", "2026-04-22", ISO, etc.
  const normalized = s.replace(/\//g, '-');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

const fmtDate = d => (d ? d.toISOString() : '');

// ---------------- Excel loading ----------------
function readSheet(filePath, preferredSheet) {
  const wb = XLSX.readFile(filePath);
  const sn = preferredSheet && wb.SheetNames.includes(preferredSheet) ? preferredSheet : wb.SheetNames[0];
  const ws = wb.Sheets[sn];
  if (!ws) throw new Error(`No se encontro hoja en ${filePath}`);
  return { rows: XLSX.utils.sheet_to_json(ws, { defval: null, raw: true }), sheet: sn };
}

function extractProspecto(r) {
  return {
    phoneRaw: r['Telefono'],
    fechaRegistro: parseExcelDate(r['Fecha Registro']),
    Cliente: r['Cliente'] ?? '',
    Vendedor: r['Vendedor'] ?? '',
    Supervisor: r['Supervisor'] ?? '',
    Gestor: r['Gestor'] ?? '',
    Gerente: r['Gerente'] ?? '',
    Estado: r['Estado'] ?? '',
    Origen: r['Origen'] ?? '',
    Suborigen: r['SubOrigen'] ?? '',
    FechaRedesSociales: parseExcelDate(r['Fecha Redes Sociales']),
  };
}

function extractLead(r) {
  // Fecha Asignacion viene como serial (p.ej. 46134) y Hora Asignacion como
  // fraccion de dia (0.418...). Si viene como numero combinamos ambos; si es
  // string, parseamos la cadena tal cual.
  const fa = r['Fecha Asignacion'];
  const ha = typeof r['Hora Asignacion'] === 'number' ? r['Hora Asignacion'] : 0;
  const fechaAsig = typeof fa === 'number' && Number.isFinite(fa)
    ? parseExcelDate(fa + ha)
    : parseExcelDate(fa);
  return {
    phoneRaw: r['Telefono'],
    fechaAsignacion: fechaAsig,
    Vendedor: r['Vendedor'] ?? '',
    Supervisor: r['Supervisor'] ?? '',
    Gestor: r['Gestor'] ?? '',
    Gerente: r['Gerente'] ?? '',
    Nombres: r['Nombres'] ?? '',
    Origen: r['Origen'] ?? '',
    Suborigen: r['SubOrigen'] ?? '',
    Estado: r['Estado'] ?? '',
    FechaProspecto: parseExcelDate(r['Fecha Prospecto']),
  };
}

// ---------------- CRM ----------------
async function fetchCrmLeads() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`SET search_path TO comercial, public`);
    const sql = `
      SELECT
        l.id_lead::text,
        l.dni,
        l.numero,
        l.nombre,
        l.apellido,
        l.fecha_creacion,
        a.nombre_asesor,
        COUNT(ac.id_accion)::int AS total_acciones
      FROM bd_leads l
      INNER JOIN crm_acciones_comerciales ac ON ac.id_lead = l.id_lead
      LEFT JOIN bd_asesores a ON a.id_asesor = l.ultimo_asesor_asignado
      WHERE l.fecha_creacion >= $1::timestamptz
        AND l.fecha_creacion <= $2::timestamptz
      GROUP BY l.id_lead, l.dni, l.numero, l.nombre, l.apellido, l.fecha_creacion, a.nombre_asesor
      ORDER BY l.fecha_creacion DESC
    `;
    const res = await client.query(sql, [`${desde}T00:00:00Z`, `${hasta}T23:59:59Z`]);
    return res.rows;
  } finally {
    await client.end();
  }
}

// ---------------- Indexing + cross ----------------
function indexByPhone(records, extractor) {
  const map = new Map();
  for (const r of records) {
    const e = extractor(r);
    const phone = normPhone(e.phoneRaw);
    if (!phone) continue;
    if (!map.has(phone)) map.set(phone, []);
    map.get(phone).push(e);
  }
  return map;
}

// Con strictTemporal=true (prospectos) exige que la fecha del excel sea MAYOR
// que fecha_creacion del lead CRM. Con strictTemporal=false (leads) acepta
// cualquier fecha y simplemente elige el candidato mas reciente.
function matchOne(candidatos, fechaCreacionLead, fechaKey, { strictTemporal = true } = {}) {
  if (!candidatos || candidatos.length === 0) return null;
  const sortByFechaDesc = arr => [...arr].sort((a, b) => {
    const ta = a[fechaKey] instanceof Date ? a[fechaKey].getTime() : 0;
    const tb = b[fechaKey] instanceof Date ? b[fechaKey].getTime() : 0;
    return tb - ta;
  });
  if (!strictTemporal) return sortByFechaDesc(candidatos)[0];
  const t = new Date(fechaCreacionLead).getTime();
  const validos = candidatos.filter(c => {
    const f = c[fechaKey];
    return f instanceof Date && f.getTime() > t;
  });
  if (validos.length === 0) return null;
  return sortByFechaDesc(validos)[0];
}

// ---------------- CSV ----------------
const csvEscape = v => {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

// ---------------- Main ----------------
console.log('1) Leyendo Excel de prospectos...');
const { rows: prospRows, sheet: prospSheet } = readSheet(prospectosXlsx, 'Prospectos');
console.log(`   hoja="${prospSheet}"  filas=${prospRows.length}\n`);

console.log('2) Leyendo Excel de leads...');
const { rows: leadsRows, sheet: leadsSheet } = readSheet(leadsXlsx, 'Reporte');
console.log(`   hoja="${leadsSheet}"  filas=${leadsRows.length}\n`);

console.log('3) Consultando CRM (leads con accion comercial)...');
const leadsCrm = await fetchCrmLeads();
console.log(`   total: ${leadsCrm.length}\n`);

console.log('4) Indexando excels por telefono...');
const idxProsp = indexByPhone(prospRows, extractProspecto);
const idxLeads = indexByPhone(leadsRows, extractLead);
console.log(`   prospectos unicos por tel: ${idxProsp.size}`);
console.log(`   leads unicos por tel:      ${idxLeads.size}\n`);

if (verbose) {
  const sampleProsp = prospRows.slice(0, 1).map(extractProspecto)[0];
  const sampleLead = leadsRows.slice(0, 1).map(extractLead)[0];
  console.log('   sample prospecto:', sampleProsp);
  console.log('   sample lead:     ', sampleLead, '\n');
}

console.log('5) Cruzando...');

const header = [
  'id_lead', 'dni', 'numero', 'nombre', 'apellido', 'fecha_creacion', 'asesor_crm', 'total_acciones',
  // ---- Prospectos_22 ----
  'prospecto_match',
  'prospecto_cliente',
  'prospecto_vendedor',
  'prospecto_supervisor',
  'prospecto_gestor',
  'prospecto_gerente',
  'prospecto_estado',
  'prospecto_origen',
  'prospecto_suborigen',
  'prospecto_fecha_redes_sociales',
  'prospecto_fecha_registro',
  // ---- Leads_22 ----
  'lead_match',
  'lead_vendedor',
  'lead_supervisor',
  'lead_gestor',
  'lead_gerente',
  'lead_nombres',
  'lead_origen',
  'lead_suborigen',
  'lead_estado',
  'lead_fecha_prospecto',
  'lead_fecha_asignacion',
  'match_cualquiera',
];

const rows = leadsCrm.map(l => {
  const phone = normPhone(l.numero);
  const mProsp = phone ? matchOne(idxProsp.get(phone), l.fecha_creacion, 'fechaRegistro') : null;
  const mLead  = phone ? matchOne(idxLeads.get(phone), l.fecha_creacion, 'fechaAsignacion', { strictTemporal: false }) : null;

  const matchAny = (mProsp || mLead) ? 'Y' : 'N';

  return [
    l.id_lead,
    l.dni ?? '',
    l.numero ?? '',
    l.nombre ?? '',
    l.apellido ?? '',
    l.fecha_creacion instanceof Date ? l.fecha_creacion.toISOString() : l.fecha_creacion,
    l.nombre_asesor ?? '',
    l.total_acciones ?? 0,
    // Prospectos
    mProsp ? 'Y' : 'N',
    mProsp?.Cliente ?? '',
    mProsp?.Vendedor ?? '',
    mProsp?.Supervisor ?? '',
    mProsp?.Gestor ?? '',
    mProsp?.Gerente ?? '',
    mProsp?.Estado ?? '',
    mProsp?.Origen ?? '',
    mProsp?.Suborigen ?? '',
    fmtDate(mProsp?.FechaRedesSociales),
    fmtDate(mProsp?.fechaRegistro),
    // Leads_22
    mLead ? 'Y' : 'N',
    mLead?.Vendedor ?? '',
    mLead?.Supervisor ?? '',
    mLead?.Gestor ?? '',
    mLead?.Gerente ?? '',
    mLead?.Nombres ?? '',
    mLead?.Origen ?? '',
    mLead?.Suborigen ?? '',
    mLead?.Estado ?? '',
    fmtDate(mLead?.FechaProspecto),
    fmtDate(mLead?.fechaAsignacion),
    matchAny,
  ];
});

const csv = [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\n');
await fs.writeFile(outPath, '﻿' + csv, 'utf8');

const totalProsp = rows.filter(r => r[8]  === 'Y').length;
const totalLead  = rows.filter(r => r[19] === 'Y').length;
const totalAmbos = rows.filter(r => r[8]  === 'Y' && r[19] === 'Y').length;
const totalAny   = rows.filter(r => r[r.length - 1] === 'Y').length;

console.log(`\n=== Resumen ===`);
console.log(`Leads CRM con accion comercial:         ${leadsCrm.length}`);
console.log(`Con match en Prospectos (fecha > CRM):  ${totalProsp}`);
console.log(`Con match en Leads (cualquier fecha):   ${totalLead}`);
console.log(`Con match en AMBOS excels:              ${totalAmbos}`);
console.log(`Con match en cualquiera (al menos uno): ${totalAny}`);
console.log(`Sin match:                              ${leadsCrm.length - totalAny}`);
console.log(`\nCSV escrito: ${outPath}`);
