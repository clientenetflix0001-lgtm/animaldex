// ============================================================
// Fase 5 — filtros territoriales por identidad + última señal de Inicio.
// ============================================================
// Dos cosas se prueban acá.
//
// Una: que los seis ámbitos territoriales filtren por identidad y que el
// fallback de texto alcance exactamente a las filas anteriores al catálogo,
// sin mezclar provincias y sin reclamar las dos filas que Fase 4 dejó
// deliberadamente sin resolver.
//
// Dos: que la señal de ubicación de Inicio ya no pase por el reverse geocoder
// del sistema operativo y que, cuando el resolvedor no puede afirmar una
// localidad, degrade al departamento oficial en vez de inventar una.
//
// Las consultas se ejecutan contra SQLite de verdad: el plegado de texto que
// arma el filtro vive en SQL, así que probarlo sólo en JS no probaría nada.
// ============================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SQL_FOLD_DEPTH,
  foldLikeSql,
  legacyLocalityPlan,
  legacyTextCondition,
  normalizeTerritory,
  rowMatchesTerritory,
  sqlFoldExpression,
  territoryCondition,
  territoryFromText,
  territoryRejected,
} from '../worker/geoFilter.js';
import { placeById } from '../lib/geoplace/catalog.ts';
import {
  parseTerritory,
  territoryFromArea,
  territoryFromPlace,
  territoryFromPlaceId,
  territoryQuery,
} from '../lib/geoplace/territory.ts';
import { parseLastLocation, publicPayloadHasUserCoords } from '../lib/lastLocation.ts';
import { payloadHasSensitiveLocation } from '../lib/pushPolicy.ts';
import { placeSignalFromResolution } from '../lib/lastLocationSignal.ts';
import type { AdministrativeArea, PlaceResolution } from '../lib/geoplace/types.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

/**
 * Fuente sin comentarios. Hace falta porque los encabezados explican de qué se
 * dejó de depender, y una búsqueda de `reverseGeocodeAsync` encontraría el
 * texto que documenta justamente su ausencia.
 */
const readCode = (rel: string) =>
  read(rel)
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');

const SALTA = 'AR:georef:66028050';
const CERRILLOS = 'AR:georef:66035010';
/** San Lorenzo de Capital: uno de los dos homónimos salteños. */
const SAN_LORENZO_SALTA = 'AR:georef:66028060';
const SAN_LORENZO_SANTA_FE = 'AR:georef:82119130';

// ------------------------------------------------------------
// Base de prueba
// ------------------------------------------------------------

const SCHEMA = `
CREATE TABLE alerts (
  id TEXT PRIMARY KEY, locality TEXT, province TEXT,
  place_id TEXT, admin1_code TEXT, admin2_code TEXT
);
CREATE TABLE listings (
  id TEXT PRIMARY KEY, locality TEXT, province TEXT,
  place_id TEXT, admin1_code TEXT, admin2_code TEXT
);
CREATE TABLE profiles (
  id TEXT PRIMARY KEY, locality TEXT,
  place_id TEXT, admin1_code TEXT, admin2_code TEXT
);
`;

/**
 * Filas de `alerts`. Las que tienen place_id son posteriores al catálogo; las
 * que no, son el universo legacy que el fallback tiene que alcanzar —o no.
 */
