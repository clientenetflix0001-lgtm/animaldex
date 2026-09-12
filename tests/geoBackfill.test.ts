// ============================================================
// Fase 4 — backfill de identidad territorial sobre datos existentes.
// ============================================================
// Lo que se verifica acá:
//   - el orden de resolución: texto+provincia, alias, y la coordenada SÓLO
//     como confirmación o contradicción, nunca como elección;
//   - los alias legacy inequívocos se resuelven (Salta Capital, Metán, Orán,
//     Cerrillos) y sólo cuando el contexto territorial alcanza;
//   - lo ambiguo (San Lorenzo) y lo que parece dirección no se escriben;
//   - todo place_id escrito existe en el catálogo y sus códigos coinciden;
//   - correr el backfill dos veces no cambia nada;
//   - los campos legacy siguen intactos después de escribir.
// ============================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { placeById } from '../lib/geoplace/catalog.ts';
import {
  CONTRADICT_KM,
  TABLES,
  decideRow,
  looksLikeAddress,
  updateStatement,
} from '../scripts/geo/backfill.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts', 'geo', 'backfill.mjs');

const ALERTS = TABLES.find((t) => t.table === 'alerts')!;
const LISTINGS = TABLES.find((t) => t.table === 'listings')!;
const PROFILES = TABLES.find((t) => t.table === 'profiles')!;
const USERS = TABLES.find((t) => t.table === 'users')!;

/** Identidades del catálogo que aparecen en los casos legacy de Salta. */
const SALTA_CAPITAL = 'AR:georef:66028050';
const CERRILLOS = 'AR:georef:66035010';
const METAN = 'AR:georef:66112040';
const ORAN = 'AR:georef:66126070';

const alertRow = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  locality: null,
  province: null,
  lat: null,
  lon: null,
  place_id: null,
  ...over,
});

// ------------------------------------------------------------

describe('orden de resolución del backfill', () => {
  it('resuelve por coincidencia exacta de texto + provincia', () => {
    const d = decideRow(alertRow({ locality: 'Tartagal', province: 'Salta' }), ALERTS);
    assert.equal(d.action, 'write');
    assert.match(d.reason, /^exact/);
    assert.equal(d.place.localityName, 'Tartagal');
  });

  it('no usa el nombre mostrado como identidad: escribe el placeId cualificado', () => {
    const d = decideRow(alertRow({ locality: 'Salta', province: 'Salta' }), ALERTS);
    assert.equal(d.place.placeId, SALTA_CAPITAL);
    assert.match(d.place.placeId, /^AR:georef:\d+$/);
  });

  it('la coordenada confirma el texto pero no lo elige', () => {
    // Centroide de Salta capital: la fila cae dentro del radio de confirmación.
    const salta = placeById(SALTA_CAPITAL)!;
    const confirmada = decideRow(
      alertRow({ locality: 'Salta', province: 'Salta', lat: salta.centroidLat, lon: salta.centroidLng }),
      ALERTS
    );
    assert.equal(confirmada.action, 'write');
    assert.match(confirmada.reason, /confirmado-por-coordenada$/);

    // La misma coordenada sin texto legacy no alcanza para escribir nada.
    const sinTexto = decideRow(
      alertRow({ locality: null, lat: salta.centroidLat, lon: salta.centroidLng }),
      ALERTS
    );
    assert.equal(sinTexto.action, 'no-source');
  });

  it('una coordenada lejana contradice el texto y manda la fila a revisión', () => {
    const d = decideRow(
      alertRow({ locality: 'Salta', province: 'Salta', lat: -34.6037, lon: -58.3816 }),
      ALERTS
    );
    assert.equal(d.action, 'conflict');
    assert.equal(d.reason, 'coordenada-contradice-el-texto');
    assert.ok(d.distanceKm! > CONTRADICT_KM);
  });

  it('una coordenada nula no contradice nada', () => {
    // Number(null) es 0, y (0,0) es un punto válido en el Golfo de Guinea:
    // sin filtrar los nulos, toda fila sin coordenada parecería contradictoria.
    for (const vacia of [null, undefined, '']) {
      const d = decideRow(alertRow({ locality: 'Salta Capital', province: 'Salta', lat: vacia, lon: vacia }), ALERTS);
      assert.equal(d.action, 'write', `lat/lon=${JSON.stringify(vacia)}`);
      assert.equal(d.reason, 'alias-solo-texto');
      assert.equal(d.place.placeId, SALTA_CAPITAL);
      assert.equal(d.distanceKm, null);
    }
  });

  it('no usa la coordenada donde no significa la ubicación declarada', () => {
    // En perfiles y cuentas la última posición del dispositivo no es la
    // ubicación que la persona declaró, así que esas tablas no la miran.
    assert.equal(PROFILES.lat, null);
    assert.equal(PROFILES.lon, null);
    assert.equal(USERS.lat, null);
    assert.equal(USERS.lon, null);
    assert.ok(ALERTS.lat && LISTINGS.lat);
  });
});

