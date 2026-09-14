#!/usr/bin/env node
// ============================================================
// Animaldex — backfill de identidad territorial (Fase 4).
// ============================================================
// Rellena place_id / admin1_code / admin2_code en las filas que ya existían,
// resolviendo el texto legacy contra el snapshot Georef v2.1 embebido.
//
// NO DEPENDE DE GEOREF. Todo sale de lib/geoplace/catalog.ar.ts, así que el
// backfill se puede correr con el servicio caído y su resultado es reproducible.
//
// ORDEN DE RESOLUCIÓN
//   1. coincidencia inequívoca de nombre + provincia;
//   2. alias legacy inequívoco ("Cerrillos" -> San José de los Cerrillos);
//   3. la coordenada SOLO confirma o contradice; nunca elige;
//   4. cualquier ambigüedad va a revisión manual y no se escribe nada.
//
// Por qué la coordenada no elige: el centroide más cercano acierta bastante
// menos de lo que parece, y escribir una identidad territorial equivocada es
// peor que dejarla nula. Además solo se usa donde la coordenada significa lo
// mismo que el texto (el hecho de una alerta, la ubicación de una publicación).
// En perfiles y usuarios la última posición del dispositivo NO es su ubicación
// declarada, así que ahí no se usa.
//
// Uso:
//   node scripts/geo/backfill.mjs --target=local:/ruta/copia.db         (dry-run)
//   node scripts/geo/backfill.mjs --target=local:/ruta/copia.db --apply
//   node scripts/geo/backfill.mjs --target=remote                       (dry-run)
//   node scripts/geo/backfill.mjs --target=remote --apply
// ============================================================

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { placeById } from '../../lib/geoplace/catalog.ts';
import { resolvePlaceFromText } from '../../lib/geoplace/resolve.ts';
import { geoDistanceKm, normalizeGeoText, validGeoPoint } from '../../lib/geoplace/normalize.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const D1_DATABASE = 'animaldex-db';

/** Dentro de este radio la coordenada respalda al texto. */
export const CONFIRM_KM = 25;

/**
 * Más lejos que esto, el texto y la coordenada no hablan del mismo lugar.
 * No se elige ninguno de los dos: va a revisión manual.
 */
export const CONTRADICT_KM = 120;

/**
 * De dónde sale el texto territorial de cada tabla.
 *
 * `profiles.location` y `users.location` son texto libre; sólo `users` no
 * tiene otra fuente, así que ahí se usa pero con la misma exigencia: si no
 * resuelve de forma inequívoca, no se escribe.
 */
export const TABLES = [
  { table: 'alerts', entity: 'alerta', id: 'id', text: 'locality', province: 'province', lat: 'lat', lon: 'lon' },
  { table: 'listings', entity: 'publicacion', id: 'id', text: 'locality', province: 'province', lat: 'lat', lon: 'lon' },
  { table: 'profiles', entity: 'pagina', id: 'id', text: 'locality', province: null, lat: null, lon: null },
  { table: 'users', entity: 'cuenta', id: 'id', text: 'location', province: null, lat: null, lon: null },
];

// ------------------------------------------------------------
// Detección de texto que es una dirección, no una localidad
// ------------------------------------------------------------

const STREET_WORDS = [
  'calle', 'av', 'avda', 'avenida', 'ruta', 'rn', 'rp', 'pasaje', 'psje',
  'manzana', 'mza', 'lote', 'barrio', 'bo', 'depto', 'piso', 'esquina', 'esq',
];

/**
 * Texto con pinta de dirección. El catálogo manda: hay 91 localidades con
 * dígitos en el nombre ("CABA - Comuna 3"), así que un número por sí solo no
 * alcanza para descartar nada.
 */
export function looksLikeAddress(text) {
  const normalized = normalizeGeoText(text);
  if (!normalized) return false;
  // Si es exactamente el nombre de una localidad, no es una dirección.
  if (resolvePlaceFromText(normalized).via === 'exact') return false;
  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.some((t) => STREET_WORDS.includes(t))) return true;
  // Altura de calle: un número al final o suelto entre palabras.
  if (/(^|\s)\d{2,}(\s|$)/.test(normalized) && tokens.length > 1) return true;
  return false;
}

// ------------------------------------------------------------
// Decisión por fila (pura: los tests la usan sin base de datos)
// ------------------------------------------------------------

/**
 * Coordenada de una fila, o null.
 *
 * D1 devuelve NULL como `null` y `Number(null)` es 0, que además es un punto
 * geográfico válido en el Golfo de Guinea. Sin este filtro, una fila sin
 * coordenada "contradice" cualquier texto por estar a miles de kilómetros.
 */