const ALERTS: Array<[string, string | null, string | null, string | null]> = [
  // id, locality, province, place_id
  ['nueva-salta', 'Salta', 'Salta', SALTA],
  ['nueva-cerrillos', 'San José de los Cerrillos', 'Salta', CERRILLOS],
  ['nueva-san-lorenzo', 'San Lorenzo', 'Salta', SAN_LORENZO_SALTA],
  ['nueva-san-lorenzo-santa-fe', 'San Lorenzo', 'Santa Fe', SAN_LORENZO_SANTA_FE],
  ['legacy-salta-mayusculas', 'SALTA CAPITAL', 'Salta', null],
  ['legacy-salta-espacios', '  Salta   Capital ', 'Salta', null],
  ['legacy-salta-sin-provincia', 'Salta', null, null],
  ['legacy-salta-en-bsas', 'Salta', 'Buenos Aires', null],
  ['legacy-cerrillos', 'Cerrillos', 'Salta', null],
  ['legacy-cerrillos-cordoba', 'Cerrillos', 'Córdoba', null],
  // Los dos conflictos que Fase 4 dejó sin resolver, tal como quedaron.
  ['conflicto-san-lorenzo', 'San Lorenzo', 'Salta', null],
  ['conflicto-direccion', 'Lago portezuelo 2937', null, null],
  // Homónimo de otra provincia: nunca puede aparecer en una consulta salteña.
  ['legacy-san-lorenzo-santa-fe', 'San Lorenzo', 'Santa Fe', null],
];

function makeDb(withGeoColumns = true): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  for (const [id, locality, province, placeId] of ALERTS) {
    const place = placeId ? placeById(placeId) : null;
    db.prepare('INSERT INTO alerts (id, locality, province, place_id, admin1_code, admin2_code) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, locality, province, placeId, place?.admin1Code ?? null, place?.admin2Code ?? null);
  }
  db.prepare('INSERT INTO listings (id, locality, province, place_id, admin1_code, admin2_code) VALUES (?, ?, ?, ?, ?, ?)')
    .run('l-nueva-salta', 'Salta', 'Salta', SALTA, '66', '66028');
  db.prepare('INSERT INTO listings (id, locality, province) VALUES (?, ?, ?)')
    .run('l-legacy-cerrillos', 'Cerrillos', 'Salta');
  db.prepare('INSERT INTO profiles (id, locality, place_id, admin1_code, admin2_code) VALUES (?, ?, ?, ?, ?)')
    .run('pr-nueva-cerrillos', 'San José de los Cerrillos', CERRILLOS, '66', '66035');
  db.prepare('INSERT INTO profiles (id, locality) VALUES (?, ?)')
    .run('pr-legacy-cerrillos', 'Cerrillos');

  if (!withGeoColumns) {
    // Una base donde migrations/015 no se aplicó: el Worker tiene que seguir
    // respondiendo, con el texto legacy como única herramienta.
    db.exec('CREATE TABLE vieja (id TEXT PRIMARY KEY, locality TEXT, province TEXT)');
    db.exec("INSERT INTO vieja SELECT id, locality, province FROM alerts WHERE place_id IS NULL");
    db.exec('DROP TABLE alerts');
    db.exec('ALTER TABLE vieja RENAME TO alerts');
  }
  return db;
}

/** env falso con una D1 mínima respaldada por node:sqlite. */
function fakeEnv(db: DatabaseSync) {
  return {
    DB: {
      prepare(sql: string) {
        return {
          all: async () => ({ results: db.prepare(sql).all() }),
          bind: (...params: unknown[]) => ({
            all: async () => ({ results: db.prepare(sql).all(...(params as any[])) }),
          }),
        };
      },
    },
  } as any;
}

/** Ids que devuelve el filtro territorial de una tabla. */
async function idsFor(
  db: DatabaseSync,
  table: 'alerts' | 'listings' | 'profiles',
  alias: string,
  territory: unknown
): Promise<string[] | null> {
  const condition = await territoryCondition(fakeEnv(db), table, alias, territory);
  if (!condition) return null;
  const sql = `SELECT ${alias}.id FROM ${table} ${alias} WHERE ${condition.sql} ORDER BY ${alias}.id`;
  return db.prepare(sql).all(...(condition.values as any[])).map((r: any) => String(r.id));
}

// ------------------------------------------------------------
// 1. Identidad de localidad
// ------------------------------------------------------------