describe('alias legacy', () => {
  const inequivocos: [string, string, string][] = [
    ['Salta Capital', SALTA_CAPITAL, 'Salta'],
    ['Metán', METAN, 'San José de Metán'],
    ['Orán', ORAN, 'San Ramón de la Nueva Orán'],
    ['Cerrillos', CERRILLOS, 'San José de los Cerrillos'],
  ];

  for (const [legacy, placeId, esperado] of inequivocos) {
    it(`"${legacy}" con provincia resuelve a ${esperado}`, () => {
      const d = decideRow(alertRow({ locality: legacy, province: 'Salta' }), ALERTS);
      assert.equal(d.action, 'write');
      assert.equal(d.reason, 'alias-solo-texto');
      assert.equal(d.place.placeId, placeId);
      assert.equal(d.place.localityName, esperado);
    });
  }

  it('sin contexto territorial suficiente, el alias no se resuelve solo', () => {
    // "Cerrillos" existe en Salta y en Córdoba: sin provincia queda ambiguo.
    const d = decideRow({ id: 'p1', locality: 'Cerrillos', place_id: null }, PROFILES);
    assert.equal(d.action, 'conflict');
    assert.equal(d.reason, 'ambiguo');
    assert.ok(d.candidates!.length > 1);
  });
});

describe('lo ambiguo no se escribe', () => {
  it('San Lorenzo sigue ambiguo dentro de Salta y va a revisión manual', () => {
    const d = decideRow(alertRow({ locality: 'San Lorenzo', province: 'Salta' }), ALERTS);
    assert.equal(d.action, 'conflict');
    assert.equal(d.reason, 'ambiguo');
    assert.equal(d.place, undefined);
    assert.ok(d.candidates!.length > 1);
    for (const id of d.candidates!) assert.ok(placeById(id), `${id} debe existir en el catálogo`);
  });

  it('la coordenada no desempata una ambigüedad', () => {
    // Pegada al centroide de uno de los dos San Lorenzo: aun así no elige.
    const capital = placeById('AR:georef:66028060')!;
    const d = decideRow(
      alertRow({
        locality: 'San Lorenzo',
        province: 'Salta',
        lat: capital.centroidLat,
        lon: capital.centroidLng,
      }),
      ALERTS
    );
    assert.equal(d.action, 'conflict');
    assert.equal(d.reason, 'ambiguo');
  });

  it('el texto que parece una dirección no se convierte en localidad', () => {
    for (const texto of ['Lago portezuelo 2937', 'Av. Belgrano 1200', 'calle Alvarado', 'Ruta 51 km 12']) {
      assert.equal(looksLikeAddress(texto), true, texto);
      const d = decideRow(alertRow({ locality: texto, province: 'Salta' }), ALERTS);
      assert.equal(d.action, 'conflict');
      assert.equal(d.reason, 'parece-una-direccion');
      assert.equal(d.place, undefined);
    }
  });

  it('una localidad real con dígitos en el nombre no se confunde con dirección', () => {
    // El catálogo tiene nombres como "CABA - Comuna 3": el número no alcanza.
    assert.equal(looksLikeAddress('Comuna 3'), false);
    assert.equal(looksLikeAddress('Salta'), false);
  });

  it('un texto sin coincidencia tampoco se fuerza', () => {
    const d = decideRow(alertRow({ locality: 'Qwertyuiop', province: 'Salta' }), ALERTS);
    assert.equal(d.action, 'conflict');
    assert.equal(d.reason, 'sin-coincidencia');
    assert.equal(d.place, undefined);
  });

  it('las filas sin texto legacy se cuentan aparte, no como conflicto', () => {
    // Nunca tuvieron ubicación: no hay decisión humana que tomar.
    assert.equal(decideRow({ id: 'u1', location: null, place_id: null }, USERS).action, 'no-source');
    assert.equal(decideRow({ id: 'u2', location: '   ', place_id: null }, USERS).action, 'no-source');
  });
});

