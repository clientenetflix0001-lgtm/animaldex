#!/usr/bin/env node
// ============================================================
// Generador del snapshot geográfico oficial de Animaldex.
// ============================================================
// Descarga el catálogo de localidades censales de la API Georef v2.1 y lo
// escribe en lib/geoplace/catalog.ar.ts en formato compacto.
//
// Se emite TypeScript y no JSON a propósito: Node exige `with { type: 'json' }`
// para importar JSON y Metro no soporta ese atributo de forma confiable. Un
// módulo .ts se importa igual desde la app, el Worker y los tests.
//
// Uso:
//   node scripts/geo/build-catalog.mjs
//   node scripts/geo/build-catalog.mjs --check     (no escribe, solo valida)
//
// Fuente: Servicio Georef – argentina.gob.ar/georef (CC BY 4.0).
// El snapshot es un DERIVADO MODIFICADO: se recortan campos, se redondean
// centroides y se agrega un índice normalizado. La atribución CC BY 4.0 es
// obligatoria en cualquier interfaz que muestre estos datos.
//
// La v1.0 de la API está anunciada como discontinuada: la versión queda fijada
// explícitamente acá y no debe reemplazarse por la URL sin versionar.
//
// El núcleo se exporta para poder testear la paginación y la validación sin
// depender de la red: Georef devuelve 524 con cierta frecuencia.
// ============================================================

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GEOREF_VERSION = 'v2.1';
export const GEOREF_BASE = `https://apis.datos.gob.ar/georef/api/${GEOREF_VERSION}`;

// Cotas de validación. No se asumen cantidades: si el catálogo oficial se
// aparta de este rango el build falla y hay que revisarlo a mano.
export const EXPECTED = {
  places: { min: 3800, max: 4300 },
  admin1: { exact: 24 },
  admin2: { min: 500, max: 560 },
};

/**
 * Tamaño de página. Deliberadamente chico: pedir las 4022 de una sola vez con
 * diez campos hace que Georef responda 524 (timeout de su propio proxy).
 */
export const PAGE_SIZE = 500;
export const MAX_ATTEMPTS = 4;
export const REQUEST_TIMEOUT_MS = 45_000;

/** La cuota oficial es de 10 req/s: se deja aire entre páginas. */
export const PAGE_PAUSE_MS = 400;

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(root, 'lib', 'geoplace', 'catalog.ar.ts');

export const FIELDS = [
  'id', 'nombre',
  'provincia.id', 'provincia.nombre',
  'departamento.id', 'departamento.nombre',
  'gobierno_local.id', 'gobierno_local.nombre',
  'centroide.lat', 'centroide.lon',
].join(',');

export class BuildError extends Error {}

const fail = (msg) => { throw new BuildError(msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function pageUrl(inicio, max = PAGE_SIZE) {
  return `${GEOREF_BASE}/localidades-censales?max=${max}&inicio=${inicio}&campos=${FIELDS}`;
}

/** GET con timeout y reintentos con espera creciente. */
export async function fetchJson(url, deps = {}) {
  const doFetch = deps.fetch || fetch;
  const wait = deps.sleep || sleep;
  const attempts = deps.maxAttempts ?? MAX_ATTEMPTS;
  let last = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? REQUEST_TIMEOUT_MS);
      try {
        const res = await doFetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
        if (res.ok) return await res.json();
        // 5xx y 429 son transitorios; el resto no se reintenta.
        if (res.status < 500 && res.status !== 429) {
          fail(`Georef ${GEOREF_VERSION} respondió ${res.status} en ${url}`);
        }
        last = new Error(`Georef ${GEOREF_VERSION} respondió ${res.status}`);
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      if (e instanceof BuildError) throw e;
      last = e;
    }
    if (attempt < attempts) {
      const backoff = 2000 * 2 ** (attempt - 1);
      if (deps.onRetry) deps.onRetry(attempt, last, backoff);
      await wait(backoff);
    }
  }
  return fail(`Georef ${GEOREF_VERSION} no respondió tras ${attempts} intentos: ${last?.message}. `
    + 'El servicio devuelve 524 de forma intermitente; volver a intentar más tarde.');
}

