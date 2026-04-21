#!/usr/bin/env node
import 'dotenv/config';
import { Client } from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const desde = args.desde || daysAgoIso(7);
const hasta = args.hasta || todayIso;
// El lado API se extiende hasta hoy para capturar prospectos/leads asignados
// DESPUES de que creamos el lead en el CRM.
const apiHasta = hasta > todayIso ? hasta : todayIso;
const pageSize = Number(args.pageSize) || 100;
const maxRetries = Number(args.retries) || 4;
const verbose = Boolean(args.verbose);

const outDir = path.resolve(__dirname, 'out');
await fs.mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, `cruce_${desde}_a_${hasta}.csv`);

// ---------------- Config ----------------
const LOGIN_URL = process.env.NSV_LOGIN_URL || 'https://seguridad.maquimas.pe/api/Auth/Login';
const API_BASE = process.env.NSV_API_BASE || 'https://api-prod-nsv.maquimas.pe';
const PROSPECTOS_URL = `${API_BASE}/api/Prospecto/UsuarioRol?tipoConsulta=11`;
const LEADS_URL = `${API_BASE}/api/Leads/Bandeja`;
const EMAIL = process.env.NSV_BOT_EMAIL;
const PASSWORD = process.env.NSV_BOT_PASSWORD;
const APP_ID = process.env.NSV_APP_ID;

if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en .env');
if (!EMAIL || !PASSWORD || !APP_ID) throw new Error('Falta NSV_BOT_EMAIL / NSV_BOT_PASSWORD / NSV_APP_ID en .env');

console.log(`\n=== Cruce CRM vs Saya Bot NSV ===`);
console.log(`CRM  fecha_creacion: ${desde}  →  ${hasta}`);
console.log(`API  fecha_asignacion: ${desde}  →  ${apiHasta}`);
console.log(`API base: ${API_BASE}`);
console.log(`Salida:   ${outPath}\n`);

// ---------------- Normalization ----------------
const stripAccents = s => s.normalize('NFD').replace(/\p{Diacritic}/gu, '');

// DNIs peruanos son siempre 8 digitos. Si viene con <8 (alguien lo guardo
// sin el cero), rellenamos a la izquierda para que "8285532" matchee con
// "08285532". Si tiene mas (CE, RUC, etc.) lo dejamos tal cual.
const normDni = v => {
  const d = (v ?? '').toString().replace(/\D/g, '');
  if (!d) return '';
  return d.length <= 8 ? d.padStart(8, '0') : d;
};

const normPhone = v => {
  const s = (v ?? '').toString().replace(/\D/g, '');
  return s.length >= 9 ? s.slice(-9) : s;
};

// Nombre: mayusculas, sin tildes, solo letras, tokens ordenados alfabeticamente
// para que "JUAN PEREZ" == "PEREZ JUAN".
const normNombre = v => {
  const tokens = stripAccents((v ?? '').toString())
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort();
  return tokens.join(' ');
};

// Busca una clave recursivamente (en objetos anidados) probando varios nombres.
const pick = (obj, keys) => {
  if (obj == null || typeof obj !== 'object') return null;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const found = pick(v, keys);
      if (found !== null) return found;
    }
  }
  return null;
};

const extractApi = r => ({
  dniRaw: pick(r, ['numDocumento', 'numeroDocumento', 'docnumber', 'dni', 'documento']),
  phoneRaw: pick(r, ['celular', 'telefono', 'numero', 'phonenumber', 'numeroTelefono', 'numeroCelular', 'telefonoCelular']),
  vendedorRaw: pick(r, ['vendedor', 'nombreVendedor', 'agente', 'nombreAgente']),
  fechaAsigRaw: pick(r, ['fechaAsignacion', 'fechaEstado', 'fechaRegistro', 'fecha']),
  raw: r,
});

// Walk recursivo de todos los (path, valor primitivo) del objeto.
function* walkValues(obj, prefix = '') {
  if (obj == null) return;
  if (typeof obj !== 'object') { yield [prefix, obj]; return; }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) yield* walkValues(obj[i], `${prefix}[${i}]`);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    yield* walkValues(v, prefix ? `${prefix}.${k}` : k);
  }
}