describe('consistencia del placeId escrito', () => {
  it('todo lo que se escribe existe en el catálogo y sus códigos coinciden', () => {
    const casos = ['Salta', 'Salta Capital', 'Cerrillos', 'Metán', 'Orán', 'Tartagal', 'Rosario de la Frontera'];
    for (const texto of casos) {
      const d = decideRow(alertRow({ locality: texto, province: 'Salta' }), ALERTS);
      assert.equal(d.action, 'write', texto);
      const catalogado = placeById(d.place.placeId);
      assert.ok(catalogado, `${d.place.placeId} debe existir en el catálogo`);
      assert.equal(d.place.admin1Code, catalogado!.admin1Code);
      assert.equal(d.place.admin2Code, catalogado!.admin2Code);
      assert.equal(d.place.admin1Code, '66'); // Salta
      assert.ok(d.place.admin2Code.startsWith('66'));
    }
  });

  it('el UPDATE escribe sólo las tres columnas nuevas y es idempotente en SQL', () => {
    const sql = updateStatement(ALERTS, 'alert-1', placeById(SALTA_CAPITAL));
    assert.match(sql, /^UPDATE alerts SET place_id = /);
    assert.match(sql, /AND place_id IS NULL;$/);
    for (const col of ['place_id', 'admin1_code', 'admin2_code']) assert.ok(sql.includes(col), col);
    // Nada de tocar legacy ni el esquema.
    for (const prohibido of ['locality', 'province', 'location', 'DROP', 'ALTER', 'DELETE']) {
      assert.ok(!sql.includes(prohibido), `el UPDATE no debe contener ${prohibido}`);
    }
  });

  it('escapa las comillas simples de los identificadores', () => {
    const sql = updateStatement(ALERTS, "o'brien", placeById(SALTA_CAPITAL));
    assert.ok(sql.includes("'o''brien'"));
  });
});

// ------------------------------------------------------------
// Extremo a extremo sobre una copia sqlite: idempotencia y legacy intacto.
// ------------------------------------------------------------

const SCHEMA = `
CREATE TABLE alerts (id TEXT PRIMARY KEY, locality TEXT, province TEXT, lat REAL, lon REAL,
  place_id TEXT, admin1_code TEXT, admin2_code TEXT);
CREATE TABLE listings (id TEXT PRIMARY KEY, locality TEXT, province TEXT, lat REAL, lon REAL,
  place_id TEXT, admin1_code TEXT, admin2_code TEXT);
CREATE TABLE profiles (id TEXT PRIMARY KEY, locality TEXT, place_id TEXT, admin1_code TEXT, admin2_code TEXT);
CREATE TABLE users (id TEXT PRIMARY KEY, location TEXT, place_id TEXT, admin1_code TEXT, admin2_code TEXT);

INSERT INTO alerts (id, locality, province, lat, lon) VALUES
  ('a-exacta', 'Salta', 'Salta', -24.80332, -65.42581),
  ('a-alias-sin-coord', 'Salta Capital', 'Salta', NULL, NULL),
  ('a-alias-cerrillos', 'Cerrillos', 'Salta', -24.8989, -65.4879),
  ('a-ambigua', 'San Lorenzo', 'Salta', NULL, NULL),
  ('a-direccion', 'Lago portezuelo 2937', NULL, NULL, NULL),
  ('a-sin-texto', NULL, NULL, NULL, NULL);
INSERT INTO listings (id, locality, province, lat, lon) VALUES
  ('l-alias', 'Metán', 'Salta', NULL, NULL);
INSERT INTO profiles (id, locality) VALUES ('p-alias', 'Salta Capital'), ('p-vacio', NULL);
INSERT INTO users (id, location) VALUES ('u-exacta', 'Salta'), ('u-vacio', '');
`;

function nuevaCopia() {
  const dir = mkdtempSync(join(tmpdir(), 'geo-backfill-'));
  const db = join(dir, 'copia.db');
  const sqlFile = join(dir, 'schema.sql');
  writeFileSync(sqlFile, SCHEMA, 'utf8');
  execFileSync('sqlite3', [db, `.read ${sqlFile}`], { encoding: 'utf8' });
  return db;
}

function volcado(db: string) {
  return execFileSync(
    'sqlite3',
    [
      db,
      'SELECT id, locality, province, lat, lon, place_id, admin1_code, admin2_code FROM alerts ORDER BY id;' +
        'SELECT id, locality, province, place_id, admin1_code, admin2_code FROM listings ORDER BY id;' +
        'SELECT id, locality, place_id, admin1_code, admin2_code FROM profiles ORDER BY id;' +
        'SELECT id, location, place_id, admin1_code, admin2_code FROM users ORDER BY id;',
    ],
    { encoding: 'utf8' }
  );
}