describe('filtrado por identidad de localidad', () => {
  it('Salta por place_id trae lo nuevo y lo legacy que sea inequívoco', async () => {
    const db = makeDb();
    const ids = await idsFor(db, 'alerts', 'a', normalizeTerritory({ placeId: SALTA }));
    assert.deepEqual(ids, [
      'legacy-salta-espacios',
      'legacy-salta-mayusculas',
      'legacy-salta-sin-provincia',
      'nueva-salta',
    ]);
    db.close();
  });

  it('Cerrillos oficial encuentra las filas nuevas de su placeId', async () => {
    const db = makeDb();
    const alerts = await idsFor(db, 'alerts', 'a', normalizeTerritory({ placeId: CERRILLOS }));
    assert.ok(alerts?.includes('nueva-cerrillos'));
    // Y en las otras dos tablas filtrables pasa lo mismo.
    assert.ok((await idsFor(db, 'profiles', 'pr', normalizeTerritory({ placeId: CERRILLOS })))?.includes('pr-nueva-cerrillos'));
    db.close();
  });

  it("legacy 'Cerrillos' sigue visible por el fallback, con la provincia puesta", async () => {
    const db = makeDb();
    const territory = normalizeTerritory({ placeId: CERRILLOS });
    // El nombre oficial es "San José de los Cerrillos": sin fallback, quien
    // elige la localidad del catálogo no vería nada de lo guardado antes.
    assert.deepEqual(await idsFor(db, 'alerts', 'a', territory), ['legacy-cerrillos', 'nueva-cerrillos']);
    assert.deepEqual(await idsFor(db, 'listings', 'l', territory), ['l-legacy-cerrillos']);
    db.close();
  });

  it("'Cerrillos' sólo entra con provincia, porque el nombre es ambiguo en el país", () => {
    const plan = legacyLocalityPlan(placeById(CERRILLOS)!);
    assert.deepEqual(plan.anywhere, ['san jose de los cerrillos']);
    assert.deepEqual(plan.withProvince, ['cerrillos']);
    assert.deepEqual(plan.provinces, ['salta']);
  });

  it('las filas sin place_id siguen siendo alcanzables', async () => {
    const db = makeDb();
    const ids = await idsFor(db, 'alerts', 'a', normalizeTerritory({ placeId: SALTA }));
    assert.ok(ids!.some((id) => id.startsWith('legacy-')), 'ninguna fila legacy entró');
    const legacyRows = db.prepare("SELECT COUNT(*) AS n FROM alerts WHERE place_id IS NULL").get() as any;
    assert.equal(legacyRows.n, 9, 'el filtro no escribe: las filas legacy siguen sin place_id');
    db.close();
  });
});

// ------------------------------------------------------------
// 2. Homónimos
// ------------------------------------------------------------

describe('homónimos de distintas provincias', () => {
  it('el Cerrillos de Córdoba nunca aparece en una consulta salteña', async () => {
    const db = makeDb();
    const ids = await idsFor(db, 'alerts', 'a', normalizeTerritory({ placeId: CERRILLOS }));
    assert.ok(!ids!.includes('legacy-cerrillos-cordoba'));
    db.close();
  });

  it('un nombre único en el país tampoco se queda con filas de otra provincia', async () => {
    const db = makeDb();
    const ids = await idsFor(db, 'alerts', 'a', normalizeTerritory({ placeId: SALTA }));
    // "Salta" resuelve a un único lugar, pero una fila que declara Buenos
    // Aires dice pertenecer a otro lado y hay que creerle.
    assert.ok(!ids!.includes('legacy-salta-en-bsas'));
    // Sin provincia declarada no hay contradicción y la fila entra.
    assert.ok(ids!.includes('legacy-salta-sin-provincia'));
    db.close();
  });

  it('dos San Lorenzo con placeId distinto no se ven entre sí', async () => {
    const db = makeDb();
    const salta = await idsFor(db, 'alerts', 'a', normalizeTerritory({ placeId: SAN_LORENZO_SALTA }));
    const santaFe = await idsFor(db, 'alerts', 'a', normalizeTerritory({ placeId: SAN_LORENZO_SANTA_FE }));
    assert.deepEqual(salta, ['nueva-san-lorenzo']);
    assert.deepEqual(santaFe, ['nueva-san-lorenzo-santa-fe']);
    db.close();
  });

  it('un cliente viejo que manda texto ve sólo la provincia que pidió', () => {
    // "San Lorenzo" no resuelve a ningún lugar ni con la provincia puesta, así
    // que el Worker cae en la comparación de texto. Esa comparación tiene que
    // respetar la provincia declarada.
    assert.equal(territoryFromText('San Lorenzo', 'Santa Fe'), null);
  });

  it('la comparación legacy pura también respeta la provincia', () => {
    const db = makeDb();
    const condition = legacyTextCondition('a', 'alerts', 'San Lorenzo', 'Santa Fe')!;
    const rows = db
      .prepare(`SELECT a.id FROM alerts a WHERE ${condition.sql} ORDER BY a.id`)
      .all(...(condition.values as any[]))
      .map((r: any) => String(r.id));
    // Las dos de Santa Fe, y ninguna de Salta.
    assert.deepEqual(rows, ['legacy-san-lorenzo-santa-fe', 'nueva-san-lorenzo-santa-fe']);
    db.close();
  });
});

