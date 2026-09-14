#!/usr/bin/env node
// ============================================================
// Animaldex — validación post-backfill (Fase 4).
// ============================================================
// Comprueba, contra la base ya escrita, que el backfill no inventó nada:
//
//   1. cobertura por tabla (total, con/sin place_id, códigos completos);
//   2. todo place_id existe en el catálogo Georef v2.1 embebido;
//   3. admin1_code y admin2_code coinciden con los del place;
//   4. los campos legacy siguen ahí (opcionalmente contra el dump previo);
//   5. ninguna fila tiene códigos sin place_id ni al revés.
//
// Uso:
//   node scripts/geo/backfill-verify.mjs --target=remote
//   node scripts/geo/backfill-verify.mjs --target=local:/ruta/copia.db
//   node scripts/geo/backfill-verify.mjs --target=remote --baseline=/ruta/pre.sql
// ============================================================

import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { placeById } from '../../lib/geoplace/catalog.ts';
import { D1_DATABASE, TABLES } from './backfill.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function remoteQuery(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', D1_DATABASE, '--remote', '--json', '--command', sql], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out.slice(out.indexOf('[')))[0].results;
}

function localQuery(path, sql) {
  const out = execFileSync('sqlite3', ['-json', path, sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.trim() ? JSON.parse(out) : [];
}

function makeQuery(target) {
  if (target === 'remote') return remoteQuery;
  const path = target.slice('local:'.length);
  return (sql) => localQuery(path, sql);
}

/**
 * Restaura el export previo a la migración en una copia temporal y devuelve
 * un `query` contra ella. Es la única forma honesta de comparar legacy: se
 * lee el dato de antes, no un recuento anotado a mano.
 */
function restoreBaseline(dumpPath) {
  const dir = mkdtempSync(join(tmpdir(), 'geo-baseline-'));
  const db = join(dir, 'baseline.db');
  execFileSync('sqlite3', [db, `.read ${dumpPath}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { db, query: (sql) => localQuery(db, sql) };
}

const args = process.argv.slice(2);
const target = (args.find((a) => a.startsWith('--target=')) || '--target=remote').slice('--target='.length);
const baseline = (args.find((a) => a.startsWith('--baseline=')) || '').slice('--baseline='.length) || null;
const query = makeQuery(target);

console.log('='.repeat(78));
console.log(`VALIDACIÓN POST-BACKFILL — ${target === 'remote' ? `D1 remoto (${D1_DATABASE})` : target}`);
console.log('='.repeat(78));

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.log(`  FAIL  ${msg}`);
};

// ------------------------------------------------------------
// 1. Cobertura por tabla
// ------------------------------------------------------------

console.log('\nCOBERTURA');
console.log('  tabla      total  con place_id  sin place_id  admin1  admin2  %');
const resumen = [];

for (const spec of TABLES) {
  const [c] = query(
    `SELECT count(*) AS total,` +
      ` sum(CASE WHEN place_id IS NOT NULL AND place_id <> '' THEN 1 ELSE 0 END) AS conPlace,` +
      ` sum(CASE WHEN admin1_code IS NOT NULL AND admin1_code <> '' THEN 1 ELSE 0 END) AS conAdmin1,` +
      ` sum(CASE WHEN admin2_code IS NOT NULL AND admin2_code <> '' THEN 1 ELSE 0 END) AS conAdmin2,` +
      ` sum(CASE WHEN ${spec.text} IS NOT NULL AND trim(${spec.text}) <> '' THEN 1 ELSE 0 END) AS conTexto` +
      ` FROM ${spec.table}`
  );
  const total = Number(c.total);
  const conPlace = Number(c.conPlace || 0);
  const conTexto = Number(c.conTexto || 0);
  const pct = conTexto ? ((conPlace / conTexto) * 100).toFixed(1) : '—';
  resumen.push({ ...spec, total, conPlace, conTexto, pct });
  console.log(
    `  ${spec.table.padEnd(10)} ${String(total).padStart(5)} ${String(conPlace).padStart(13)}` +
      ` ${String(total - conPlace).padStart(13)} ${String(Number(c.conAdmin1 || 0)).padStart(7)}` +
      ` ${String(Number(c.conAdmin2 || 0)).padStart(7)}  ${pct}% de las filas con texto`
  );

  if (Number(c.conAdmin1 || 0) !== conPlace) fail(`${spec.table}: admin1_code no acompaña a todos los place_id`);
  if (Number(c.conAdmin2 || 0) !== conPlace) fail(`${spec.table}: admin2_code no acompaña a todos los place_id`);
}

// ------------------------------------------------------------
// 2 y 3. Todo place_id existe y sus códigos coinciden
// ------------------------------------------------------------

console.log('\nCONSISTENCIA GEOPLACE');
let escritas = 0;
const distintos = new Set();

for (const spec of TABLES) {
  const rows = query(
    `SELECT ${spec.id} AS id, place_id, admin1_code, admin2_code FROM ${spec.table} WHERE place_id IS NOT NULL AND place_id <> ''`
  );
  for (const row of rows) {
    escritas += 1;
    distintos.add(row.place_id);
    const place = placeById(row.place_id);
    if (!place) {
      fail(`${spec.table}/${row.id}: place_id ${row.place_id} NO existe en el catálogo`);
      continue;
    }
    if (row.admin1_code !== place.admin1Code) {
      fail(`${spec.table}/${row.id}: admin1_code ${row.admin1_code} ≠ ${place.admin1Code} del place`);
    }
    if (row.admin2_code !== place.admin2Code) {
      fail(`${spec.table}/${row.id}: admin2_code ${row.admin2_code} ≠ ${place.admin2Code} del place`);
    }
    if (!/^AR:georef:\d+$/.test(row.place_id)) {
      fail(`${spec.table}/${row.id}: place_id ${row.place_id} no tiene formato cualificado`);
    }
  }
}
console.log(`  ${escritas} filas con identidad territorial, ${distintos.size} places distintos`);
console.log('  places usados:');
for (const id of [...distintos].sort()) {
  const p = placeById(id);
  console.log(`    ${id}  ${p.localityName} / ${p.admin2Name} / ${p.admin1Name}  (admin1=${p.admin1Code} admin2=${p.admin2Code})`);
}

// ------------------------------------------------------------
// 4. Legacy intacto
// ------------------------------------------------------------

console.log('\nLEGACY PRESERVADO');

/** Histograma tabla -> "valor legacy" -> filas. Comparable entre dos bases. */
function legacyHistogram(run) {
  const out = {};
  for (const spec of TABLES) {
    // Cada columna se coalesce por separado: `a || b` con b NULL da NULL, y eso
    // borraría el valor de `a` del informe.
    const cols = [spec.text, spec.province]
      .filter(Boolean)
      .map((col) => `coalesce(${col}, '(nulo)')`)
      .join(" || '|' || ");
    const rows = run(`SELECT ${cols} AS valor, count(*) AS n FROM ${spec.table} GROUP BY valor ORDER BY valor`);
    out[spec.table] = rows.map((r) => `${r.valor}=${r.n}`).join('  ');
  }
  return out;
}

const ahora = legacyHistogram(query);

if (baseline) {
  const previo = restoreBaseline(baseline);
  const antes = legacyHistogram(previo.query);
  console.log(`  comparando contra el export previo a la migración: ${baseline}`);
  for (const spec of TABLES) {
    const igual = antes[spec.table] === ahora[spec.table];
    console.log(`  ${spec.table.padEnd(10)} ${igual ? 'idéntico' : 'CAMBIÓ'}`);
    if (!igual) {
      fail(`${spec.table}: el texto legacy cambió`);
      console.log(`    antes: ${antes[spec.table]}`);
      console.log(`    ahora: ${ahora[spec.table]}`);
    } else {
      console.log(`    ${ahora[spec.table]}`);
    }
  }
} else {
  for (const spec of TABLES) console.log(`  ${spec.table.padEnd(10)} ${ahora[spec.table]}`);
  console.log('  (sin --baseline no se puede comparar contra el estado previo)');
}

for (const spec of resumen) {
  if (spec.conTexto === 0 && spec.total > 0) fail(`${spec.table}: se quedó sin texto legacy`);
}

// ------------------------------------------------------------
// 5. Nada de códigos huérfanos
// ------------------------------------------------------------

console.log('\nCÓDIGOS HUÉRFANOS');
for (const spec of TABLES) {
  const [c] = query(
    `SELECT count(*) AS n FROM ${spec.table} WHERE (place_id IS NULL OR place_id = '')` +
      ` AND ((admin1_code IS NOT NULL AND admin1_code <> '') OR (admin2_code IS NOT NULL AND admin2_code <> ''))`
  );
  console.log(`  ${spec.table.padEnd(10)} ${Number(c.n)}`);
  if (Number(c.n) !== 0) fail(`${spec.table}: hay códigos escritos sin place_id`);
}

console.log('\n' + '='.repeat(78));
console.log(failures === 0 ? 'RESULTADO: PASS' : `RESULTADO: FAIL (${failures} problemas)`);
process.exit(failures === 0 ? 0 : 1);
