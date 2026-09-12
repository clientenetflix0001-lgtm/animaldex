// ============================================================
// Fase 3 — PlacePicker, GPS normalizado, escritura nueva y atribución.
// ============================================================
// Lo que se verifica acá:
//   - el texto que escribe el usuario no puede persistirse como ubicación;
//   - la búsqueda manual sale del catálogo oficial y desambigua;
//   - el GPS pasa por el endpoint GEO y el usuario confirma;
//   - la posición exacta del usuario no llega a la UI ni es trilaterable;
//   - las escrituras nuevas guardan un placeId cualificado sin romper legacy;
//   - la atribución CC BY 4.0 está visible;
//   - nada de esto cambió los filtros territoriales ni los campos legacy.
// ============================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GEO_ATTRIBUTION,
  geoCatalogMeta,
  placeById,
  placesInAdmin2,
  searchPlaces,
} from '../lib/geoplace/catalog.ts';
import { resolveAdmin1Code } from '../lib/geoplace/aliases.ts';
import {
  coarseDistanceLabel,
  placeContextLabel,
  placeFullLabel,
} from '../lib/geoplace/format.ts';
import { placeFromCoords } from '../lib/geoplace/resolve.ts';
import { geoCell } from '../lib/geoplace/cell.ts';
import type { AdministrativeArea, PlaceResolution } from '../lib/geoplace/types.ts';
import { handleGeo } from '../worker/geo.js';
import {
  GEO_WRITE_COLUMNS,
  geoInsertFragment,
  geoUpdateFragment,
  normalizeIncomingPlace,
  placeIdRejected,
} from '../worker/geoWrite.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

/**
 * El mismo archivo sin comentarios de línea. Necesario cuando se comprueba la
 * AUSENCIA de algo: los comentarios de estos módulos explican justamente lo que
 * dejaron de hacer, y nombrarlo no es usarlo.
 */
const readCode = (rel: string) =>
  read(rel)
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');

const picker = read('components/PlacePicker.tsx');
const locate = read('lib/placeLocate.ts');
const worker = read('worker/index.js');

/** Pantallas donde el usuario elige una ubicación. */
const PICKER_SCREENS = [
  'screens/CreateAlertScreen.tsx',
  'screens/AlertsScreen.tsx',
  'screens/CreateListingScreen.tsx',
  'screens/MarketScreen.tsx',
  'screens/AdoptionDiscoveryScreen.tsx',
  'screens/EditPublicProfileScreen.tsx',
  'screens/EditProfileScreen.tsx',
];

// ------------------------------------------------------------
// 1. PlacePicker: el texto escrito es una consulta, no una ubicación
// ------------------------------------------------------------