// ------------------------------------------------------------
// 3. Los dos conflictos de Fase 4
// ------------------------------------------------------------

describe('lo que Fase 4 dejó sin resolver sigue sin resolverse', () => {
  it('San Lorenzo ambiguo no se asigna a ninguno de los dos salteños', () => {
    // Dos San Lorenzo en Salta: el resolvedor no elige ni con la provincia.
    assert.equal(territoryFromText('San Lorenzo', 'Salta'), null);
    // Y el filtro tampoco acepta el texto como variante del placeId.
    const plan = legacyLocalityPlan(placeById(SAN_LORENZO_SALTA)!);
    assert.deepEqual(plan.anywhere, []);
    assert.deepEqual(plan.withProvince, []);
  });

  it('la fila del San Lorenzo ambiguo no la reclama ninguna consulta', async () => {
    const db = makeDb();
    for (const territory of [
      normalizeTerritory({ placeId: SAN_LORENZO_SALTA }),
      normalizeTerritory({ placeId: SALTA }),
      territoryFromText('San Lorenzo', 'Santa Fe'),
    ]) {
      const ids = await idsFor(db, 'alerts', 'a', territory);
      assert.ok(!ids?.includes('conflicto-san-lorenzo'), 'la fila ambigua entró por identidad de localidad');
    }
    // Sí entra por departamento y por provincia: ahí el texto no decide nada,
    // y su provincia declarada la ubica sin ambigüedad.
    const admin1 = await idsFor(db, 'alerts', 'a', normalizeTerritory({ admin1Code: '66', territoryScope: 'admin1' }));
    assert.ok(admin1!.includes('conflicto-san-lorenzo'));
    db.close();
  });

  it('el texto con pinta de dirección no lo reclama nadie', async () => {
    const db = makeDb();
    for (const body of [
      { placeId: SALTA },
      { placeId: CERRILLOS },
      { admin2Code: '66028', territoryScope: 'admin2' },
      { admin1Code: '66', territoryScope: 'admin1' },
    ]) {
      const ids = await idsFor(db, 'alerts', 'a', normalizeTerritory(body));
      assert.ok(!ids?.includes('conflicto-direccion'), `entró con ${JSON.stringify(body)}`);
    }
    db.close();
  });
});

// ------------------------------------------------------------
// 4. Ámbitos administrativos
// ------------------------------------------------------------