function coord(row, key) {
  if (!key) return null;
  const raw = row[key];
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * @returns {{action:'skip'|'write'|'conflict'|'no-source', reason:string,
 *            place?:object, candidates?:string[], distanceKm?:number|null}}
 */
export function decideRow(row, spec) {
  // Idempotencia: lo ya resuelto no se vuelve a tocar.
  if (row.place_id) return { action: 'skip', reason: 'ya-resuelto' };

  const text = spec.text ? row[spec.text] : null;
  // Sin texto legacy no hay nada que decidir: no es un conflicto, es una fila
  // que nunca tuvo ubicación. Se cuenta aparte para no inflar el informe manual.
  if (!text || !String(text).trim()) return { action: 'no-source', reason: 'sin-texto-legacy' };

  if (looksLikeAddress(text)) {
    return { action: 'conflict', reason: 'parece-una-direccion', candidates: [] };
  }

  const provinceName = spec.province ? row[spec.province] : null;
  const resolution = resolvePlaceFromText(text, provinceName ? { admin1Name: provinceName } : null);

  if (!resolution.place) {
    return {
      action: 'conflict',
      reason: resolution.ambiguous ? 'ambiguo' : 'sin-coincidencia',
      candidates: resolution.candidates.map((p) => p.placeId),
    };
  }

  const place = resolution.place;
  const via = resolution.via; // 'exact' | 'alias' | 'search'

  // Paso 3: la coordenada confirma o contradice. Nunca elige.
  let distanceKm = null;
  const lat = coord(row, spec.lat);
  const lon = coord(row, spec.lon);
  if (lat != null && lon != null && validGeoPoint(lat, lon)) {
    distanceKm = Number(geoDistanceKm(lat, lon, place.centroidLat, place.centroidLng).toFixed(1));
    if (distanceKm > CONTRADICT_KM) {
      return {
        action: 'conflict',
        reason: 'coordenada-contradice-el-texto',
        candidates: [place.placeId],
        distanceKm,
      };
    }
  }

  const confirmed = distanceKm != null && distanceKm <= CONFIRM_KM;
  return {
    action: 'write',
    reason: `${via}${confirmed ? '-confirmado-por-coordenada' : '-solo-texto'}`,
    place,
    distanceKm,
  };
}

// ------------------------------------------------------------
// Drivers de lectura/escritura
// ------------------------------------------------------------

function wrangler(args) {
  return execFileSync('npx', ['wrangler', ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function remoteQuery(sql) {
  const out = wrangler(['d1', 'execute', D1_DATABASE, '--remote', '--json', '--command', sql]);
  const start = out.indexOf('[');
  return JSON.parse(out.slice(start))[0].results;
}

function localQuery(dbPath, sql) {
  const out = execFileSync('sqlite3', ['-json', dbPath, sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.trim() ? JSON.parse(out) : [];
}

/**
 * Elige contra qué base corre el backfill.
 *
 * `--target` es obligatorio y no admite valores parecidos: un flag mal escrito
 * tiene que abortar, no caer en remoto por omisión. Escribir sin querer en la
 * base de producción no puede estar a un guion de distancia.
 */
function makeDriver(target) {
  if (target === 'remote') {
    return {
      label: `D1 remoto (${D1_DATABASE})`,
      query: remoteQuery,
      runFile: (file) => wrangler(['d1', 'execute', D1_DATABASE, '--remote', '--file', file]),
    };
  }
  if (!target.startsWith('local:') || !target.slice('local:'.length)) {
    throw new Error(
      `--target inválido: ${JSON.stringify(target)}\n` +
      'Usar --target=remote o --target=local:/ruta/copia.db'
    );
  }
  const path = target.slice('local:'.length);
  return {
    label: `sqlite local (${path})`,
    query: (sql) => localQuery(path, sql),
    runFile: (file) => execFileSync('sqlite3', [path, `.read ${file}`], { encoding: 'utf8' }),
  };
}

// ------------------------------------------------------------
// Ejecución
// ------------------------------------------------------------

function selectFor(spec) {
  const cols = [spec.id, spec.text, spec.province, spec.lat, spec.lon, 'place_id']
    .filter(Boolean)
    .join(', ');
  return `SELECT ${cols} FROM ${spec.table}`;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function updateStatement(spec, id, place) {
  // `place_id IS NULL` en el WHERE: idempotente también a nivel SQL, incluso
  // si el script se corriera dos veces en paralelo.
  return (
    `UPDATE ${spec.table} SET place_id = ${sqlString(place.placeId)}, ` +
    `admin1_code = ${sqlString(place.admin1Code)}, admin2_code = ${sqlString(place.admin2Code)} ` +
    `WHERE ${spec.id} = ${sqlString(id)} AND place_id IS NULL;`
  );
}

export const BACKFILL_FLAGS = ['--apply', '--target='];

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => !BACKFILL_FLAGS.some((f) => (f.endsWith('=') ? a.startsWith(f) : a === f)));
  if (unknown.length) {
    throw new Error(
      `argumentos no reconocidos: ${unknown.join(' ')}\n` +
      'Uso: node scripts/geo/backfill.mjs --target=remote|local:/ruta/copia.db [--apply]'
    );
  }
  const targetArg = args.find((a) => a.startsWith('--target='));
  if (!targetArg) {
    throw new Error('falta --target. Usar --target=remote o --target=local:/ruta/copia.db');
  }
  const apply = args.includes('--apply');
  const driver = makeDriver(targetArg.slice('--target='.length));

  console.log('='.repeat(70));
  console.log(`BACKFILL GEOPLACE — ${apply ? 'APLICAR' : 'DRY-RUN'}`);
  console.log(`destino: ${driver.label}`);
  console.log('='.repeat(70));

  const statements = [];
  const conflicts = [];
  const totals = [];

  for (const spec of TABLES) {
    const rows = driver.query(selectFor(spec));
    const count = { write: 0, skip: 0, 'no-source': 0, conflict: 0 };
    const reasons = new Map();

    for (const row of rows) {
      const decision = decideRow(row, spec);
      count[decision.action] += 1;
      reasons.set(decision.reason, (reasons.get(decision.reason) || 0) + 1);

      if (decision.action === 'write') {
        statements.push(updateStatement(spec, row[spec.id], decision.place));
      } else if (decision.action === 'conflict') {
        conflicts.push({
          tabla: spec.table,
          entidad: spec.entity,
          id: row[spec.id],
          localityLegacy: spec.text ? row[spec.text] ?? null : null,
          provinceLegacy: spec.province ? row[spec.province] ?? null : null,
          motivo: decision.reason,
          candidatos: decision.candidates || [],
          distanciaKm: decision.distanceKm ?? null,
        });
      }
    }

    totals.push({
      tabla: spec.table,
      filas: rows.length,
      aEscribir: count.write,
      yaResueltas: count.skip,
      sinDatoDeOrigen: count['no-source'],
      conflictos: count.conflict,
    });
    console.log(`\n${spec.table}  (texto legacy: ${spec.text}${spec.province ? ' + ' + spec.province : ''}${spec.lat ? ' + coordenada como confirmación' : ''})`);
    console.log(
      `  filas=${rows.length}  a escribir=${count.write}  ya resueltas=${count.skip}` +
      `  sin dato de origen=${count['no-source']}  conflictos=${count.conflict}`
    );
    for (const [reason, n] of [...reasons.entries()].sort()) console.log(`    ${reason}: ${n}`);
  }

  const sum = (key) => totals.reduce((s, t) => s + t[key], 0);

  console.log('\n' + '-'.repeat(70));
  console.log(
    `TOTAL  filas=${sum('filas')}  a escribir=${sum('aEscribir')}  ya resueltas=${sum('yaResueltas')}` +
    `  sin dato de origen=${sum('sinDatoDeOrigen')}  conflictos=${sum('conflictos')}`
  );
  console.log(
    'Las filas sin dato de origen nunca tuvieron texto de ubicación: no hay nada que decidir sobre ellas.'
  );

  if (conflicts.length) {
    console.log('\nCONFLICTOS — requieren decisión manual (sólo datos técnicos)');
    console.log('  tabla        entidad      id                              locality legacy      province   motivo');
    for (const c of conflicts) {
      console.log(
        '  ' +
        String(c.tabla).padEnd(12) +
        String(c.entidad).padEnd(13) +
        String(c.id).padEnd(32) +
        String(c.localityLegacy ?? '—').padEnd(21) +
        String(c.provinceLegacy ?? '—').padEnd(11) +
        c.motivo +
        (c.distanciaKm != null ? `  d=${c.distanciaKm}km` : '')
      );
      // Los candidatos con nombre: sin esto la decisión manual obliga a ir a
      // buscar cada código al catálogo a mano.
      for (const id of c.candidatos) {
        const p = placeById(id);
        console.log(`      candidato ${id}  ${p ? `${p.localityName} / ${p.admin2Name} / ${p.admin1Name}` : '(fuera del catálogo)'}`);
      }
    }
  } else {
    console.log('\nCONFLICTOS — ninguno.');
  }

  const outFile = join(root, 'scripts', 'geo', '.backfill.generated.sql');
  writeFileSync(outFile, statements.join('\n') + (statements.length ? '\n' : ''), 'utf8');
  console.log(`\n${statements.length} UPDATE generados en ${outFile}`);

  if (!apply) {
    console.log('DRY-RUN: no se escribió nada. Agregar --apply para ejecutar.');
    return;
  }
  if (!statements.length) {
    console.log('Nada que aplicar.');
    return;
  }
  driver.runFile(outFile);
  console.log('APLICADO.');
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  main().catch((e) => {
    console.error(`\n✗ ${e.message}`);
    process.exit(1);
  });
}