describe('PlacePicker sin texto libre', () => {
  it('no existe forma de aceptar lo que escribió el usuario', () => {
    assert.doesNotMatch(picker, /acceptTyped/);
    assert.doesNotMatch(picker, /Usar "/);
    assert.doesNotMatch(picker, /onSubmitEditing/);
    // El único uso de `query` es alimentar la búsqueda.
    assert.match(picker, /searchPlaces\(trimmed/);
    assert.doesNotMatch(picker, /locality: query/);
    assert.doesNotMatch(picker, /getProvinceForLocality/);
  });

  it('la selección siempre sale de un GeoPlace del catálogo', () => {
    // `placeSelection` es la única constructora del payload y toma un GeoPlace.
    assert.match(picker, /export function placeSelection\(place: GeoPlace\)/);
    assert.match(picker, /locality: place\.localityName/);
    assert.match(picker, /place\.admin1Name \|\| null/);
    // onSelect se invoca exclusivamente con el resultado de placeSelection.
    const calls = picker.match(/onSelect\(/g) || [];
    assert.equal(calls.length, 1);
    assert.match(picker, /onSelect\(placeSelection\(place\)\)/);
  });

  it('sin coincidencias ofrece reintentar o usar el GPS, no crear la localidad', () => {
    assert.match(picker, /No encontramos esa ubicación/);
    assert.match(picker, /Intentar otra búsqueda/);
    assert.match(picker, /Usar mi ubicación actual/);
  });

  it('las coordenadas que emite son el centroide público, no la del dispositivo', () => {
    assert.match(picker, /lat: place\.centroidLat/);
    assert.match(picker, /lon: place\.centroidLng/);
    const place = placeById('AR:georef:66035010')!;
    assert.equal(place.centroidLat, -24.88661);
    // El centroide es un dato público del catálogo: idéntico para todos.
    assert.equal(placeById('AR:georef:66035010')!.centroidLng, place.centroidLng);
  });

  it('todas las pantallas de selección usan PlacePicker y ninguna LocalityPicker', () => {
    for (const file of PICKER_SCREENS) {
      const src = read(file);
      assert.match(src, /PlacePicker/, file);
      assert.doesNotMatch(src, /LocalityPicker/, file);
    }
  });

  it('ninguna pantalla de selección escribe la ubicación con un TextInput libre', () => {
    for (const file of PICKER_SCREENS) {
      const src = read(file);
      assert.doesNotMatch(src, /onChangeText=\{setLocality\}/, file);
      assert.doesNotMatch(src, /onChangeText=\{setProvince\}/, file);
      // EditPublicProfileScreen es la única excepción y es deliberada: ahí
      // `location` es la dirección de un comercio, no la identidad territorial.
      if (file !== 'screens/EditPublicProfileScreen.tsx') {
        assert.doesNotMatch(src, /onChangeText=\{setLocation\}/, file);
      }
    }
  });
});

// ------------------------------------------------------------
// 2. Búsqueda manual contra el catálogo
// ------------------------------------------------------------

describe('búsqueda del PlacePicker', () => {
  it('"oran" encuentra San Ramón de la Nueva Orán sin acentos', () => {
    const res = searchPlaces('oran', { admin1Code: resolveAdmin1Code('Salta')! });
    assert.equal(res.matches[0].place.placeId, 'AR:georef:66126070');
    assert.equal(res.matches[0].place.localityName, 'San Ramón de la Nueva Orán');
    assert.equal(res.matches[0].place.admin2Name, 'Orán');
  });

  it('"metan" encuentra San José de Metán', () => {
    const res = searchPlaces('metan', { admin1Code: resolveAdmin1Code('Salta')! });
    assert.equal(res.matches[0].place.placeId, 'AR:georef:66112040');
    assert.equal(res.matches[0].place.localityName, 'San José de Metán');
  });

  it('"San Lorenzo" es ambiguo y se muestra desambiguado', () => {
    const res = searchPlaces('San Lorenzo');
    assert.equal(res.ambiguous, true);
    assert.ok(res.exactCount > 1);
    const labels = res.matches.map((m) => placeFullLabel(m.place));
    assert.ok(labels.includes('San Lorenzo · Capital, Salta'), labels.join(' / '));
    assert.ok(labels.includes('San Lorenzo · Rosario de la Frontera, Salta'), labels.join(' / '));
    // Cuando el departamento se llama igual que la localidad, repetirlo no
    // desambigua nada: alcanza la provincia.
    assert.ok(labels.includes('San Lorenzo · Santa Fe'), labels.join(' / '));
    // Ninguna etiqueta se repite: si dos opciones se ven iguales, el usuario
    // no puede elegir.
    assert.equal(new Set(labels).size, labels.length);
  });

  it('acentos y mayúsculas no cambian el resultado', () => {
    const plain = searchPlaces('san lorenzo').matches.map((m) => m.place.placeId);
    const loud = searchPlaces('SAN LÓRENZO').matches.map((m) => m.place.placeId);
    assert.deepEqual(loud, plain);
    assert.deepEqual(
      searchPlaces('metán').matches.map((m) => m.place.placeId),
      searchPlaces('METAN').matches.map((m) => m.place.placeId)
    );
  });

  it('un nombre inexistente no devuelve nada y no crea una localidad', () => {
    const res = searchPlaces('Villa Que No Existe 9999');
    assert.deepEqual(res.matches, []);
    assert.equal(res.ambiguous, false);
    assert.equal(placeById('AR:georef:villa-que-no-existe-9999'), null);
    assert.equal(normalizeIncomingPlace({ placeId: 'Villa Que No Existe 9999' }).placeId, null);
  });
});

// ------------------------------------------------------------
// 3. GPS: endpoint GEO, departamento como ancla, confirmación del usuario
// ------------------------------------------------------------

const CERRILLOS_AREA: AdministrativeArea = {
  countryCode: 'AR',
  provider: 'georef',
  admin1Code: '66',
  admin1Name: 'Salta',
  admin2Code: '66035',
  admin2Name: 'Cerrillos',
  governmentLocalCode: '660077',
  governmentLocalName: 'San José de los Cerrillos',
};

describe('GPS normalizado', () => {
  it('no usa reverseGeocodeAsync como identidad territorial', () => {
    assert.doesNotMatch(readCode('lib/placeLocate.ts'), /reverseGeocodeAsync/);
    assert.match(locate, /requestForegroundPermissionsAsync/);
    assert.match(locate, /getCurrentPositionAsync/);
    assert.match(locate, /db\.geoResolveCoords/);
    for (const file of PICKER_SCREENS) {
      assert.doesNotMatch(read(file), /detectCurrentLocality/, file);
    }
  });

  it('Cerrillos: la cabecera con gobierno local nulo queda primera y visible', () => {
    const res = placeFromCoords({ lat: -24.88661, lng: -65.46457, administrativeArea: CERRILLOS_AREA });
    const first = res.candidates[0];
    assert.equal(first.place.placeId, 'AR:georef:66035010');
    assert.equal(first.place.governmentLocalCode, null);
    assert.equal(first.governmentLocalMatch, false);
    // El área oficial tiene 8 localidades y las 8 siguen ofrecidas: el
    // gobierno local no filtra, sólo desempata.
    assert.equal(placesInAdmin2('66035').length, 8);
    assert.equal(res.candidates.length, 8);
    const withGl = res.candidates.filter((c) => c.governmentLocalMatch);
    assert.ok(withGl.length > 0);
    assert.ok(res.candidates.some((c) => c.place.governmentLocalCode === null));
  });

  it('con varias localidades en el área se pide confirmación', () => {
    const res = placeFromCoords({ lat: -24.88661, lng: -65.46457, administrativeArea: CERRILLOS_AREA });
    assert.ok(res.candidates.length > 1);
    assert.equal(res.requiresConfirmation, true);
    assert.notEqual(res.confidence, 'high');
    assert.equal(unambiguous(res), null);
  });

  it('el candidato limítrofe de otro departamento no desaparece', () => {
    // Punto dentro de Cerrillos pero con el centroide más cercano de todo el
    // catálogo en otra área: el vecino se reserva el último lugar.
    const near = placesInAdmin2('66028')[0];
    const res = placeFromCoords({
      lat: near.centroidLat,
      lng: near.centroidLng,
      administrativeArea: CERRILLOS_AREA,
    });
    const outside = res.candidates.filter((c) => !c.withinResolvedArea);
    assert.equal(outside.length, 1);
    assert.equal(res.boundaryRisk, true);
    assert.equal(res.requiresConfirmation, true);
  });

  it('no devuelve la posición del usuario ni distancias trilaterables', async () => {
    const lat = -24.7821349;
    const lng = -65.4123761;
    const { body } = await callGeo({ action: 'resolveCoords', lat, lon: lng });
    const serialized = JSON.stringify(body);
    assert.doesNotMatch(serialized, new RegExp(String(lat)));
    assert.doesNotMatch(serialized, new RegExp(String(lng)));

    // Dos puntos distintos de la misma celda producen exactamente las mismas
    // distancias, así que ninguna terna de distancias reconstruye el punto.
    const cell = geoCell(lat, lng)!;
    const a = placeFromCoords({ lat, lng, administrativeArea: CERRILLOS_AREA });
    const b = placeFromCoords({
      lat: cell.centerLat + 0.001,
      lng: cell.centerLng - 0.001,
      administrativeArea: CERRILLOS_AREA,
    });
    assert.deepEqual(
      a.candidates.map((c) => c.distanceKm),
      b.candidates.map((c) => c.distanceKm)
    );
  });

  it('la distancia que ve el usuario es gruesa por tramos', () => {
    assert.equal(coarseDistanceLabel(0.377), 'Muy cerca');
    assert.equal(coarseDistanceLabel(1.9), 'Muy cerca');
    assert.equal(coarseDistanceLabel(3.416), 'A menos de 5 km');
    assert.equal(coarseDistanceLabel(47), 'A más de 25 km');
    assert.equal(coarseDistanceLabel(null), null);
    // Nunca hay decimales en lo que se muestra.
    for (const km of [0.123, 4.987, 12.345, 24.999, 88.8]) {
      assert.doesNotMatch(coarseDistanceLabel(km)!, /\d+\.\d/);
    }
    assert.match(picker, /coarseDistanceLabel\(item\.distanceKm\)/);
  });

  it('el placeId de la respuesta se resuelve contra el catálogo local', () => {
    // Un lugar que no está en el catálogo se descarta aunque venga del Worker.
    assert.match(locate, /const place = placeById\(raw\?\.placeId\)/);
    assert.match(locate, /if \(!place\) return null/);
  });

  it('sólo un candidato realmente inequívoco puede preseleccionarse', () => {
    assert.match(locate, /if \(resolution\.requiresConfirmation\) return null/);
    assert.match(locate, /if \(resolution\.confidence !== 'high'\) return null/);
    assert.match(locate, /if \(resolution\.boundaryRisk\) return null/);
    assert.match(locate, /if \(inArea\.length !== 1\) return null/);
    assert.match(picker, /const only = unambiguousPlace\(res\)/);
  });
});

/** Réplica de `unambiguousPlace` sin importar expo-location. */
function unambiguous(resolution: PlaceResolution) {
  if (resolution.requiresConfirmation) return null;
  if (resolution.confidence !== 'high') return null;
  if (resolution.boundaryRisk) return null;
  const inArea = resolution.candidates.filter((c) => c.withinResolvedArea);
  if (inArea.length !== 1) return null;
  return inArea[0].place;
}

// ------------------------------------------------------------
// 4. Georef caído: el sistema sigue usable
// ------------------------------------------------------------

const jsonStub = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function geoRequest(body: unknown) {
  return new Request('https://api.test/geo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function callGeo(body: unknown, auth: () => Promise<string | null> = async () => null) {
  const res = await handleGeo(geoRequest(body), {}, jsonStub, auth);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

describe('Georef caído', () => {
  it('la búsqueda manual no depende de la red', () => {
    // El PlacePicker importa el catálogo embebido, no el cliente HTTP.
    assert.match(picker, /from '\.\.\/lib\/geoplace\/catalog\.ts'/);
    assert.doesNotMatch(picker, /db\.geoSearch/);
    assert.doesNotMatch(picker, /fetch\(/);
    assert.ok(searchPlaces('metan').matches.length > 0);
  });

  it('el GPS ofrece candidatos de baja confianza y exige confirmación', async () => {
    // Sin sesión no se gasta cuota upstream: es el mismo camino que tomaría
    // el endpoint con Georef sin responder.
    const { status, body } = await callGeo({ action: 'resolveCoords', lat: -24.9012347, lon: -65.4812349 });
    assert.equal(status, 200);
    assert.equal(body.administrativeArea, null);
    assert.equal(body.source, 'offline-fallback');
    assert.equal(body.confidence, 'low');
    assert.equal(body.requiresConfirmation, true);
    assert.equal(body.boundaryRisk, true);
    assert.ok(body.candidates.length > 0);
  });

  it('la app cae al catálogo local cuando el endpoint falla', () => {
    assert.match(locate, /placeFromCoords\(\{ lat: coords\.latitude, lng: coords\.longitude \}\)/);
    assert.match(locate, /Sin red o endpoint caído/);
  });
});

// ------------------------------------------------------------
// 5. Escritura nueva: placeId cualificado, legacy intacto
// ------------------------------------------------------------

describe('escritura de la identidad territorial', () => {
  it('el cliente manda un placeId cualificado y el servidor deriva el resto', () => {
    const place = normalizeIncomingPlace({ placeId: 'AR:georef:66028050', admin1Code: '99', admin2Code: '99999' });
    assert.equal(place.placeId, 'AR:georef:66028050');
    // Los códigos que mandó el cliente se ignoran: salen del catálogo.
    assert.notEqual(place.admin1Code, '99');
    assert.equal(place.admin1Code, placeById('AR:georef:66028050')!.admin1Code);
    assert.equal(place.admin2Code, placeById('AR:georef:66028050')!.admin2Code);
  });

  it('un placeId desconocido se rechaza en vez de guardarse', () => {
    assert.equal(placeIdRejected({ placeId: 'AR:georef:00000000' }), true);
    assert.equal(placeIdRejected({ placeId: 'Salta, Argentina' }), true);
    assert.equal(placeIdRejected({ placeId: 'AR:georef:66028050' }), false);
    // Sin placeId no se rechaza nada: la escritura legacy sigue siendo válida.
    assert.equal(placeIdRejected({}), false);
    assert.equal(placeIdRejected({ placeId: '' }), false);
    assert.deepEqual(normalizeIncomingPlace({ placeId: 'AR:georef:00000000' }), {
      placeId: null,
      admin1Code: null,
      admin2Code: null,
    });
  });

  it('las pantallas de escritura envían el placeId junto a los campos legacy', () => {
    for (const file of ['screens/CreateAlertScreen.tsx', 'screens/CreateListingScreen.tsx']) {
      const src = read(file);
      assert.match(src, /placeId: place\?\.placeId/, file);
      assert.match(src, /admin1Code: place\?\.admin1Code/, file);
      assert.match(src, /admin2Code: place\?\.admin2Code/, file);
      // Legacy sigue viajando.
      assert.match(src, /locality,/, file);
      assert.match(src, /province: province \|\| undefined/, file);
    }
  });

  it('el Worker valida el placeId en las cuatro escrituras', () => {
    const guards = worker.match(/placeIdRejected\(body\)/g) || [];
    assert.equal(guards.length, 4);
    for (const action of ['createAlert', 'createListing', 'updateProfile', 'updatePublicProfile']) {
      const start = worker.indexOf(`if (action === '${action}')`);
      assert.ok(start > 0, action);
      const chunk = worker.slice(start, worker.indexOf('\n    if (action ===', start + 10));
      assert.match(chunk, /placeIdRejected\(body\)/, action);
      assert.match(chunk, /normalizeIncomingPlace\(body\)/, action);
    }
  });

  it('el INSERT de alertas conserva todas las columnas legacy', () => {
    const start = worker.indexOf('INSERT INTO alerts');
    const chunk = worker.slice(start, start + 900);
    for (const col of ['locality', 'province', 'country', 'lat', 'lon']) {
      assert.match(chunk, new RegExp(`\\b${col}\\b`), col);
    }
    // Las columnas nuevas entran por fragmento, nunca hardcodeadas.
    assert.match(chunk, /\$\{geo\.columns\}/);
    assert.match(chunk, /\$\{geo\.placeholders\}/);
  });
});

// ------------------------------------------------------------
// 6. Esquema: detección defensiva y migración aditiva
// ------------------------------------------------------------

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
          run: async () => db.prepare(sql).run(),
        };
      },
    },
  } as any;
}

const LEGACY_ALERTS = `CREATE TABLE alerts (
  id TEXT PRIMARY KEY, user_id TEXT, type TEXT, status TEXT, pet_name TEXT,
  species TEXT, breed TEXT, description TEXT, image TEXT, locality TEXT,
  province TEXT, country TEXT, lat REAL, lon REAL, event_date INTEGER,
  created_at INTEGER, renewed_at INTEGER
)`;

describe('esquema defensivo', () => {
  it('sin las columnas nuevas el INSERT legacy no cambia', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec(LEGACY_ALERTS);
    const env = fakeEnv(db);
    const place = normalizeIncomingPlace({ placeId: 'AR:georef:66028050' });
    const geo = await geoInsertFragment(env, 'alerts', place);
    assert.equal(geo.columns, '');
    assert.equal(geo.placeholders, '');
    assert.deepEqual(geo.values, []);
    db.close();
  });

  it('con las columnas aplicadas el INSERT las incluye en orden', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec(LEGACY_ALERTS);
    for (const col of GEO_WRITE_COLUMNS) db.exec(`ALTER TABLE alerts ADD COLUMN ${col} TEXT`);
    const env = fakeEnv(db);
    const place = normalizeIncomingPlace({ placeId: 'AR:georef:66028050' });
    const geo = await geoInsertFragment(env, 'alerts', place);
    assert.equal(geo.columns, ', place_id, admin1_code, admin2_code');
    assert.equal(geo.placeholders, ', ?, ?, ?');
    assert.deepEqual(geo.values, [place.placeId, place.admin1Code, place.admin2Code]);

    db.prepare(
      `INSERT INTO alerts (id, locality, province${geo.columns}) VALUES (?, ?, ?${geo.placeholders})`
    ).run('a1', 'Salta', 'Salta', ...(geo.values as string[]));
    const row = db.prepare('SELECT locality, province, place_id, admin1_code, admin2_code FROM alerts').get() as any;
    assert.equal(row.locality, 'Salta');
    assert.equal(row.place_id, 'AR:georef:66028050');
    assert.equal(row.admin1_code, '66');
    db.close();
  });

  it('un UPDATE sin selección nueva no borra el lugar guardado', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE users (id TEXT, location TEXT, place_id TEXT, admin1_code TEXT, admin2_code TEXT)');
    const env = fakeEnv(db);
    const empty = await geoUpdateFragment(env, 'users', normalizeIncomingPlace({}));
    assert.equal(empty.sql, '');
    assert.deepEqual(empty.values, []);
    const chosen = await geoUpdateFragment(env, 'users', normalizeIncomingPlace({ placeId: 'AR:georef:66028050' }));
    assert.equal(chosen.sql, ', place_id = ?, admin1_code = ?, admin2_code = ?');
    db.close();
  });

  it('el INSERT real del Worker es válido con y sin las columnas nuevas', async () => {
    // Se extrae la plantilla tal como está en worker/index.js y se ejecuta
    // contra sqlite en las dos formas del esquema. Los fragmentos pueden ser
    // correctos y el SQL resultante no serlo, así que se comprueba el SQL.
    const template = worker.slice(
      worker.indexOf('INSERT INTO alerts'),
      worker.indexOf('`,\n        [id, userId, type,')
    );
    assert.match(template, /\$\{geo\.columns\}/);

    const place = normalizeIncomingPlace({ placeId: 'AR:georef:66028050' });
    for (const migrated of [false, true]) {
      const db = new DatabaseSync(':memory:');
      db.exec(LEGACY_ALERTS);
      db.exec('ALTER TABLE alerts ADD COLUMN sex TEXT');
      db.exec('ALTER TABLE alerts ADD COLUMN author_profile_id TEXT');
      db.exec('ALTER TABLE alerts ADD COLUMN contact_whatsapp TEXT');
      db.exec('ALTER TABLE alerts ADD COLUMN contact_phone TEXT');
      if (migrated) {
        for (const col of GEO_WRITE_COLUMNS) db.exec(`ALTER TABLE alerts ADD COLUMN ${col} TEXT`);
      }
      const geo = await geoInsertFragment(fakeEnv(db), 'alerts', place);
      const sql = template.replace('${geo.columns}', geo.columns).replace('${geo.placeholders}', geo.placeholders);
      const legacyValues = ['al-1', 'u-1', 'lost', 'Toby', 'perro', 'mestizo', 'se perdió', 'https://i/1.jpg',
        'Salta', 'Salta', 'AR', null, null, 1, 1, 1, null, null, null, null];
      db.prepare(sql).run(...legacyValues, ...(geo.values as string[]));

      const row = db.prepare('SELECT * FROM alerts WHERE id = ?').get('al-1') as any;
      // Legacy idéntico en los dos casos.
      assert.equal(row.locality, 'Salta');
      assert.equal(row.province, 'Salta');
      assert.equal(row.country, 'AR');
      assert.equal(row.place_id ?? null, migrated ? 'AR:georef:66028050' : null);
      assert.equal(row.admin2_code ?? null, migrated ? place.admin2Code : null);
      db.close();
    }
  });

  it('el Worker nunca ejecuta ALTER TABLE para estas columnas', () => {
    assert.doesNotMatch(readCode('worker/geoWrite.js'), /ALTER TABLE/);
    assert.match(read('worker/geoWrite.js'), /PRAGMA table_info/);
    for (const table of ['alerts', 'listings', 'profiles', 'users']) {
      assert.doesNotMatch(worker, new RegExp(`ALTER TABLE ${table} ADD COLUMN place_id`));
    }
  });

  it('migrations/015 es aditiva y se aplica sobre el esquema legacy', () => {
    const sql = read('migrations/015_geo_place_identity.sql');
    assert.match(sql, /LOCAL ONLY\. NO ejecutar contra D1 remoto/);
    assert.doesNotMatch(sql, /\b(DROP|DELETE|UPDATE|INSERT)\b/);
    // Sólo ALTER ... ADD COLUMN y CREATE INDEX IF NOT EXISTS.
    for (const line of sql.split('\n')) {
      const stmt = line.trim();
      if (!stmt || stmt.startsWith('--')) continue;
      assert.match(stmt, /^(ALTER TABLE \w+ ADD COLUMN \w+ TEXT;|CREATE INDEX IF NOT EXISTS .+;)$/, stmt);
    }

    const db = new DatabaseSync(':memory:');
    db.exec(LEGACY_ALERTS);
    db.exec('CREATE TABLE listings (id TEXT PRIMARY KEY, locality TEXT, province TEXT)');
    db.exec('CREATE TABLE profiles (id TEXT PRIMARY KEY, location TEXT, locality TEXT)');
    db.exec('CREATE TABLE users (id TEXT PRIMARY KEY, location TEXT)');
    db.prepare('INSERT INTO alerts (id, locality, province) VALUES (?, ?, ?)').run('legacy-1', 'Cafayate', 'Salta');
    db.exec(sql);

    // Las filas y lecturas de antes siguen exactamente igual.
    const legacy = db.prepare('SELECT locality, province, place_id FROM alerts WHERE id = ?').get('legacy-1') as any;
    assert.equal(legacy.locality, 'Cafayate');
    assert.equal(legacy.province, 'Salta');
    assert.equal(legacy.place_id, null);

    for (const table of ['alerts', 'listings', 'profiles', 'users']) {
      const cols = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map((r) => r.name));
      for (const col of GEO_WRITE_COLUMNS) assert.ok(cols.has(col), `${table}.${col}`);
    }
    db.close();
  });
});