describe('ámbitos admin1 y admin2', () => {
  it('el departamento trae las localidades que lo componen', async () => {
    const db = makeDb();
    const ids = await idsFor(db, 'alerts', 'a', normalizeTerritory({ admin2Code: '66028', territoryScope: 'admin2' }));
    // Capital de Salta: Cobos, Salta y San Lorenzo.
    assert.ok(ids!.includes('nueva-salta'));
    assert.ok(ids!.includes('nueva-san-lorenzo'));
    // El Cerrillos de otro departamento no.
    assert.ok(!ids!.includes('nueva-cerrillos'));
    assert.ok(!ids!.includes('legacy-cerrillos'));
    db.close();
  });

  it('la provincia compara la columna de nivel 1, sin enumerar localidades', async () => {
    const db = makeDb();
    const ids = await idsFor(db, 'alerts', 'a', normalizeTerritory({ admin1Code: '66', territoryScope: 'admin1' }));
    assert.ok(ids!.includes('nueva-cerrillos'));
    assert.ok(ids!.includes('legacy-cerrillos'));
    // Otras provincias quedan afuera, igual que la fila sin provincia.
    assert.ok(!ids!.includes('legacy-cerrillos-cordoba'));
    assert.ok(!ids!.includes('legacy-salta-en-bsas'));
    assert.ok(!ids!.includes('conflicto-direccion'));
    db.close();
  });

  it('los códigos que el catálogo no reconoce se rechazan en vez de filtrar vacío', () => {
    assert.equal(normalizeTerritory({ placeId: 'AR:georef:00000000' }), null);
    assert.equal(territoryRejected({ placeId: 'AR:georef:00000000' }), true);
    assert.equal(territoryRejected({ admin2Code: '99999' }), true);
    assert.equal(territoryRejected({ admin1Code: '99' }), true);
    assert.equal(territoryRejected({ placeId: SALTA }), false);
    assert.equal(territoryRejected({}), false);
  });

  it('los códigos se derivan del catálogo, no de lo que mandó el cliente', () => {
    // Un cliente que afirma una provincia que no corresponde al placeId no
    // consigue nada: los códigos salen del lugar.
    const territory = normalizeTerritory({ placeId: CERRILLOS, admin1Code: '02', admin2Code: '99999' });
    assert.equal(territory.admin1Code, '66');
    assert.equal(territory.admin2Code, '66035');
  });
});

// ------------------------------------------------------------
// 5. Paridad SQL / JS y límites de SQLite
// ------------------------------------------------------------

describe('el plegado de texto', () => {
  it('la expresión SQL y su réplica en JS dan lo mismo', () => {
    const db = new DatabaseSync(':memory:');
    const expression = sqlFoldExpression('?');
    const stmt = db.prepare(`SELECT ${expression} AS folded`);
    for (const text of [
      'Salta', 'SALTA CAPITAL', '  Salta   Capital ', 'Orán', 'ORÁN', 'orán',
      'San José de los Cerrillos', 'Metán', 'Ñorquinco', 'Río Cuarto', "O'Higgins",
    ]) {
      const row = stmt.get(text) as any;
      assert.equal(row.folded, foldLikeSql(text), `difieren para ${JSON.stringify(text)}`);
    }
    db.close();
  });

  it('entra en el límite de anidamiento del parser de SQLite', () => {
    // Medido: treinta llamadas anidadas pasan, treinta y una da
    // "parser stack overflow". Dieciocho deja margen.
    assert.equal(SQL_FOLD_DEPTH, 18);
    assert.ok(SQL_FOLD_DEPTH < 30);
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE t (locality TEXT, province TEXT)');
    // La consulta más anidada que arma el filtro: dos columnas plegadas.
    const sql = `SELECT * FROM t WHERE ${sqlFoldExpression('t.locality')} = ? AND ${sqlFoldExpression('t.province')} = ?`;
    assert.doesNotThrow(() => db.prepare(sql));
    db.close();
  });

  it("LOWER() de SQLite no alcanza: por eso se quitan los diacríticos antes", () => {
    const db = new DatabaseSync(':memory:');
    const row = db.prepare("SELECT lower('ORÁN') AS l").get() as any;
    assert.equal(row.l, 'orÁn', 'lower() de SQLite es sólo ASCII');
    db.close();
    assert.equal(foldLikeSql('ORÁN'), 'oran');
  });

  it('rowMatchesTerritory decide igual que el SQL', async () => {
    const db = makeDb();
    const rows = db.prepare('SELECT id, locality, province, place_id FROM alerts').all() as any[];
    for (const body of [
      { placeId: SALTA },
      { placeId: CERRILLOS },
      { placeId: SAN_LORENZO_SALTA },
      { admin2Code: '66028', territoryScope: 'admin2' },
      { admin1Code: '66', territoryScope: 'admin1' },
    ]) {
      const territory = normalizeTerritory(body);
      const fromSql = await idsFor(db, 'alerts', 'a', territory);
      const fromJs = rows
        .filter((r) => rowMatchesTerritory(r, 'alerts', territory))
        .map((r) => String(r.id))
        .sort();
      assert.deepEqual(fromJs, fromSql, `difieren para ${JSON.stringify(body)}`);
    }
    db.close();
  });
});