/** Descarga todas las páginas y verifica contra el `total` que declara la API. */
export async function fetchAllPlaces(deps = {}) {
  const get = deps.fetchJson || ((url) => fetchJson(url, deps));
  const wait = deps.sleep || sleep;
  const log = deps.log || (() => {});
  const pageSize = deps.pageSize ?? PAGE_SIZE;

  const rows = [];
  let total = null;

  for (let inicio = 0; total === null || inicio < total; inicio += pageSize) {
    const page = await get(pageUrl(inicio, pageSize));
    const batch = page.localidades_censales || [];
    if (total === null) {
      total = Number(page.total);
      if (!Number.isFinite(total) || total <= 0) fail(`la API no declaró un total válido: ${page.total}`);
      log(`   total declarado: ${total}`);
    }
    if (!batch.length) fail(`página vacía en inicio=${inicio} con total=${total}`);
    rows.push(...batch);
    log(`   ${rows.length}/${total}`);
    if (rows.length < total) await wait(deps.pagePauseMs ?? PAGE_PAUSE_MS);
  }

  if (rows.length !== total) {
    fail(`descarga incompleta: ${rows.length} de ${total} localidades`);
  }
  const ids = new Set(rows.map((r) => r.id));
  if (ids.size !== rows.length) fail(`la paginación devolvió duplicados: ${rows.length - ids.size}`);
  return rows;
}

// Centroides redondeados a 5 decimales (~1 m). Sobra para ordenar por cercanía
// y recorta el tamaño del snapshot a la mitad.
const round5 = (n) => Math.round(Number(n) * 1e5) / 1e5;

/** Valida y transforma las filas crudas en el snapshot final. */
export function buildSnapshot(rows, options = {}) {
  const admin1 = new Map();
  const admin2 = new Map();
  const governmentLocal = new Map();
  const places = [];

  // Se ordena ANTES de construir los índices: si un mismo id de departamento o
  // de gobierno local llegara con nombres distintos, el que gana no puede
  // depender del orden en que paginó la API. Así el snapshot es reproducible.
  const sorted = [...rows].sort((a, b) => String(a?.id ?? '').localeCompare(String(b?.id ?? '')));

  for (const row of sorted) {
    if (!row.id || !row.nombre) fail(`fila sin id o nombre: ${JSON.stringify(row)}`);
    if (!row.provincia?.id) fail(`localidad ${row.id} sin provincia`);
    // departamento es el único enlace completo del catálogo y el ancla
    // territorial del resolvedor, así que su ausencia es un error duro.
    if (!row.departamento?.id) fail(`localidad ${row.id} sin departamento`);
    if (row.centroide?.lat == null || row.centroide?.lon == null) {
      fail(`localidad ${row.id} sin centroide`);
    }

    // Primera aparición gana, y como las filas ya están ordenadas por id, eso
    // es determinista.
    if (!admin1.has(row.provincia.id)) admin1.set(row.provincia.id, row.provincia.nombre);
    if (!admin2.has(row.departamento.id)) admin2.set(row.departamento.id, row.departamento.nombre);
    if (row.gobierno_local?.id && !governmentLocal.has(row.gobierno_local.id)) {
      governmentLocal.set(row.gobierno_local.id, row.gobierno_local.nombre);
    }

    places.push([
      row.id,
      row.nombre,
      row.provincia.id,
      row.departamento.id,
      row.gobierno_local?.id || null,
      round5(row.centroide.lat),
      round5(row.centroide.lon),
    ]);
  }

  const counts = {
    places: places.length,
    admin1: admin1.size,
    admin2: admin2.size,
    governmentLocal: governmentLocal.size,
  };

  if (counts.admin1 !== EXPECTED.admin1.exact) {
    fail(`se esperaban ${EXPECTED.admin1.exact} jurisdicciones de nivel 1 y llegaron ${counts.admin1}`);
  }
  for (const [key, range] of [['places', EXPECTED.places], ['admin2', EXPECTED.admin2]]) {
    if (counts[key] < range.min || counts[key] > range.max) {
      fail(`${key} = ${counts[key]}, fuera del rango esperado ${range.min}-${range.max}`);
    }
  }

  const generatedAt = options.generatedAt || new Date().toISOString();
  return {
    geoCatalogVersion: `ar-georef-${GEOREF_VERSION}-${generatedAt.slice(0, 10)}`,
    countryCode: 'AR',
    provider: 'georef',
    source: 'Servicio Georef – argentina.gob.ar/georef',
    sourceUrl: `${GEOREF_BASE}/localidades-censales`,
    sourceVersion: GEOREF_VERSION,
    sourceDataset: 'localidades-censales',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    // CC BY 4.0 exige crédito, enlace a la licencia e indicación de cambios.
    // Obligatorio mostrarlo en cualquier UI que exponga estos datos (Fase 3).
    attribution: 'Datos territoriales: Servicio Georef – argentina.gob.ar/georef '
      + '(Jefatura de Gabinete de Ministros, República Argentina), licencia CC BY 4.0. '
      + 'Datos modificados: normalizados y adaptados por Animaldex.',
    modified: true,
    modificationNote: 'Campos recortados, centroides redondeados a 5 decimales, '
      + 'índice de búsqueda sin diacríticos agregado por Animaldex.',
    generatedAt,
    counts,
    admin1: Object.fromEntries([...admin1].sort((a, b) => a[0].localeCompare(b[0]))),
    admin2: Object.fromEntries([...admin2].sort((a, b) => a[0].localeCompare(b[0]))),
    governmentLocal: Object.fromEntries([...governmentLocal].sort((a, b) => a[0].localeCompare(b[0]))),
    // [providerPlaceId, localityName, admin1Code, admin2Code, governmentLocalCode|null, lat, lng]
    placeFields: ['providerPlaceId', 'localityName', 'admin1Code', 'admin2Code', 'governmentLocalCode', 'centroidLat', 'centroidLng'],
    places,
  };
}