// ------------------------------------------------------------
// 7. Perfiles: la ubicación administrativa no es texto libre
// ------------------------------------------------------------

describe('perfiles', () => {
  it('EditProfileScreen elige la localidad, no la escribe', () => {
    const src = read('screens/EditProfileScreen.tsx');
    assert.match(src, /<PlacePicker/);
    assert.match(src, /setLocation\(entry\.locality\)/);
    assert.match(src, /setPlace\(entry\.place\)/);
    // Ya no hay un TextInput apuntando a `location`.
    assert.doesNotMatch(src, /value=\{location\}/);
    assert.doesNotMatch(src, /'Ciudad, País'/);
  });

  it('EditPublicProfileScreen separa dirección libre de localidad oficial', () => {
    const src = read('screens/EditPublicProfileScreen.tsx');
    // La dirección sigue siendo texto libre porque un comercio la necesita...
    assert.match(src, /Dirección \(opcional\)/);
    assert.match(src, /value=\{location\}/);
    // ...y se dice explícitamente que no es la ubicación territorial.
    assert.match(src, /La ubicación que se usa para encontrar tu página/);
    // La localidad viene del catálogo.
    assert.match(src, /<PlacePicker/);
    assert.match(src, /setPlace\(entry\.place\)/);
  });

  it('el texto libre no se usa como clave territorial en el Worker', () => {
    // Los seis filtros territoriales siguen siendo seis. Desde Fase 5 comparan
    // identidad en vez de texto, pero ninguno mira `location`, que es dirección
    // visible y no una clave territorial.
    const filters = worker.match(/FILTRO TERRITORIAL/g) || [];
    assert.equal(filters.length, 5, 'cinco marcas: la primera cubre los filtros 1 y 2');
    assert.doesNotMatch(worker, /LOWER\(\w+\.location\) = LOWER\(\?\)/);
    assert.doesNotMatch(worker, /WHERE .*\.location = \?/);
  });
});