// ------------------------------------------------------------
// 6. Esquema sin migrar
// ------------------------------------------------------------

describe('base sin migrations/015 aplicada', () => {
  it('el filtro degrada al texto legacy en vez de fallar', async () => {
    const db = makeDb(false);
    const condition = await territoryCondition(fakeEnv(db), 'alerts', 'a', normalizeTerritory({ placeId: SALTA }));
    assert.ok(condition, 'sin columnas nuevas debería quedar la rama de texto');
    assert.doesNotMatch(condition!.sql, /place_id/);
    const ids = db
      .prepare(`SELECT a.id FROM alerts a WHERE ${condition!.sql} ORDER BY a.id`)
      .all(...(condition!.values as any[]))
      .map((r: any) => String(r.id));
    assert.deepEqual(ids, ['legacy-salta-espacios', 'legacy-salta-mayusculas', 'legacy-salta-sin-provincia']);
    db.close();
  });
});

// ------------------------------------------------------------
// 7. Identidad del lado del cliente
// ------------------------------------------------------------

describe('identidad territorial en el cliente', () => {
  it('el ámbito de localidad viaja como placeId y códigos derivados', () => {
    const territory = territoryFromPlace(placeById(CERRILLOS)!);
    assert.deepEqual(territoryQuery(territory), {
      territoryScope: 'locality',
      placeId: CERRILLOS,
      admin1Code: '66',
      admin2Code: '66035',
    });
  });

  it('el ámbito departamental viaja sin placeId', () => {
    const area: AdministrativeArea = {
      countryCode: 'AR',
      provider: 'georef',
      admin1Code: '66',
      admin1Name: 'Salta',
      admin2Code: '66035',
      admin2Name: 'Cerrillos',
      governmentLocalCode: null,
      governmentLocalName: null,
    };
    const territory = territoryFromArea(area)!;
    assert.equal(territory.placeId, null);
    assert.equal(territory.scope, 'admin2');
    assert.deepEqual(territoryQuery(territory), {
      territoryScope: 'admin2',
      admin1Code: '66',
      admin2Code: '66035',
    });
  });

  it('una identidad guardada se revalida contra el catálogo', () => {
    assert.equal(parseTerritory({ scope: 'locality', placeId: 'AR:georef:00000000' }), null);
    assert.equal(parseTerritory({ scope: 'admin2', admin2Code: '99999' }), null);
    assert.equal(territoryFromPlaceId('AR:georef:00000000'), null);
    assert.equal(parseTerritory({ scope: 'locality', placeId: SALTA })?.admin2Code, '66028');
  });

  it('sin identidad no se manda nada, y el Worker degrada al texto', () => {
    assert.deepEqual(territoryQuery(null), {});
    assert.equal(normalizeTerritory({}), null);
  });
});

// ------------------------------------------------------------
// 8. La señal de Inicio
// ------------------------------------------------------------

function resolution(over: Partial<PlaceResolution>): PlaceResolution {
  return {
    administrativeArea: null,
    candidates: [],
    confidence: 'low',
    requiresConfirmation: true,
    source: 'offline-fallback',
    boundaryRisk: false,
    governmentLocalCorroborated: false,
    reason: 'offline-fallback',
    ...over,
  };
}