/** Serializa el snapshot como módulo TypeScript. */
export function renderModule(snapshot) {
  return [
    '// ============================================================',
    '// GENERADO AUTOMÁTICAMENTE. NO EDITAR A MANO.',
    '// ============================================================',
    '// Regenerar con: node scripts/geo/build-catalog.mjs',
    `// Fuente: ${snapshot.source} (${snapshot.sourceVersion}), licencia ${snapshot.license}.`,
    '// Datos modificados por Animaldex. La atribución CC BY 4.0 es OBLIGATORIA en',
    '// cualquier interfaz que muestre estos datos.',
    '// ============================================================',
    '',
    "import type { GeoCatalogSnapshot } from './types.ts';",
    '',
    `const snapshot: GeoCatalogSnapshot = ${JSON.stringify(snapshot, null, 0)};`,
    '',
    'export default snapshot;',
    '',
  ].join('\n');
}

async function main() {
  const check = process.argv.includes('--check');
  const log = (m) => console.log(m);
  log(`Georef ${GEOREF_VERSION} — descargando localidades censales…`);

  const rows = await fetchAllPlaces({
    log,
    onRetry: (attempt, err, backoff) => log(`   intento ${attempt} falló (${err?.message}); reintentando en ${backoff / 1000}s`),
  });
  const snapshot = buildSnapshot(rows);
  const { counts, places } = snapshot;
  log(`   localidades ${counts.places}, provincias ${counts.admin1}, departamentos ${counts.admin2}, gobiernos locales ${counts.governmentLocal}`);

  const withoutGl = places.filter((p) => !p[4]).length;
  log(`   sin gobierno_local: ${withoutGl} (${((100 * withoutGl) / places.length).toFixed(1)}%)`);
  log('   por eso gobierno_local es solo señal de ranking, nunca filtro excluyente.');

  const body = renderModule(snapshot);
  log(`   snapshot: ${(body.length / 1024).toFixed(0)} KB`);

  if (check) {
    if (!existsSync(OUT)) fail('no existe lib/geoplace/catalog.ar.ts');
    const current = readFileSync(OUT, 'utf8');
    // Se comparan los datos, no la fecha de generación.
    const same = current.includes(`"places":${JSON.stringify(places)}`);
    log(same
      ? '\n✓ el snapshot local coincide con el catálogo oficial actual'
      : '\n! el catálogo oficial cambió: correr sin --check para regenerar');
    process.exit(same ? 0 : 2);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, body);
  log(`\n✓ escrito ${OUT}`);
  log(`  geoCatalogVersion = ${snapshot.geoCatalogVersion}`);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  main().catch((e) => {
    console.error(`\n✗ ${e.message}\n`);
    process.exit(1);
  });
}