// ------------------------------------------------------------
// 8. Atribución CC BY 4.0
// ------------------------------------------------------------

describe('atribución CC BY 4.0', () => {
  it('el texto nombra la fuente, la licencia y la modificación', () => {
    assert.match(GEO_ATTRIBUTION, /Georef/);
    assert.match(GEO_ATTRIBUTION, /argentina\.gob\.ar\/georef/);
    assert.match(GEO_ATTRIBUTION, /CC BY 4\.0/);
    assert.match(GEO_ATTRIBUTION, /modificados/i);
    const meta = geoCatalogMeta();
    assert.equal(meta.license, 'CC BY 4.0');
    assert.equal(meta.modified, true);
    assert.equal(meta.licenseUrl, 'https://creativecommons.org/licenses/by/4.0/');
  });

  it('hay una pantalla de Fuentes de datos con la licencia enlazada', () => {
    const sheet = read('components/DataSourcesSheet.tsx');
    assert.match(sheet, /Fuentes de datos/);
    assert.match(sheet, /meta\.attribution/);
    assert.match(sheet, /meta\.modificationNote/);
    assert.match(sheet, /meta\.licenseUrl/);
    const profile = read('screens/UserProfileScreen.tsx');
    assert.match(profile, /Fuentes de datos/);
    assert.match(profile, /DataSourcesSheet/);
  });

  it('el PlacePicker muestra la atribución al pie', () => {
    assert.match(picker, /GEO_ATTRIBUTION/);
    assert.match(picker, /styles\.attribution/);
  });
});