const CERRILLOS_AREA: AdministrativeArea = {
  countryCode: 'AR',
  provider: 'georef',
  admin1Code: '66',
  admin1Name: 'Salta',
  admin2Code: '66035',
  admin2Name: 'Cerrillos',
  governmentLocalCode: null,
  governmentLocalName: null,
};

describe('lastLocationSync', () => {
  const sync = readCode('lib/lastLocationSync.ts');

  it('ya no usa reverseGeocodeAsync ni detectCurrentLocality', () => {
    assert.doesNotMatch(sync, /reverseGeocodeAsync/);
    assert.doesNotMatch(sync, /detectCurrentLocality/);
    assert.match(sync, /locateCurrentPlace\(\)/);
    // Y tampoco pide la posición por su cuenta: eso vive en placeLocate.
    assert.doesNotMatch(sync, /getCurrentPositionAsync/);
    assert.doesNotMatch(sync, /expo-location/);
  });

  it('un lugar inequívoco se convierte en identidad de localidad', () => {
    const place = placeById(CERRILLOS)!;
    const signal = placeSignalFromResolution({
      ok: true,
      ...resolution({
        administrativeArea: CERRILLOS_AREA,
        candidates: [{ place, distanceKm: 2, withinResolvedArea: true, governmentLocalMatch: false }],
        confidence: 'high',
        requiresConfirmation: false,
        source: 'official',
      }),
    } as any);
    assert.equal(signal.place?.placeId, CERRILLOS);
    assert.equal(signal.territory?.scope, 'locality');
    assert.equal(signal.territory?.placeId, CERRILLOS);
  });

  it('si el resolvedor pide confirmación no se inventa localidad: degrada a departamento', () => {
    const signal = placeSignalFromResolution({
      ok: true,
      ...resolution({
        administrativeArea: CERRILLOS_AREA,
        candidates: [
          { place: placeById(CERRILLOS)!, distanceKm: 2, withinResolvedArea: true, governmentLocalMatch: false },
          { place: placeById(SALTA)!, distanceKm: 9, withinResolvedArea: false, governmentLocalMatch: false },
        ],
        confidence: 'medium',
        requiresConfirmation: true,
        source: 'official',
      }),
    } as any);
    assert.equal(signal.place, null);
    assert.equal(signal.territory?.scope, 'admin2');
    assert.equal(signal.territory?.placeId, null);
    assert.equal(signal.territory?.admin2Code, '66035');
  });

  it('sin área oficial no se afirma territorio alguno', () => {
    // Es el caso del fallback offline: candidatos por centroide cercano, que
    // son una sugerencia y no una pertenencia.
    const signal = placeSignalFromResolution({
      ok: true,
      ...resolution({
        candidates: [{ place: placeById(SALTA)!, distanceKm: 40, withinResolvedArea: false, governmentLocalMatch: false }],
      }),
    } as any);
    assert.equal(signal.place, null);
    assert.equal(signal.territory, null);
  });

  it('sin permiso de ubicación tampoco', () => {
    const signal = placeSignalFromResolution({ ok: false, reason: 'permission-denied' } as any);
    assert.equal(signal.place, null);
    assert.equal(signal.territory, null);
  });
});

// ------------------------------------------------------------
// 9. Privacidad
// ------------------------------------------------------------