// ---------------- HTTP ----------------
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Reintenta en errores transitorios de gateway (502/503/504) y fetch fallido.
async function fetchRetry(label, url, init) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, init);
      if (resp.status === 502 || resp.status === 503 || resp.status === 504) {
        const body = await resp.text().catch(() => '');
        lastErr = new Error(`${label} ${resp.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
        const wait = 1000 * 2 ** (attempt - 1);
        console.warn(`  [retry ${attempt}/${maxRetries}] ${label} ${resp.status}, esperando ${wait}ms...`);
        await sleep(wait);
        continue;
      }
      return resp;
    } catch (e) {
      lastErr = e;
      const wait = 1000 * 2 ** (attempt - 1);
      console.warn(`  [retry ${attempt}/${maxRetries}] ${label} error ${e.message}, esperando ${wait}ms...`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function login() {
  const resp = await fetchRetry('Login', LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, idAplicacion: APP_ID }),
  });
  if (!resp.ok) throw new Error(`Login fallo ${resp.status}: ${await resp.text()}`);
  const json = await resp.json();
  if (!json.isAuthenticated) throw new Error(`Login no autenticado: ${json.errorMessage || ''}`);
  return json.accessToken;
}

function paginatedItems(json) {
  if (Array.isArray(json)) return { items: json, total: null, totalPages: null };
  const items = json.data ?? json.items ?? json.results ?? json.rows ?? [];
  const total = json.totalCount ?? json.totalRecords ?? json.total ?? json.count ?? null;
  const totalPages = json.totalPages ?? (total != null ? Math.ceil(total / pageSize) : null);
  return { items: Array.isArray(items) ? items : [], total, totalPages };
}

async function fetchProspectos(token) {
  const all = [];
  let page = 1;
  while (true) {
    const body = {
      terminoBusqueda: '',
      currentPage: page,
      pageSize,
      ascendente: false,
      ordenarPor: 'fechaEstado',
      idsEstadoDocumentoProspecto: null,
      nivelesInteres: [],
      fechaInicio: `${desde}T00:00:00`,
      fechaFin: `${apiHasta}T23:59:59`,
      tieneAdelantoEntrega: null,
      tipoBusqueda: 1,
    };
    const resp = await fetchRetry(`Prospectos p${page}`, PROSPECTOS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`Prospectos p${page} ${resp.status}: ${await resp.text()}`);
    const json = await resp.json();
    if (page === 1 && verbose) console.log('Prospectos sample keys:', Object.keys(json.data?.[0] || json.items?.[0] || {}).slice(0, 20));
    const { items, total, totalPages } = paginatedItems(json);
    all.push(...items);
    console.log(`  Prospectos p${page}: +${items.length} (acum ${all.length}${total != null ? ` / total reportado ${total}` : ''})`);
    // Si la API reporta total/totalPages confiamos en eso; si no, caemos al fallback.
    if (totalPages != null) { if (page >= totalPages) break; }
    else if (total != null) { if (all.length >= total) break; }
    else if (items.length < pageSize) break;
    if (items.length === 0) break;
    page++;
    if (page > 500) { console.warn('  corte: >500 paginas'); break; }
  }
  return all;
}

async function fetchLeadsBandeja(token) {
  const all = [];
  let page = 1;
  while (true) {
    const qs = new URLSearchParams({
      fechaAsignacionInicio: desde,
      fechaAsignacionFin: apiHasta,
      pageIndex: String(page),
      pageSize: String(pageSize),
      sort: 'fechaAsignacion',
      sortOrder: 'desc',
    });
    const resp = await fetchRetry(`Leads p${page}`, `${LEADS_URL}?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error(`Leads p${page} ${resp.status}: ${await resp.text()}`);
    const json = await resp.json();
    if (page === 1 && verbose) console.log('Leads sample keys:', Object.keys(json.data?.[0] || json.items?.[0] || {}).slice(0, 20));
    const { items, total, totalPages } = paginatedItems(json);
    all.push(...items);
    console.log(`  Leads p${page}: +${items.length} (acum ${all.length}${total != null ? ` / total reportado ${total}` : ''})`);
    if (totalPages != null) { if (page >= totalPages) break; }
    else if (total != null) { if (all.length >= total) break; }
    else if (items.length < pageSize) break;
    if (items.length === 0) break;
    page++;
    if (page > 500) { console.warn('  corte: >500 paginas'); break; }
  }
  return all;
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
function indexApi(records) {
  const byDni = new Map();
  const byPhone = new Map();
  for (const r of records) {
    const e = extractApi(r);
    const dni = normDni(e.dniRaw);
    const phone = normPhone(e.phoneRaw);
    if (dni) (byDni.get(dni) || byDni.set(dni, []).get(dni)).push(e);
    if (phone) (byPhone.get(phone) || byPhone.set(phone, []).get(phone)).push(e);
  }
  return { byDni, byPhone };
}

// Validacion temporal: solo cuenta match si la fecha_asignacion del API
// es MAYOR que fecha_creacion del lead CRM. Si la fecha es invalida dejamos pasar.
function validarTemporal(candidatos, fechaCreacionLead) {
  if (!candidatos || candidatos.length === 0) return null;
  const t = new Date(fechaCreacionLead).getTime();
  const validos = candidatos.filter(c => {
    if (!c.fechaAsigRaw) return true;
    const tc = new Date(c.fechaAsigRaw).getTime();
    if (Number.isNaN(tc)) return true;
    return tc > t;
  });
  if (validos.length === 0) return null;
  // elige el mas reciente
  return validos.sort((a, b) => new Date(b.fechaAsigRaw || 0) - new Date(a.fechaAsigRaw || 0))[0];
}

function cruzar(leadsCrm, apiRecords, fuenteLabel) {
  const { byDni, byPhone } = indexApi(apiRecords);
  return leadsCrm.map(l => {
    const dni = normDni(l.dni);
    const phone = normPhone(l.numero);
    const asesorCrm = normNombre(l.nombre_asesor);

    const mDni = dni ? validarTemporal(byDni.get(dni), l.fecha_creacion) : null;
    const mPhone = phone ? validarTemporal(byPhone.get(phone), l.fecha_creacion) : null;

    const flag = (m) => {
      if (!m) return { match: 'N', vendedor: '', fecha: '', coincide_asesor: '' };
      const vend = normNombre(m.vendedorRaw);
      return {
        match: 'Y',
        vendedor: (m.vendedorRaw ?? '').toString(),
        fecha: (m.fechaAsigRaw ?? '').toString(),
        coincide_asesor: asesorCrm && vend ? (asesorCrm === vend ? 'Y' : 'N') : '',
      };
    };

    return {
      fuente: fuenteLabel,
      porDni: flag(mDni),
      porTel: flag(mPhone),
    };
  });
}

// ---------------- CSV ----------------
const csvEscape = v => {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

// ---------------- Main ----------------
console.log('1) Login a Saya Bot...');
const token = await login();
console.log('   OK\n');

console.log('2) Descargando prospectos...');
const prospectos = await fetchProspectos(token);
console.log(`   total: ${prospectos.length}\n`);

console.log('3) Descargando bandeja de leads...');
const leadsApi = await fetchLeadsBandeja(token);
console.log(`   total: ${leadsApi.length}\n`);

console.log('4) Consultando CRM (leads con accion comercial)...');
const leadsCrm = await fetchCrmLeads();
console.log(`   total: ${leadsCrm.length}\n`);

// ---------------- Debug ----------------
if (args.debug) {
  const target = String(args.debug);
  const targetDni = normDni(target);
  const targetPhone = normPhone(target);
  console.log(`\n=== DEBUG para "${target}" ===`);
  console.log(`DNI normalizado:      "${targetDni}"`);
  console.log(`Telefono normalizado: "${targetPhone}"\n`);

  // Busca en CUALQUIER campo anidado, comparando por tel/dni normalizados y por substring crudo.
  const findHits = (r) => {
    const hits = [];
    for (const [path, val] of walkValues(r)) {
      const s = String(val ?? '');
      if (!s) continue;
      if (targetPhone && normPhone(s) === targetPhone) hits.push({ path, val: s, por: 'telefono' });
      else if (targetDni && normDni(s) === targetDni) hits.push({ path, val: s, por: 'dni' });
      else if (s.includes(target)) hits.push({ path, val: s, por: 'substring' });
    }
    return hits;
  };

  const leadsCrmHit = leadsCrm.filter(l => {
    return normDni(l.dni) === targetDni || normPhone(l.numero) === targetPhone;
  });
  console.log(`--- CRM: leads con acción comercial que matchean (en rango) ---`);
  if (leadsCrmHit.length === 0) {
    console.log(`  (ninguno) → puede que el lead no tenga accion comercial en [${desde}..${hasta}], o no este creado en ese rango`);
  } else {
    for (const l of leadsCrmHit) {
      console.log(`  id=${l.id_lead} dni=${l.dni} numero=${l.numero} fecha_creacion=${new Date(l.fecha_creacion).toISOString()} asesor=${l.nombre_asesor}`);
    }
  }

  const dumpApi = (lista, nombre) => {
    console.log(`\n--- API ${nombre}: registros con match en cualquier campo (normalizado) ---`);
    const hits = [];
    for (const r of lista) {
      const found = findHits(r);
      if (found.length) hits.push({ r, found });
    }
    if (hits.length === 0) {
      console.log(`  (ninguno en el rango API [${desde}..${apiHasta}], sobre ${lista.length} registros totales)`);
      return;
    }
    console.log(`  total: ${hits.length}`);
    for (const { r, found } of hits.slice(0, 5)) {
      const e = extractApi(r);
      console.log(`  -- registro:`);
      console.log(`     donde matcheó: ${found.map(f => `${f.path}="${f.val}" (por ${f.por})`).join(' | ')}`);
      console.log(`     dni extraido: "${e.dniRaw}" -> norm "${normDni(e.dniRaw)}"`);
      console.log(`     tel extraido: "${e.phoneRaw}" -> norm "${normPhone(e.phoneRaw)}"`);
      console.log(`     vendedor:     "${e.vendedorRaw}"`);
      console.log(`     fechaAsig:    "${e.fechaAsigRaw}"`);
      console.log(`     keys top-level: ${Object.keys(r).join(', ')}`);
    }
    if (hits.length > 5) console.log(`  ... y ${hits.length - 5} mas`);
  };
  dumpApi(prospectos, 'Prospectos');
  dumpApi(leadsApi, 'Leads Bandeja');
  console.log(`\n=== FIN DEBUG ===\n`);
  process.exit(0);
}

console.log('5) Cruzando...');
const cruceProspectos = cruzar(leadsCrm, prospectos, 'prospecto');
const cruceLeadsApi = cruzar(leadsCrm, leadsApi, 'lead_api');

const header = [
  'id_lead', 'dni', 'numero', 'nombre', 'apellido', 'fecha_creacion', 'asesor_crm', 'total_acciones',
  'prospecto_match_tel', 'prospecto_vendedor_tel', 'prospecto_fecha_asig_tel', 'prospecto_coincide_asesor_tel',
  'prospecto_match_dni', 'prospecto_vendedor_dni', 'prospecto_fecha_asig_dni', 'prospecto_coincide_asesor_dni',
  'lead_match_tel',      'lead_vendedor_tel',      'lead_fecha_asig_tel',      'lead_coincide_asesor_tel',
  'lead_match_dni',      'lead_vendedor_dni',      'lead_fecha_asig_dni',      'lead_coincide_asesor_dni',
  'match_cualquiera',
];

const rows = leadsCrm.map((l, i) => {
  const p = cruceProspectos[i];
  const b = cruceLeadsApi[i];
  const matchAny = [p.porTel.match, p.porDni.match, b.porTel.match, b.porDni.match].includes('Y') ? 'Y' : 'N';
  return [
    l.id_lead, l.dni ?? '', l.numero ?? '', l.nombre ?? '', l.apellido ?? '',
    l.fecha_creacion instanceof Date ? l.fecha_creacion.toISOString() : l.fecha_creacion,
    l.nombre_asesor ?? '', l.total_acciones ?? 0,
    p.porTel.match, p.porTel.vendedor, p.porTel.fecha, p.porTel.coincide_asesor,
    p.porDni.match, p.porDni.vendedor, p.porDni.fecha, p.porDni.coincide_asesor,
    b.porTel.match, b.porTel.vendedor, b.porTel.fecha, b.porTel.coincide_asesor,
    b.porDni.match, b.porDni.vendedor, b.porDni.fecha, b.porDni.coincide_asesor,
    matchAny,
  ];
});

const csv = [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\n');
await fs.writeFile(outPath, '\ufeff' + csv, 'utf8');

const totalMatch = rows.filter(r => r[r.length - 1] === 'Y').length;
console.log(`\n=== Resumen ===`);
console.log(`Leads CRM con accion comercial: ${leadsCrm.length}`);
console.log(`Con match en API (cualquiera):  ${totalMatch}`);
console.log(`Sin match:                      ${leadsCrm.length - totalMatch}`);
console.log(`\nCSV escrito: ${outPath}`);