// ------------------------------------------------------------
// 9. Privacidad y alcance: lo que Fase 3 NO cambió
// ------------------------------------------------------------

describe('alcance de Fase 3', () => {
  it('las protecciones de ubicación del usuario siguen intactas', () => {
    const last = read('lib/lastLocation.ts');
    assert.match(last, /export function publicPayloadHasUserCoords/);
    for (const key of ['last_lat', 'last_lng', 'lastLat', 'lastLng']) {
      assert.match(last, new RegExp(`'${key}'`), key);
    }
    const push = read('lib/pushPolicy.ts');
    assert.match(push, /export function payloadHasSensitiveLocation/);
    assert.match(push, /keys\.includes\('lat'\) \|\| keys\.includes\('lon'\)/);
    assert.match(push, /-\?\\d\{1,3\}\\\.\\d\{3,\}/);
  });

  it('la coordenada del dispositivo no sale de lib/placeLocate.ts', () => {
    // `coords` se usa para llamar al endpoint y nada más: no se devuelve.
    assert.doesNotMatch(locate, /return \{ ok: true, lat/);
    assert.doesNotMatch(locate, /coords,/);
    assert.doesNotMatch(locate, /console\.(log|warn|error)/);
    assert.match(locate, /Nunca devuelve la coordenada del usuario/);
    assert.doesNotMatch(picker, /latitude/);
    assert.doesNotMatch(picker, /longitude/);
  });

  it('no se cambiaron los filtros territoriales ni se hizo backfill', () => {
    assert.doesNotMatch(worker, /LOWER\(\w+\.place_id\)/);
    assert.doesNotMatch(worker, /WHERE .*admin2_code = \?/);
    assert.doesNotMatch(worker, /UPDATE alerts SET place_id/);
    assert.doesNotMatch(worker, /UPDATE listings SET place_id/);
    // Las columnas nuevas se escriben, todavía no se leen para filtrar.
    assert.doesNotMatch(read('worker/geoWrite.js'), /SELECT/);
  });

  it('lo legacy que sigue siendo necesario no se eliminó', () => {
    assert.match(read('lib/localities.ts'), /ARGENTINA_LOCALITIES/);
    assert.match(read('components/LocalityPicker.tsx'), /acceptTyped/);
    const geo = read('lib/geo.ts');
    assert.match(geo, /export async function detectCurrentLocality/);
    assert.match(geo, /export async function saveAlertsLocality/);
    assert.match(geo, /export function haversineKm/);
  });

  it('lib/geoplace no importa expo-location: el Worker lo comparte', () => {
    for (const file of [
      'lib/geoplace/catalog.ts',
      'lib/geoplace/resolve.ts',
      'lib/geoplace/format.ts',
      'lib/geoplace/cell.ts',
      'lib/geoplace/normalize.ts',
      'lib/geoplace/aliases.ts',
      'lib/geoplace/types.ts',
    ]) {
      const src = read(file);
      assert.doesNotMatch(src, /expo-location/, file);
      assert.doesNotMatch(src, /react-native/, file);
    }
  });

  it('los contextos de lugar se etiquetan sin asumir "provincia" global', () => {
    const santaFe = placeById('AR:georef:82119130')!;
    assert.equal(placeContextLabel(santaFe), 'Santa Fe');
    const capital = placeById('AR:georef:66028060')!;
    assert.equal(placeContextLabel(capital), 'Capital, Salta');
  });
});