describe('privacidad de la ubicación', () => {
  const sync = read('lib/lastLocationSync.ts');
  const locate = read('lib/placeLocate.ts');
  const worker = read('worker/index.js');
  const noComments = (rel: string) => readCode(rel);

  it('lo que se guarda es el centroide público, no la posición del dispositivo', () => {
    assert.match(sync, /lat: place\?\.centroidLat/);
    assert.match(sync, /lng: place\?\.centroidLng/);
    // locateCurrentPlace no devuelve la coordenada, así que la señal no tiene
    // forma de acceder a ella.
    assert.doesNotMatch(locate, /return \{ ok: true, coords/);
    assert.match(locate, /Nunca devuelve la coordenada del usuario/);
  });

  it('no hay logs con coordenadas', () => {
    for (const rel of [
      'lib/lastLocationSync.ts',
      'lib/lastLocationSignal.ts',
      'lib/lastLocation.ts',
      'lib/placeLocate.ts',
      'worker/geoFilter.js',
    ]) {
      assert.doesNotMatch(noComments(rel), /console\.(log|warn|info|error)/, rel);
    }
  });

  it('las protecciones anteriores siguen en pie', () => {
    assert.equal(publicPayloadHasUserCoords({ last_lat: -24.8, last_lng: -65.4 }), true);
    assert.equal(publicPayloadHasUserCoords({ id: 'u', location: 'Salta' }), false);
    assert.equal(payloadHasSensitiveLocation({ data: { lat: -24.8, lon: -65.4 } }), true);
    assert.equal(payloadHasSensitiveLocation({ title: 'Perdido en Salta', data: {} }), false);
    assert.match(worker, /function stripAlertCoords/);
    assert.match(worker, /from '\.\.\/lib\/pushPolicy\.ts'/);
    // publicUser no expone ni la última ubicación ni la identidad territorial.
    const start = worker.indexOf('function publicUser(u)');
    assert.ok(start > 0);
    const block = worker.slice(start, worker.indexOf('\n}', start));
    assert.doesNotMatch(block, /last_lat|last_lng|last_locality|place_id/);
  });

  it('el snapshot guardado tolera versiones anteriores y valida la identidad', () => {
    // Caché vieja: sin territory y con source 'gps'.
    const old = parseLastLocation({ lat: -24.79, lng: -65.41, locality: 'Salta', updatedAt: 1, source: 'gps' });
    assert.equal(old?.territory, null);
    assert.equal(old?.source, 'gps');
    // Identidad manipulada: se descarta sin invalidar el resto del snapshot.
    const tampered = parseLastLocation({
      lat: -24.79, lng: -65.41, locality: 'Salta', updatedAt: 1, source: 'geo',
      territory: { scope: 'locality', placeId: 'AR:georef:00000000' },
    });
    assert.equal(tampered?.territory, null);
    assert.equal(tampered?.locality, 'Salta');
    // Identidad válida: sobrevive con los códigos del catálogo.
    const good = parseLastLocation({
      lat: -24.79, lng: -65.41, locality: 'Salta', updatedAt: 1, source: 'geo',
      territory: { scope: 'locality', placeId: SALTA },
    });
    assert.equal(good?.territory?.admin2Code, '66028');
  });
});

// ------------------------------------------------------------
// 10. Georef caído
// ------------------------------------------------------------

describe('Georef caído', () => {
  it('nada del filtrado territorial sale a la red', () => {
    const filter = read('worker/geoFilter.js');
    assert.doesNotMatch(filter, /fetch\(/);
    assert.doesNotMatch(filter, /apis\.datos\.gob\.ar/);
    // Todo se resuelve contra el snapshot embebido.
    assert.match(filter, /geoplace\/catalog\.ts/);
  });

  it('el filtro sigue funcionando con el catálogo local', async () => {
    // Los tests de este archivo no tienen red y todos filtran igual, pero
    // dejarlo explícito evita que alguien agregue una llamada upstream.
    const db = makeDb();
    assert.ok((await idsFor(db, 'alerts', 'a', normalizeTerritory({ placeId: SALTA })))!.length > 0);
    db.close();
  });

  it('un candidato de baja confianza no se convierte en identidad', () => {
    const signal = placeSignalFromResolution({
      ok: true,
      ...resolution({
        candidates: [{ place: placeById(SALTA)!, distanceKm: 1, withinResolvedArea: true, governmentLocalMatch: true }],
        confidence: 'low',
        requiresConfirmation: true,
      }),
    } as any);
    assert.equal(signal.territory, null);
  });
});