function correrBackfill(db: string, ...extra: string[]) {
  return execFileSync(
    process.execPath,
    ['--experimental-strip-types', script, `--target=local:${db}`, ...extra],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
}

describe('backfill extremo a extremo', () => {
  it('el dry-run no escribe nada', () => {
    const db = nuevaCopia();
    const antes = volcado(db);
    const salida = correrBackfill(db);
    assert.match(salida, /DRY-RUN/);
    assert.equal(volcado(db), antes);
  });

  it('aplica sólo las filas inequívocas y deja el resto sin place_id', () => {
    const db = nuevaCopia();
    correrBackfill(db, '--apply');

    const fila = (sql: string) => execFileSync('sqlite3', [db, sql], { encoding: 'utf8' }).trim();

    assert.equal(fila("SELECT place_id FROM alerts WHERE id='a-exacta'"), SALTA_CAPITAL);
    assert.equal(fila("SELECT place_id FROM alerts WHERE id='a-alias-sin-coord'"), SALTA_CAPITAL);
    assert.equal(fila("SELECT place_id FROM alerts WHERE id='a-alias-cerrillos'"), CERRILLOS);
    assert.equal(fila("SELECT place_id FROM listings WHERE id='l-alias'"), METAN);
    assert.equal(fila("SELECT place_id FROM profiles WHERE id='p-alias'"), SALTA_CAPITAL);
    assert.equal(fila("SELECT place_id FROM users WHERE id='u-exacta'"), SALTA_CAPITAL);

    // Ambiguo, dirección y vacíos quedan nulos.
    assert.equal(fila("SELECT count(*) FROM alerts WHERE id IN ('a-ambigua','a-direccion','a-sin-texto') AND place_id IS NOT NULL"), '0');
    assert.equal(fila("SELECT count(*) FROM profiles WHERE id='p-vacio' AND place_id IS NOT NULL"), '0');
    assert.equal(fila("SELECT count(*) FROM users WHERE id='u-vacio' AND place_id IS NOT NULL"), '0');

    // Los códigos acompañan siempre al placeId.
    for (const t of ['alerts', 'listings', 'profiles', 'users']) {
      assert.equal(
        fila(`SELECT count(*) FROM ${t} WHERE place_id IS NOT NULL AND (admin1_code IS NULL OR admin2_code IS NULL)`),
        '0',
        t
      );
    }
  });

  it('correr el backfill dos veces no cambia el resultado', () => {
    const db = nuevaCopia();
    correrBackfill(db, '--apply');
    const primera = volcado(db);

    const segunda = correrBackfill(db, '--apply');
    assert.equal(volcado(db), primera);
    // La segunda pasada reconoce lo ya resuelto en lugar de reescribirlo.
    assert.match(segunda, /ya-resuelto/);
    assert.match(segunda, /a escribir=0/);
  });

  it('no borra ni modifica los campos legacy', () => {
    const db = nuevaCopia();
    const legacySql =
      'SELECT id, locality, province, lat, lon FROM alerts ORDER BY id;' +
      'SELECT id, locality, province FROM listings ORDER BY id;' +
      'SELECT id, locality FROM profiles ORDER BY id;' +
      'SELECT id, location FROM users ORDER BY id;';
    const antes = execFileSync('sqlite3', [db, legacySql], { encoding: 'utf8' });

    correrBackfill(db, '--apply');

    assert.equal(execFileSync('sqlite3', [db, legacySql], { encoding: 'utf8' }), antes);
  });

  it('el informe de conflictos no expone datos personales', () => {
    const db = nuevaCopia();
    const salida = correrBackfill(db);
    const informe = salida.slice(salida.indexOf('CONFLICTOS'));

    assert.match(informe, /a-ambigua\s+San Lorenzo\s+Salta\s+ambiguo/);
    assert.match(informe, /a-direccion/);
    // Sólo datos técnicos: ni contactos, ni nombres de personas, ni coordenadas.
    for (const campo of ['@', 'phone', 'email', 'contact', 'user_id', 'owner']) {
      assert.ok(!informe.includes(campo), `el informe no debe incluir ${campo}`);
    }
    // Las filas sin texto de origen no van al informe manual.
    assert.ok(!informe.includes('a-sin-texto'));
    assert.ok(!informe.includes('p-vacio'));
  });
});

describe('alcance de la Fase 4', () => {
  const code = readFileSync(script, 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');

  it('el script no altera el esquema ni borra datos', () => {
    for (const prohibido of ['DROP ', 'ALTER TABLE', 'DELETE FROM', 'INSERT INTO']) {
      assert.ok(!code.includes(prohibido), `el backfill no debe contener ${prohibido}`);
    }
  });

  it('el script no llama a Georef: resuelve contra el snapshot embebido', () => {
    assert.ok(!/fetch\(/.test(code));
    assert.ok(!/apis\.datos\.gob\.ar/.test(code));
    assert.match(code, /geoplace\/catalog\.ts/);
  });

  it('los seis filtros territoriales del Worker siguen usando el texto legacy', () => {
    const worker = readFileSync(join(root, 'worker', 'index.js'), 'utf8');
    const filtros = worker.match(/LOWER\((?:a|l|pr)\.locality\) = LOWER\(\?\)/g) || [];
    assert.equal(filtros.length, 6);
  });
});
