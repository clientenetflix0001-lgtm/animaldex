// ============================================================
// Fase 2 — fundación geográfica normalizada.
// ============================================================
// Estos tests cubren la fundación: catálogo, identidad, resolución y endpoint.
// Lo que hace la UI con todo esto vive en geoPhase3.test.ts.
// ============================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GEO_ATTRIBUTION,
  GEO_CATALOG_VERSION,
  GEO_COUNTRY_CODE,
  GEO_PROVIDER,
  admin1CodeByName,
  allPlaces,
  geoCatalogMeta,
  parsePlaceId,
  placeById,
  placesByExactName,
  placesInAdmin1,
  placesInAdmin2,
  qualifyPlaceId,
  searchPlaces,
} from '../lib/geoplace/catalog.ts';
import {
  ADMIN1_ALIASES,
  ALIAS_RULES,
  resolveAdmin1Code,
  resolveGeoAlias,
} from '../lib/geoplace/aliases.ts';
import { GEO_CELL_KM, coarseCoord, geoCell } from '../lib/geoplace/cell.ts';
import {
  containsWord,
  geoDistanceKm,
  geoTokens,
  matchesTokenPrefix,
  normalizeGeoText,
  validGeoPoint,
} from '../lib/geoplace/normalize.ts';
import {
  GEO_CLEAR_WINNER_GAP_KM,
  GEO_MAX_CANDIDATES,
  nearestPlaces,
  placeFromCoords,
  resolvePlaceFromText,
} from '../lib/geoplace/resolve.ts';
import { ADMIN_LEVEL_LABELS, adminLevelLabels } from '../lib/geoplace/types.ts';
import type { AdministrativeArea } from '../lib/geoplace/types.ts';
import { handleGeo } from '../worker/geo.js';
import {
  PAGE_SIZE,
  buildSnapshot,
  fetchAllPlaces,
  fetchJson,
  pageUrl,
  renderModule,
} from '../scripts/geo/build-catalog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const SALTA = '66';
const saltaCtx = { admin1Name: 'Salta' };

/** Ids oficiales INDEC de los casos del enunciado. */
const IDS = {
  salta: '66028050',
  cerrillos: '66035010',
  metan: '66112040',
  oran: '66126070',
};

function area(overrides: Partial<AdministrativeArea> = {}): AdministrativeArea {
  return {
    countryCode: 'AR',
    provider: 'georef',
    admin1Code: SALTA,
    admin1Name: 'Salta',
    admin2Code: '66035',
    admin2Name: 'Cerrillos',
    governmentLocalCode: null,
    governmentLocalName: null,
    ...overrides,
  };
}

// ------------------------------------------------------------
// 1. Catálogo: versión, procedencia, licencia
// ------------------------------------------------------------

describe('catálogo oficial Georef v2.1', () => {
  it('fija la versión de la fuente y no usa v1.0', () => {
    const meta = geoCatalogMeta();
    assert.equal(meta.sourceVersion, 'v2.1');
    assert.match(meta.sourceUrl, /georef\/api\/v2\.1/);
    assert.doesNotMatch(meta.sourceUrl, /v1\.0/);
    assert.equal(meta.provider, 'georef');
    assert.equal(meta.countryCode, 'AR');
  });

  it('el generador está fijado a v2.1 y valida las cantidades al generar', () => {
    const gen = read('scripts/geo/build-catalog.mjs');
    assert.match(gen, /GEOREF_VERSION\s*=\s*'v2\.1'/);
    assert.doesNotMatch(gen, /api\/v1\.0/);
    // No se confía en un número esperado: se compara contra el total que
    // declara la propia API y se aborta si no coincide.
    assert.match(gen, /rows\.length !== total/);
    assert.match(gen, /EXPECTED/);
  });

  it('la versión del snapshot es reproducible y rastreable', () => {
    assert.match(GEO_CATALOG_VERSION, /^ar-georef-v2\.1-\d{4}-\d{2}-\d{2}$/);
    const meta = geoCatalogMeta();
    assert.ok(Date.parse(meta.generatedAt) > 0, 'generatedAt debe ser una fecha');
    assert.equal(meta.modified, true);
    assert.ok(meta.modificationNote.length > 10);
  });

  it('conserva la licencia CC BY 4.0 y el texto de atribución', () => {
    const meta = geoCatalogMeta();
    assert.equal(meta.license, 'CC BY 4.0');
    assert.match(meta.licenseUrl, /creativecommons\.org/);
    assert.match(GEO_ATTRIBUTION, /Georef/);
    assert.match(GEO_ATTRIBUTION, /argentina\.gob\.ar/);
  });

  it('deja documentado que la atribución será obligatoria en UI', () => {
    // Fase 3 la renderiza; Fase 2 sólo tiene que dejarlo escrito y disponible.
    assert.match(read('lib/geoplace/catalog.ts'), /[Aa]tribución[\s\S]{0,120}[Oo]bligatoria/);
    assert.match(read('lib/geoplace/catalog.ar.ts'), /atribución/i);
  });

  it('las cantidades del snapshot coinciden con lo indexado', () => {
    const meta = geoCatalogMeta();
    assert.equal(meta.counts.places, allPlaces().length);
    assert.equal(meta.counts.admin1, 24);
    assert.ok(meta.counts.admin2 >= 500 && meta.counts.admin2 <= 560, `admin2=${meta.counts.admin2}`);
  });

  it('todo lugar tiene nivel 2 y centroide; el gobierno local puede faltar', () => {
    let withoutGovernmentLocal = 0;
    for (const place of allPlaces()) {
      assert.ok(place.admin2Code, `${place.placeId} sin admin2`);
      assert.ok(place.admin1Name, `${place.placeId} sin nombre de nivel 1`);
      assert.ok(Number.isFinite(place.centroidLat) && Number.isFinite(place.centroidLng));
      if (!place.governmentLocalCode) withoutGovernmentLocal += 1;
    }
    // Un tercio del catálogo no tiene gobierno local: es exactamente el motivo
    // de que no pueda usarse como filtro.
    assert.ok(withoutGovernmentLocal > 1000, `sin gobierno local: ${withoutGovernmentLocal}`);
  });
});

// ------------------------------------------------------------
// 1 bis. El generador, sin depender de la red
// ------------------------------------------------------------

/** Fila cruda de Georef, mínima pero válida. */
function rawRow(i: number, over: Record<string, any> = {}) {
  const provincia = over.provincia ?? { id: String(2 + (i % 24) * 4).padStart(2, '0'), nombre: `P${i % 24}` };
  return {
    id: `9${String(i).padStart(7, '0')}`,
    nombre: `Localidad ${i}`,
    provincia,
    departamento: { id: `${provincia.id}001`, nombre: `D${i % 520}` },
    gobierno_local: i % 3 === 0 ? null : { id: `${provincia.id}0077`, nombre: `G${i}` },
    centroide: { lat: -30 - i / 10000, lon: -60 - i / 10000 },
    ...over,
  };
}

/** Genera filas que satisfacen las cotas de validación. */
function validRows(total = 3900) {
  const rows = [];
  for (let i = 0; i < total; i += 1) {
    const provIdx = i % 24;
    const provincia = { id: String(2 + provIdx * 4).padStart(2, '0'), nombre: `Prov ${provIdx}` };
    const deptIdx = i % 520;
    rows.push({
      ...rawRow(i, { provincia }),
      departamento: { id: `${String(deptIdx).padStart(3, '0')}99`, nombre: `Dpto ${deptIdx}` },
    });
  }
  return rows;
}

describe('generador del snapshot', () => {
  it('pagina y verifica contra el total que declara la API', async () => {
    const rows = validRows(1234);
    const urls: string[] = [];
    const pages = await fetchAllPlaces({
      pageSize: 500,
      pagePauseMs: 0,
      sleep: async () => {},
      fetchJson: async (url: string) => {
        urls.push(url);
        const inicio = Number(new URL(url).searchParams.get('inicio'));
        return { total: rows.length, localidades_censales: rows.slice(inicio, inicio + 500) };
      },
    });
    assert.equal(pages.length, 1234);
    assert.equal(urls.length, 3);
    assert.match(urls[0], /georef\/api\/v2\.1\/localidades-censales/);
    assert.match(urls[1], /inicio=500/);
  });

  it('aborta si la paginación devuelve menos de lo declarado', async () => {
    await assert.rejects(
      () => fetchAllPlaces({
        pageSize: 500,
        pagePauseMs: 0,
        sleep: async () => {},
        fetchJson: async (url: string) => {
          const inicio = Number(new URL(url).searchParams.get('inicio'));
          // Declara 1000 pero la segunda página viene vacía.
          return { total: 1000, localidades_censales: inicio === 0 ? validRows(500) : [] };
        },
      }),
      /página vacía/,
    );
  });

  it('aborta si la paginación devuelve duplicados', async () => {
    await assert.rejects(
      () => fetchAllPlaces({
        pageSize: 500,
        pagePauseMs: 0,
        sleep: async () => {},
        fetchJson: async () => ({ total: 1000, localidades_censales: validRows(500) }),
      }),
      /duplicados/,
    );
  });

  it('reintenta los 524 de Georef y termina bien', async () => {
    let intentos = 0;
    const body = await fetchJson('https://example.test/x', {
      sleep: async () => {},
      fetch: async () => {
        intentos += 1;
        if (intentos < 3) return new Response('', { status: 524 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    });
    assert.equal(intentos, 3);
    assert.deepEqual(body, { ok: true });
  });

  it('no reintenta un 404 y explica el 524 persistente', async () => {
    let intentos = 0;
    await assert.rejects(
      () => fetchJson('https://example.test/x', {
        sleep: async () => {},
        fetch: async () => { intentos += 1; return new Response('', { status: 404 }); },
      }),
      /respondió 404/,
    );
    assert.equal(intentos, 1, 'un 404 no se reintenta');

    await assert.rejects(
      () => fetchJson('https://example.test/x', {
        sleep: async () => {},
        maxAttempts: 2,
        fetch: async () => new Response('', { status: 524 }),
      }),
      /524 de forma intermitente/,
    );
  });

  it('rechaza una localidad sin departamento: es el ancla territorial', () => {
    const rows = validRows(3900);
    rows[10] = { ...rows[10], departamento: null } as any;
    assert.throws(() => buildSnapshot(rows), /sin departamento/);
  });

  it('rechaza una localidad sin centroide o sin nombre', () => {
    const sinCentroide = validRows(3900);
    sinCentroide[5] = { ...sinCentroide[5], centroide: null } as any;
    assert.throws(() => buildSnapshot(sinCentroide), /sin centroide/);

    const sinNombre = validRows(3900);
    sinNombre[5] = { ...sinNombre[5], nombre: '' } as any;
    assert.throws(() => buildSnapshot(sinNombre), /sin id o nombre/);
  });

  it('no asume cantidades: falla si el catálogo se sale del rango', () => {
    assert.throws(() => buildSnapshot(validRows(100)), /places = 100, fuera del rango/);
    // 23 jurisdicciones de nivel 1 en lugar de 24.
    const faltaUna = validRows(3900).filter((r) => r.provincia.id !== '02');
    assert.throws(() => buildSnapshot(faltaUna), /se esperaban 24/);
  });

  it('acepta gobierno local nulo sin descartar la localidad', () => {
    const snapshot = buildSnapshot(validRows(3900), { generatedAt: '2026-01-01T00:00:00.000Z' });
    const sinGl = snapshot.places.filter((p: any[]) => !p[4]).length;
    assert.ok(sinGl > 0, 'el catálogo real tiene un tercio sin gobierno local');
    assert.equal(snapshot.counts.places, 3900);
  });

  it('es determinista: mismas filas y misma fecha dan el mismo módulo', () => {
    const at = '2026-01-01T00:00:00.000Z';
    const a = renderModule(buildSnapshot(validRows(3900), { generatedAt: at }));
    const b = renderModule(buildSnapshot(validRows(3900).slice().reverse(), { generatedAt: at }));
    assert.equal(a, b, 'el orden de llegada no debe cambiar el resultado');
    assert.match(a, /GENERADO AUTOMÁTICAMENTE\. NO EDITAR A MANO/);
    assert.match(a, /atribución CC BY 4\.0 es OBLIGATORIA/);
  });

  it('la versión del catálogo sale de la versión de la API y la fecha', () => {
    const snapshot = buildSnapshot(validRows(3900), { generatedAt: '2026-03-04T10:00:00.000Z' });
    assert.equal(snapshot.geoCatalogVersion, 'ar-georef-v2.1-2026-03-04');
    assert.equal(snapshot.sourceVersion, 'v2.1');
  });

  it('las páginas se piden a la v2.1 con los campos necesarios', () => {
    const url = pageUrl(0);
    assert.match(url, /^https:\/\/apis\.datos\.gob\.ar\/georef\/api\/v2\.1\//);
    for (const field of ['departamento.id', 'gobierno_local.id', 'centroide.lat']) {
      assert.ok(url.includes(field), field);
    }
    // Páginas chicas: pedir las 4022 de una vez hace que Georef devuelva 524.
    assert.ok(PAGE_SIZE <= 1000, `PAGE_SIZE=${PAGE_SIZE}`);
  });
});

// ------------------------------------------------------------
// 2. Identidad: placeId, nunca el nombre
// ------------------------------------------------------------

describe('identidad por placeId', () => {
  it('el placeId está cualificado por país y proveedor', () => {
    const salta = placeById(IDS.salta);
    assert.ok(salta);
    assert.equal(salta.placeId, 'AR:georef:66028050');
    assert.equal(salta.countryCode, GEO_COUNTRY_CODE);
    assert.equal(salta.provider, GEO_PROVIDER);
    assert.equal(salta.providerPlaceId, IDS.salta);
  });

  it('placeById acepta el id cualificado y el del proveedor', () => {
    assert.equal(placeById('AR:georef:66028050')?.localityName, 'Salta');
    assert.equal(placeById('66028050')?.localityName, 'Salta');
  });

  it('rechaza otro país o proveedor en lugar de caer al id desnudo', () => {
    assert.equal(placeById('BR:georef:66028050'), null);
    assert.equal(placeById('AR:google:66028050'), null);
  });

  it('placeById nunca resuelve por nombre', () => {
    assert.equal(placeById('Salta'), null);
    assert.equal(placeById('salta'), null);
  });

  it('placeId ida y vuelta', () => {
    const parsed = parsePlaceId(qualifyPlaceId('66028050'));
    assert.deepEqual(parsed, { countryCode: 'AR', provider: 'georef', providerPlaceId: '66028050' });
    assert.equal(parsePlaceId('66028050'), null);
    assert.equal(parsePlaceId(''), null);
    assert.equal(parsePlaceId(null), null);
  });

  it('los placeId son únicos', () => {
    const ids = new Set(allPlaces().map((p) => p.placeId));
    assert.equal(ids.size, allPlaces().length);
  });

  it('admin1 y admin2 son niveles genéricos, no "provincia" cableado', () => {
    assert.deepEqual(ADMIN_LEVEL_LABELS.AR, { admin1: 'Provincia', admin2: 'Departamento' });
    // Un país sin entrada no rompe ni miente: cae a etiquetas neutras.
    assert.deepEqual(adminLevelLabels('BR'), { admin1: 'Región', admin2: 'Subdivisión' });
    const types = read('lib/geoplace/types.ts');
    assert.match(types, /admin1Code/);
    assert.doesNotMatch(types, /provinciaCode|provinceCode/);
  });
});

// ------------------------------------------------------------
// 3. Normalización determinista
// ------------------------------------------------------------

describe('normalizeGeoText', () => {
  it('quita acentos, baja a minúsculas, colapsa espacios y signos', () => {
    assert.equal(normalizeGeoText('  SAN   RAMÓN de la Nueva Orán '), 'san ramon de la nueva oran');
    assert.equal(normalizeGeoText('Río Cuarto'), 'rio cuarto');
    assert.equal(normalizeGeoText('San José de Metán'), 'san jose de metan');
    assert.equal(normalizeGeoText('Ñuñorco'), 'nunorco');
    assert.equal(normalizeGeoText('Av. Belgrano 1.234'), 'av belgrano 1 234');
  });

  it('es idempotente y tolera basura', () => {
    const once = normalizeGeoText('ORÁN');
    assert.equal(normalizeGeoText(once), once);
    assert.equal(normalizeGeoText(null), '');
    assert.equal(normalizeGeoText(undefined), '');
    assert.equal(normalizeGeoText(123), '123');
  });

  it('mayúsculas, minúsculas y acentos convergen al mismo valor', () => {
    const forms = ['Orán', 'orán', 'ORÁN', 'oran', 'ORAN', ' Oran '];
    const normalized = new Set(forms.map(normalizeGeoText));
    assert.deepEqual([...normalized], ['oran']);
  });

  it('no depende de LOWER() de SQLite, que es sólo ASCII', () => {
    // LOWER('ORÁN') en SQLite devuelve 'orÁn': por eso la normalización vive acá.
    assert.equal(normalizeGeoText('ORÁN'), 'oran');
    assert.match(read('lib/geoplace/normalize.ts'), /LOWER\(\)/);
  });

  it('helpers de tokens y palabras', () => {
    assert.deepEqual(geoTokens('San José de Metán'), ['san', 'jose', 'de', 'metan']);
    assert.deepEqual(geoTokens(''), []);
    assert.equal(containsWord('san ramon de la nueva oran', 'oran'), true);
    assert.equal(containsWord('coranzuli', 'oran'), false);
    assert.equal(matchesTokenPrefix('san jose de metan', 'met'), true);
    assert.equal(matchesTokenPrefix('san jose de metan', 'zzz'), false);
  });

  it('validGeoPoint rechaza lo que no es un punto', () => {
    assert.equal(validGeoPoint(-24.78, -65.41), true);
    assert.equal(validGeoPoint(0, 0), true);
    assert.equal(validGeoPoint(91, 0), false);
    assert.equal(validGeoPoint(0, 181), false);
    assert.equal(validGeoPoint(NaN, 0), false);
    assert.equal(validGeoPoint('-24.78', -65.41), false);
    assert.equal(validGeoPoint(null, null), false);
  });

  it('geoDistanceKm es simétrica y cero en el mismo punto', () => {
    assert.equal(geoDistanceKm(-24.78, -65.41, -24.78, -65.41), 0);
    const ab = geoDistanceKm(-24.78, -65.41, -34.6, -58.38);
    const ba = geoDistanceKm(-34.6, -58.38, -24.78, -65.41);
    assert.ok(Math.abs(ab - ba) < 1e-9);
    assert.ok(ab > 1000 && ab < 1400, `Salta-Buenos Aires = ${ab} km`);
  });
});

// ------------------------------------------------------------
// 4. Búsqueda por texto
// ------------------------------------------------------------

describe('searchPlaces', () => {
  it('"salta" encuentra Salta por coincidencia exacta', () => {
    const r = searchPlaces('salta');
    assert.equal(r.matches[0].place.providerPlaceId, IDS.salta);
    assert.equal(r.matches[0].place.localityName, 'Salta');
    assert.equal(r.matches[0].tier, 'exact');
    assert.equal(r.exactCount, 1);
    assert.equal(r.ambiguous, false);
  });

  it('"metan" encuentra San José de Metán', () => {
    const r = searchPlaces('metan');
    assert.equal(r.matches[0].place.providerPlaceId, IDS.metan);
    assert.equal(r.matches[0].place.localityName, 'San José de Metán');
  });

  it('"oran" encuentra San Ramón de la Nueva Orán', () => {
    const r = searchPlaces('oran');
    assert.equal(r.matches[0].place.providerPlaceId, IDS.oran);
    assert.equal(r.matches[0].place.localityName, 'San Ramón de la Nueva Orán');
    // La palabra completa gana a la coincidencia por subcadena (Coranzuli).
    assert.equal(r.matches[0].tier, 'word');
  });

  it('encuentra lo mismo escrito con acento y en mayúsculas', () => {
    const forms = ['oran', 'Orán', 'ORÁN', ' oRaN '];
    for (const form of forms) {
      assert.equal(searchPlaces(form).matches[0].place.providerPlaceId, IDS.oran, form);
    }
    assert.equal(searchPlaces('METÁN').matches[0].place.providerPlaceId, IDS.metan);
    assert.equal(searchPlaces('SALTA').matches[0].place.providerPlaceId, IDS.salta);
  });

  it('marca ambigüedad cuando hay varias coincidencias exactas', () => {
    const r = searchPlaces('san lorenzo');
    assert.ok(r.exactCount > 1, `exactCount=${r.exactCount}`);
    assert.equal(r.ambiguous, true);
  });

  it('un nombre inexistente no devuelve nada', () => {
    for (const q of ['Villa Perritos Felices', 'Narnia', 'zzzzzz']) {
      const r = searchPlaces(q);
      assert.equal(r.matches.length, 0, q);
      assert.equal(r.ambiguous, false, q);
    }
  });

  it('el texto tipo dirección no resuelve a un lugar', () => {
    for (const q of ['Av. Belgrano 1234', 'Av. Belgrano 1234, Salta', 'Calle Falsa 123, Salta, Argentina']) {
      assert.equal(searchPlaces(q).matches.length, 0, q);
    }
  });

  it('la consulta vacía no devuelve candidatos', () => {
    for (const q of ['', '   ', null, undefined, '...']) {
      const r = searchPlaces(q);
      assert.equal(r.matches.length, 0);
      assert.equal(r.ambiguous, false);
    }
  });

  it('acota por nivel 1 y respeta el límite', () => {
    const r = searchPlaces('san', { admin1Code: SALTA, limit: 5 });
    assert.equal(r.matches.length, 5);
    assert.equal(r.truncated, true);
    for (const m of r.matches) assert.equal(m.place.admin1Code, SALTA);
  });

  it('es determinista: la misma consulta da el mismo orden', () => {
    const a = searchPlaces('san lorenzo').matches.map((m) => m.place.placeId);
    const b = searchPlaces('San Lorenzo').matches.map((m) => m.place.placeId);
    assert.deepEqual(a, b);
  });

  it('con coordenada de referencia ordena por cercanía dentro del mismo nivel', () => {
    const saltaCity = placeById(IDS.salta);
    assert.ok(saltaCity);
    const near = searchPlaces('san lorenzo', {
      nearLat: saltaCity.centroidLat,
      nearLng: saltaCity.centroidLng,
    });
    assert.equal(near.matches[0].place.admin1Code, SALTA);
    // Ordenar por cercanía no elimina la ambigüedad.
    assert.equal(near.ambiguous, true);
  });
});

// ------------------------------------------------------------
// 5. Aliases heredados, con contexto territorial
// ------------------------------------------------------------

describe('aliases heredados', () => {
  it('las reglas son inspeccionables y están justificadas', () => {
    assert.ok(ALIAS_RULES.length > 0);
    const ids = new Set<string>();
    for (const rule of ALIAS_RULES) {
      assert.equal(rule.match, normalizeGeoText(rule.match), `regla ${rule.id} sin normalizar`);
      assert.ok(rule.note && rule.note.length > 10, `regla ${rule.id} sin nota`);
      assert.ok(!ids.has(`${rule.id}`), `id duplicado ${rule.id}`);
      ids.add(rule.id);
      if (rule.target) assert.ok(placeById(rule.target), `regla ${rule.id} apunta a un id inexistente`);
    }
  });

  it('los aliases de nivel 1 apuntan a códigos que existen', () => {
    for (const [name, code] of Object.entries(ADMIN1_ALIASES)) {
      assert.ok(placesInAdmin1(code).length > 0, `${name} -> ${code} vacío`);
    }
  });

  it('resuelve el nombre de nivel 1 que escribe la app hoy', () => {
    assert.equal(resolveAdmin1Code('Salta'), SALTA);
    assert.equal(resolveAdmin1Code('salta'), SALTA);
    // El nombre oficial incluye la Antártida; la app escribe el corto.
    assert.equal(resolveAdmin1Code('Tierra del Fuego'), '94');
    assert.equal(resolveAdmin1Code('CABA'), '02');
    assert.equal(resolveAdmin1Code('Capital Federal'), '02');
    assert.equal(resolveAdmin1Code('Buenos Aires'), '06');
    assert.equal(resolveAdmin1Code('Narnia'), null);
    assert.equal(resolveAdmin1Code(''), null);
  });

  it('"Cerrillos" + Salta resuelve a San José de los Cerrillos', () => {
    const r = resolveGeoAlias('Cerrillos', saltaCtx);
    assert.equal(r?.kind, 'place');
    assert.equal(r.kind === 'place' && r.place.providerPlaceId, IDS.cerrillos);
    assert.equal(r.kind === 'place' && r.place.localityName, 'San José de los Cerrillos');
    assert.equal(r.ruleId, 'ar-salta-cerrillos');
  });

  it('"Cerrillos" sin provincia queda ambiguo: existe Los Cerrillos en Córdoba', () => {
    const r = resolveGeoAlias('Cerrillos', null);
    assert.equal(r?.kind, 'ambiguous');
    assert.ok(r.kind === 'ambiguous' && r.candidates.length > 1);
    assert.equal(r.kind === 'ambiguous' && r.needs, 'admin1');
  });

  it('"Salta Capital" resuelve a la localidad Salta', () => {
    const r = resolveGeoAlias('Salta Capital', saltaCtx);
    assert.equal(r?.kind, 'place');
    assert.equal(r.kind === 'place' && r.place.providerPlaceId, IDS.salta);
  });

  it('la regla de capital es genérica, no una lista de Salta', () => {
    // Sin contexto, el propio texto nombra la jurisdicción.
    for (const [text, expected] of [
      ['Salta Capital', 'Salta'],
      ['Córdoba Capital', 'Córdoba'],
      ['Mendoza Capital', 'Mendoza'],
    ] as const) {
      const r = resolveGeoAlias(text, null);
      assert.equal(r?.kind, 'place', text);
      assert.equal(r.kind === 'place' && r.place.localityName, expected, text);
      assert.equal(r.ruleId, 'ar-generic-capital', text);
    }
  });

  it('"Metán" y "Orán" resuelven al nombre oficial completo', () => {
    const metan = resolveGeoAlias('Metán', saltaCtx);
    assert.equal(metan?.kind, 'place');
    assert.equal(metan.kind === 'place' && metan.place.providerPlaceId, IDS.metan);

    const oran = resolveGeoAlias('Orán', saltaCtx);
    assert.equal(oran?.kind, 'place');
    assert.equal(oran.kind === 'place' && oran.place.providerPlaceId, IDS.oran);
  });

  it('"San Lorenzo" NO se resuelve a un único lugar global', () => {
    const sinContexto = resolveGeoAlias('San Lorenzo', null);
    assert.equal(sinContexto?.kind, 'ambiguous');
    assert.ok(sinContexto.kind === 'ambiguous' && sinContexto.candidates.length >= 5);
  });

  it('"San Lorenzo" sigue ambiguo incluso con provincia: hay dos en Salta', () => {
    const r = resolveGeoAlias('San Lorenzo', saltaCtx);
    assert.equal(r?.kind, 'ambiguous');
    assert.equal(r.kind === 'ambiguous' && r.needs, 'admin2');
    const admin2 = new Set(r.kind === 'ambiguous' ? r.candidates.map((p) => p.admin2Code) : []);
    assert.ok(admin2.size >= 2, 'debería haber más de un departamento en juego');
  });

  it('CABA resuelve el nivel 1 pero no inventa una localidad', () => {
    for (const text of ['CABA', 'Capital Federal', 'Ciudad Autónoma de Buenos Aires']) {
      const r = resolveGeoAlias(text, null);
      assert.equal(r?.kind, 'admin1', text);
      assert.equal(r.kind === 'admin1' && r.admin1Code, '02', text);
    }
  });

  it('un texto sin regla no dispara ningún alias', () => {
    assert.equal(resolveGeoAlias('Villa Perritos Felices', null), null);
    assert.equal(resolveGeoAlias('', null), null);
    assert.equal(resolveGeoAlias('Rosario', null), null);
  });
});

// ------------------------------------------------------------
// 6. Resolución por texto
// ------------------------------------------------------------

describe('resolvePlaceFromText', () => {
  it('los casos del catálogo viejo de Salta resuelven con contexto', () => {
    for (const [text, id] of [
      ['Salta', IDS.salta],
      ['salta', IDS.salta],
      ['Salta Capital', IDS.salta],
      ['Cerrillos', IDS.cerrillos],
      ['CERRILLOS', IDS.cerrillos],
      ['Metán', IDS.metan],
      ['metan', IDS.metan],
      ['Orán', IDS.oran],
      ['oran', IDS.oran],
    ] as const) {
      const r = resolvePlaceFromText(text, saltaCtx);
      assert.equal(r.place?.providerPlaceId, id, `${text} -> ${r.place?.localityName ?? 'null'}`);
      assert.equal(r.ambiguous, false, text);
    }
  });

  it('devuelve el nivel 1 del contexto aunque el nombre no sea el oficial', () => {
    const r = resolvePlaceFromText('Ushuaia', { admin1Name: 'Tierra del Fuego' });
    assert.equal(r.place?.localityName, 'Ushuaia');
    assert.equal(r.admin1Code, '94');
  });

  it('un nombre ambiguo no se resuelve en silencio', () => {
    const r = resolvePlaceFromText('San Lorenzo', saltaCtx);
    assert.equal(r.place, null);
    assert.equal(r.ambiguous, true);
    assert.ok(r.candidates.length > 1);
  });

  it('un nombre inexistente no produce un GeoPlace válido', () => {
    for (const text of ['Villa Perritos Felices', 'Narnia', 'Ciudad Gótica']) {
      const r = resolvePlaceFromText(text, saltaCtx);
      assert.equal(r.place, null, text);
      assert.equal(r.candidates.length, 0, text);
      assert.equal(r.via, 'none', text);
      assert.equal(r.ambiguous, false, text);
    }
  });

  it('el texto tipo dirección tampoco produce un GeoPlace', () => {
    for (const text of [
      'Av. Belgrano 1234',
      'Av. Belgrano 1234, Salta',
      'Ruta 9 km 1580',
      'Calle Falsa 123, Salta, Argentina',
    ]) {
      const r = resolvePlaceFromText(text, saltaCtx);
      assert.equal(r.place, null, text);
    }
  });

  it('el contexto de provincia desambigua nombres repetidos entre provincias', () => {
    // Hay más de un "Los Cerrillos"/"Cerrillos" en el país.
    const enSalta = resolvePlaceFromText('Cerrillos', { admin1Name: 'Salta' });
    assert.equal(enSalta.place?.admin1Code, SALTA);
    const sinContexto = resolvePlaceFromText('Cerrillos', null);
    assert.equal(sinContexto.place, null);
    assert.equal(sinContexto.ambiguous, true);
  });

  it('nunca devuelve un lugar y ambiguo a la vez', () => {
    const textos = ['Salta', 'San Lorenzo', 'Cerrillos', 'CABA', 'Villa Perritos Felices', 'oran'];
    for (const text of textos) {
      for (const ctx of [null, saltaCtx]) {
        const r = resolvePlaceFromText(text, ctx);
        assert.ok(!(r.place && r.ambiguous), `${text} / ${JSON.stringify(ctx)}`);
      }
    }
  });
});

// ------------------------------------------------------------
// 7. Celdas de ~1 km
// ------------------------------------------------------------

describe('celda de coordenada', () => {
  it('el lado por defecto es de 1 km', () => {
    assert.equal(GEO_CELL_KM, 1);
  });

  it('dos puntos cercanos comparten celda y centro exacto', () => {
    const a = geoCell(-24.7859, -65.4117);
    const b = geoCell(-24.7861, -65.4119);
    assert.ok(a && b);
    assert.equal(a.key, b.key);
    assert.equal(a.centerLat, b.centerLat);
    assert.equal(a.centerLng, b.centerLng);
  });

  it('el centro está a menos de 1 km del punto original', () => {
    const puntos = [
      [-24.7859, -65.4117],
      [-34.6037, -58.3816],
      [-54.8019, -68.303],
      [-22.0, -62.5],
    ] as const;
    for (const [lat, lng] of puntos) {
      const cell = geoCell(lat, lng);
      assert.ok(cell);
      const moved = geoDistanceKm(lat, lng, cell.centerLat, cell.centerLng);
      assert.ok(moved <= cell.radiusKm + 1e-6, `${lat},${lng} movió ${moved} km`);
      assert.ok(cell.radiusKm < 1, `radio ${cell.radiusKm}`);
    }
  });

  it('la clave no contiene la coordenada original', () => {
    const cell = geoCell(-24.785912345, -65.411798765);
    assert.ok(cell);
    assert.match(cell.key, /^1:-?\d+:-?\d+$/);
    assert.doesNotMatch(cell.key, /785912|411798/);
  });

  it('rechaza puntos inválidos', () => {
    assert.equal(geoCell(NaN, 0), null);
    assert.equal(geoCell(null, null), null);
    assert.equal(geoCell(91, 0), null);
    assert.equal(geoCell('-24.78', -65.41), null);
  });

  it('coarseCoord redondea para logs y respuestas', () => {
    assert.equal(coarseCoord(-24.785912345), -24.79);
    assert.equal(coarseCoord(-65.411798765), -65.41);
    // Dos decimales ~ 1 km: no reconstruye una dirección.
    assert.equal(String(coarseCoord(-24.785912345)).split('.')[1].length <= 2, true);
  });
});

// ------------------------------------------------------------
// 8. REGRESIÓN CERRILLOS — el gobierno local nunca es filtro
// ------------------------------------------------------------

describe('REGRESIÓN Cerrillos: government_local no excluye ni entierra', () => {
  const cerrillos = placeById(IDS.cerrillos);

  it('el caso sigue siendo el que motivó el test: la cabecera tiene gobierno local nulo', () => {
    assert.ok(cerrillos);
    assert.equal(cerrillos.localityName, 'San José de los Cerrillos');
    assert.equal(cerrillos.admin2Name, 'Cerrillos');
    assert.equal(cerrillos.governmentLocalCode, null, 'el dato oficial cambió: revisar el diseño');
    // Sus vecinas del mismo departamento sí lo tienen, y es OTRO gobierno local.
    const conGobierno = placesInAdmin2(cerrillos.admin2Code).filter((p) => p.governmentLocalCode);
    assert.ok(conGobierno.length > 0);
  });

  it('GPS en Cerrillos NO excluye San José de los Cerrillos aunque el área traiga gobierno local', () => {
    const cell = geoCell(cerrillos!.centroidLat, cerrillos!.centroidLng);
    const res = placeFromCoords({
      lat: cerrillos!.centroidLat,
      lng: cerrillos!.centroidLng,
      // El proveedor devuelve el gobierno local de las localidades vecinas.
      administrativeArea: area({ governmentLocalCode: '660077', governmentLocalName: 'Cerrillos' }),
      cell,
    });

    const ids = res.candidates.map((c) => c.place.providerPlaceId);
    assert.ok(ids.includes(IDS.cerrillos), 'San José de los Cerrillos fue excluido');
    // Y además no queda enterrado detrás de sus satélites: está a 0 km.
    assert.equal(res.candidates[0].place.providerPlaceId, IDS.cerrillos);
    assert.equal(res.candidates[0].governmentLocalMatch, false);
    assert.equal(res.candidates[0].withinResolvedArea, true);
  });

  it('el conjunto de candidatos es el departamento entero, no el gobierno local', () => {
    const cell = geoCell(cerrillos!.centroidLat, cerrillos!.centroidLng);
    const res = placeFromCoords({
      lat: cerrillos!.centroidLat,
      lng: cerrillos!.centroidLng,
      administrativeArea: area({ governmentLocalCode: '660077' }),
      cell,
    });
    const enDepartamento = placesInAdmin2('66035').length;
    const dentro = res.candidates.filter((c) => c.withinResolvedArea).length;
    assert.equal(dentro, Math.min(enDepartamento, GEO_MAX_CANDIDATES));
    // Hay candidatos con gobierno local distinto del resuelto: no se filtraron.
    assert.ok(res.candidates.some((c) => !c.governmentLocalMatch));
  });

  it('el código no filtra por gobierno local en ningún lado', () => {
    const src = read('lib/geoplace/resolve.ts');
    assert.doesNotMatch(src, /filter\([^)]*governmentLocalCode\s*===/);
    assert.doesNotMatch(src, /placesInGovernmentLocal/);
    // El conjunto se ancla en el nivel 2.
    assert.match(src, /placesInAdmin2\(area\.admin2Code\)/);
  });

  it('con varias localidades en el área siempre se pide confirmación salvo corroboración oficial', () => {
    const res = placeFromCoords({
      lat: cerrillos!.centroidLat,
      lng: cerrillos!.centroidLng,
      administrativeArea: area({ governmentLocalCode: '660077' }),
      cell: geoCell(cerrillos!.centroidLat, cerrillos!.centroidLng),
    });
    assert.notEqual(res.confidence, 'high');
    assert.equal(res.requiresConfirmation, true);
    assert.equal(res.governmentLocalCorroborated, false);
  });
});

// ------------------------------------------------------------
// 9. placeFromCoords — no adivinar
// ------------------------------------------------------------

describe('placeFromCoords', () => {
  const salta = placeById(IDS.salta)!;

  it('sin área oficial sólo sugiere por centroide, y nunca lo confirma', () => {
    const res = placeFromCoords({ lat: salta.centroidLat, lng: salta.centroidLng, administrativeArea: null });
    assert.equal(res.source, 'offline-fallback');
    assert.equal(res.confidence, 'low');
    assert.equal(res.requiresConfirmation, true);
    assert.equal(res.boundaryRisk, true);
    assert.equal(res.administrativeArea, null);
    assert.equal(res.reason, 'offline-fallback');
    // El centroide más cercano aparece como ayuda, no como respuesta.
    assert.equal(res.candidates[0].place.providerPlaceId, IDS.salta);
  });

  it('el fallback offline nunca devuelve confianza alta, en ningún punto del país', () => {
    const puntos = [
      [-34.6037, -58.3816],
      [-31.4201, -64.1888],
      [-54.8019, -68.303],
      [-24.1858, -65.2995],
      [-38.0055, -57.5426],
    ] as const;
    for (const [lat, lng] of puntos) {
      const res = placeFromCoords({ lat, lng, administrativeArea: null });
      assert.equal(res.confidence, 'low', `${lat},${lng}`);
      assert.equal(res.requiresConfirmation, true, `${lat},${lng}`);
      assert.equal(res.source, 'offline-fallback', `${lat},${lng}`);
    }
  });

  it('coordenadas inválidas no producen candidatos', () => {
    for (const [lat, lng] of [[NaN, 0], [91, 0], [0, 181]] as const) {
      const res = placeFromCoords({ lat, lng, administrativeArea: area() });
      assert.equal(res.candidates.length, 0);
      assert.equal(res.reason, 'no-candidates');
      assert.equal(res.requiresConfirmation, true);
    }
  });

  it('un área con una sola localidad y centroide cercano sí puede dar confianza alta', () => {
    const unica = allPlaces().find((p) => placesInAdmin2(p.admin2Code).length === 1);
    assert.ok(unica, 'debería existir al menos un departamento con una sola localidad');
    const res = placeFromCoords({
      lat: unica.centroidLat,
      lng: unica.centroidLng,
      administrativeArea: area({
        admin1Code: unica.admin1Code,
        admin1Name: unica.admin1Name,
        admin2Code: unica.admin2Code,
        admin2Name: unica.admin2Name,
      }),
      cell: geoCell(unica.centroidLat, unica.centroidLng),
    });
    assert.equal(res.reason, 'single-candidate');
    assert.equal(res.confidence, 'high');
    assert.equal(res.requiresConfirmation, false);
  });

  it('el gobierno local coincidente corrobora y es el único camino a confianza alta con varias localidades', () => {
    // Se busca en el catálogo un caso real: una localidad con gobierno local,
    // en un departamento con varias, y sin vecina a menos del umbral. Buscarlo
    // en los datos evita que el test dependa de un nombre que puede cambiar.
    const caso = allPlaces().find((p) => {
      if (!p.governmentLocalCode) return false;
      const hermanas = placesInAdmin2(p.admin2Code);
      if (hermanas.length < 2) return false;
      const nearest = nearestPlaces(p.centroidLat, p.centroidLng, 2);
      return nearest[0].place.placeId === p.placeId
        && (nearest[1].distanceKm as number) >= GEO_CLEAR_WINNER_GAP_KM;
    });
    assert.ok(caso, 'debería existir un caso corroborable en el catálogo');

    const res = placeFromCoords({
      lat: caso.centroidLat,
      lng: caso.centroidLng,
      administrativeArea: area({
        admin1Code: caso.admin1Code,
        admin1Name: caso.admin1Name,
        admin2Code: caso.admin2Code,
        admin2Name: caso.admin2Name,
        governmentLocalCode: caso.governmentLocalCode,
        governmentLocalName: caso.governmentLocalName,
      }),
      cell: geoCell(caso.centroidLat, caso.centroidLng),
    });
    assert.equal(res.candidates[0].place.placeId, caso.placeId);
    assert.equal(res.governmentLocalCorroborated, true);
    assert.equal(res.reason, 'corroborated-nearest');
    assert.equal(res.confidence, 'high');
    assert.equal(res.requiresConfirmation, false);
  });

  it('sin corroboración de gobierno local, el más cercano claro se queda en confianza media', () => {
    const caso = allPlaces().find((p) => {
      if (p.governmentLocalCode) return false;
      const hermanas = placesInAdmin2(p.admin2Code);
      if (hermanas.length < 2) return false;
      const nearest = nearestPlaces(p.centroidLat, p.centroidLng, 2);
      return nearest[0].place.placeId === p.placeId
        && (nearest[1].distanceKm as number) >= GEO_CLEAR_WINNER_GAP_KM;
    });
    assert.ok(caso, 'debería existir una localidad sin gobierno local con vecina lejana');

    const res = placeFromCoords({
      lat: caso.centroidLat,
      lng: caso.centroidLng,
      administrativeArea: area({
        admin1Code: caso.admin1Code,
        admin1Name: caso.admin1Name,
        admin2Code: caso.admin2Code,
        admin2Name: caso.admin2Name,
        // El proveedor resolvió un gobierno local; el candidato no lo tiene.
        governmentLocalCode: '999999',
        governmentLocalName: 'Otro',
      }),
      cell: geoCell(caso.centroidLat, caso.centroidLng),
    });
    // El gobierno local nulo no lo descarta ni lo relega: sigue primero.
    assert.equal(res.candidates[0].place.placeId, caso.placeId);
    assert.equal(res.reason, 'clear-nearest');
    assert.equal(res.confidence, 'medium');
    assert.equal(res.requiresConfirmation, true);
  });

  it('si el lugar más cercano cae en otra área hay riesgo de borde y no se afirma nada', () => {
    // Punto tomado en el centroide de una localidad, pero declarando el área de
    // un departamento distinto: es la forma determinista de simular un límite.
    const res = placeFromCoords({
      lat: salta.centroidLat,
      lng: salta.centroidLng,
      administrativeArea: area({ admin2Code: '66035', admin2Name: 'Cerrillos' }),
      cell: geoCell(salta.centroidLat, salta.centroidLng),
    });
    assert.equal(res.boundaryRisk, true);
    assert.equal(res.reason, 'boundary-risk');
    assert.notEqual(res.confidence, 'high');
    assert.equal(res.requiresConfirmation, true);
    // El candidato de la otra área se ofrece, marcado, pero no primero.
    const fuera = res.candidates.find((c) => !c.withinResolvedArea);
    assert.ok(fuera, 'el vecino de la otra área debería ofrecerse como candidato');
    assert.equal(res.candidates[0].withinResolvedArea, true);
  });

  it('cuando la celda es mayor que la diferencia entre candidatos, se declara riesgo de borde', () => {
    // Celda grande a propósito: el redondeo pasa a ser capaz de cruzar límites.
    const grande = geoCell(cerrillosMid().lat, cerrillosMid().lng, 40);
    const res = placeFromCoords({
      lat: cerrillosMid().lat,
      lng: cerrillosMid().lng,
      administrativeArea: area(),
      cell: grande,
    });
    assert.equal(res.boundaryRisk, true);
    assert.equal(res.requiresConfirmation, true);
    assert.notEqual(res.confidence, 'high');
  });

  it('un área sin localidades en el catálogo no inventa una', () => {
    const res = placeFromCoords({
      lat: salta.centroidLat,
      lng: salta.centroidLng,
      administrativeArea: area({ admin2Code: '99999', admin2Name: 'Inexistente' }),
      cell: geoCell(salta.centroidLat, salta.centroidLng),
    });
    assert.equal(res.candidates.every((c) => !c.withinResolvedArea), true);
    assert.equal(res.reason, 'area-without-places');
    assert.equal(res.confidence, 'low');
    assert.equal(res.requiresConfirmation, true);
  });

  it('nunca devuelve más candidatos que el máximo', () => {
    const res = placeFromCoords({
      lat: salta.centroidLat,
      lng: salta.centroidLng,
      administrativeArea: area({ admin2Code: '66028', admin2Name: 'Capital' }),
      cell: geoCell(salta.centroidLat, salta.centroidLng),
    });
    assert.ok(res.candidates.length <= GEO_MAX_CANDIDATES);
  });

  it('confianza alta implica no pedir confirmación, y sólo eso', () => {
    const casos = [
      placeFromCoords({ lat: salta.centroidLat, lng: salta.centroidLng, administrativeArea: null }),
      placeFromCoords({ lat: salta.centroidLat, lng: salta.centroidLng, administrativeArea: area() }),
    ];
    for (const res of casos) {
      assert.equal(res.requiresConfirmation, res.confidence !== 'high');
    }
  });

  it('nearestPlaces ordena por distancia creciente', () => {
    const cands = nearestPlaces(salta.centroidLat, salta.centroidLng, 5);
    assert.equal(cands.length, 5);
    assert.equal(cands[0].place.providerPlaceId, IDS.salta);
    for (let i = 1; i < cands.length; i += 1) {
      assert.ok((cands[i].distanceKm as number) >= (cands[i - 1].distanceKm as number));
    }
  });

  it('el umbral de ganador claro está declarado y es razonable', () => {
    assert.ok(GEO_CLEAR_WINNER_GAP_KM >= 1);
  });
});

/** Punto intermedio dentro del departamento Cerrillos, para las pruebas de celda. */
function cerrillosMid() {
  const cerrillos = placeById(IDS.cerrillos)!;
  return { lat: cerrillos.centroidLat, lng: cerrillos.centroidLng };
}

// ------------------------------------------------------------
// 10. Endpoint /geo del Worker
// ------------------------------------------------------------

describe('endpoint /geo del Worker', () => {
  const geo = read('worker/geo.js');
  const index = read('worker/index.js');

  it('está ruteado en el Worker', () => {
    assert.match(index, /import \{ handleGeo \} from '\.\/geo\.js'/);
    assert.match(index, /url\.pathname === '\/geo'\) return await handleGeo\(request, env, json, authUser\)/);
  });

  it('la app no llama a Georef directamente: sólo el Worker conoce la URL', () => {
    assert.match(geo, /apis\.datos\.gob\.ar\/georef\/api\/v2\.1/);
    for (const file of [
      'lib/geoplace/catalog.ts',
      'lib/geoplace/resolve.ts',
      'lib/geoplace/aliases.ts',
      'lib/geoplace/cell.ts',
      'lib/geoplace/normalize.ts',
      'lib/geoplace/types.ts',
    ]) {
      assert.doesNotMatch(read(file), /apis\.datos\.gob\.ar/, `${file} no debe llamar a Georef`);
    }
  });

  it('fija v2.1 y nunca v1.0', () => {
    assert.doesNotMatch(geo, /georef\/api\/v1\.0/);
  });

  it('consulta el centro de la celda, no la coordenada recibida', () => {
    assert.match(geo, /lat=\$\{cell\.centerLat\}&lon=\$\{cell\.centerLng\}/);
    // No hay ninguna llamada upstream con la coordenada cruda.
    assert.doesNotMatch(geo, /lat=\$\{lat\}/);
    assert.doesNotMatch(geo, /lon=\$\{lon\}/);
  });

  it('expone las cuatro acciones y rechaza lo desconocido', () => {
    for (const action of ['catalog', 'searchPlaces', 'placeById', 'resolveCoords']) {
      assert.match(geo, new RegExp(`action === '${action}'`), action);
    }
    assert.match(geo, /Acción desconocida/);
  });

  it('la caché está versionada por catálogo y por versión de caché', () => {
    assert.match(geo, /GEO_AREA_CACHE_VERSION/);
    assert.match(geo, /GEO_CATALOG_VERSION\}\|\$\{GEO_AREA_CACHE_VERSION/);
    assert.match(geo, /GEO_AREA_CACHE_TTL_SECONDS = 30 \* 24 \* 60 \* 60/);
  });

  it('la caché es memoria + borde, sin infraestructura paga nueva', () => {
    assert.match(geo, /caches\.default/);
    // Sin KV, sin Durable Objects, sin R2: la Cache API no requiere binding.
    assert.doesNotMatch(geo, /env\.[A-Z_]*KV/);
    assert.doesNotMatch(geo, /DurableObject/);
    const wrangler = read('wrangler.toml');
    assert.doesNotMatch(wrangler, /kv_namespaces/);
    assert.doesNotMatch(wrangler, /durable_objects/);
  });

  it('degrada a fallback offline si Georef falla o no hay presupuesto', () => {
    assert.match(geo, /upstream: 'failed'/);
    assert.match(geo, /upstream: 'skipped-budget'/);
    assert.match(geo, /GEOREF_TIMEOUT_MS/);
    assert.match(geo, /AbortController/);
  });

  it('sólo las sesiones autenticadas gastan cuota upstream', () => {
    assert.match(geo, /allowUpstream/);
    assert.match(geo, /upstream: 'skipped-unauthenticated'/);
    assert.match(geo, /await authUser\(request, env, body\)/);
  });
});

// ------------------------------------------------------------
// 10 bis. El endpoint, ejecutado de verdad
// ------------------------------------------------------------

/** Respuesta mínima compatible con el helper `json` del Worker. */
const jsonStub = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

function geoRequest(body: unknown) {
  return new Request('https://api.test/geo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const anonymous = async () => null;
const session = async () => 'user-1';

async function callGeo(body: unknown, auth: () => Promise<string | null> = anonymous) {
  const res = await handleGeo(geoRequest(body), {}, jsonStub, auth);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

describe('/geo ejecutado', () => {
  it('devuelve la metadata del catálogo con licencia y atribución', async () => {
    const { status, body } = await callGeo({ action: 'catalog' });
    assert.equal(status, 200);
    assert.equal(body.catalog.sourceVersion, 'v2.1');
    assert.equal(body.catalog.license, 'CC BY 4.0');
    assert.match(body.attribution, /Georef/);
  });

  it('busca lugares y propaga la ambigüedad', async () => {
    const oran = await callGeo({ action: 'searchPlaces', query: 'oran' });
    assert.equal(oran.body.matches[0].placeId, 'AR:georef:66126070');

    const sanLorenzo = await callGeo({ action: 'searchPlaces', query: 'San Lorenzo' });
    assert.equal(sanLorenzo.body.ambiguous, true);

    const inventado = await callGeo({ action: 'searchPlaces', query: 'Villa Perritos Felices' });
    assert.deepEqual(inventado.body.matches, []);
  });

  it('resuelve por placeId y responde 404 si no existe', async () => {
    const ok = await callGeo({ action: 'placeById', placeId: 'AR:georef:66035010' });
    assert.equal(ok.body.place.localityName, 'San José de los Cerrillos');

    const missing = await callGeo({ action: 'placeById', placeId: 'AR:georef:00000000' });
    assert.equal(missing.status, 404);

    const porNombre = await callGeo({ action: 'placeById', placeId: 'Salta' });
    assert.equal(porNombre.status, 404, 'el nombre no es identidad');
  });

  it('rechaza coordenadas inválidas y acciones desconocidas', async () => {
    assert.equal((await callGeo({ action: 'resolveCoords', lat: 'x', lon: 1 })).status, 400);
    assert.equal((await callGeo({ action: 'resolveCoords', lat: 999, lon: 1 })).status, 400);
    assert.equal((await callGeo({ action: 'nope' })).status, 400);
    assert.equal((await callGeo({})).status, 400);
  });

  it('sin sesión no gasta cuota upstream y degrada a fallback offline', async () => {
    const { body } = await callGeo({ action: 'resolveCoords', lat: -24.886612345, lon: -65.464578901 });
    assert.equal(body.upstream, 'skipped-unauthenticated');
    assert.equal(body.source, 'offline-fallback');
    assert.equal(body.administrativeArea, null);
    assert.equal(body.confidence, 'low');
    assert.equal(body.requiresConfirmation, true);
    // Sugiere, pero no afirma.
    assert.equal(body.candidates[0].placeId, 'AR:georef:66035010');
  });

  it('si Georef falla, responde igual con el fallback en lugar de romper', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('sin red'); };
    try {
      const { status, body } = await callGeo(
        { action: 'resolveCoords', lat: -31.4201, lon: -64.1888 },
        session
      );
      assert.equal(status, 200);
      assert.equal(body.upstream, 'failed');
      assert.equal(body.source, 'offline-fallback');
      assert.equal(body.requiresConfirmation, true);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('con sesión consulta Georef v2.1 y usa el área oficial', async () => {
    const original = globalThis.fetch;
    const llamadas: string[] = [];
    globalThis.fetch = async (input: any) => {
      llamadas.push(String(input));
      return new Response(JSON.stringify({
        ubicacion: {
          provincia: { id: '66', nombre: 'Salta' },
          departamento: { id: '66035', nombre: 'Cerrillos' },
          gobierno_local: { id: '660077', nombre: 'San José de los Cerrillos' },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
      const { body } = await callGeo(
        { action: 'resolveCoords', lat: -24.886612345, lon: -65.464578901 },
        session
      );
      assert.equal(llamadas.length, 1);
      assert.match(llamadas[0], /georef\/api\/v2\.1\/ubicacion/);
      assert.equal(body.source, 'official');
      assert.equal(body.administrativeArea.admin2Code, '66035');
      // REGRESIÓN CERRILLOS, extremo a extremo: la cabecera tiene gobierno local
      // nulo y el proveedor devolvió otro, y aun así encabeza los candidatos.
      assert.equal(body.candidates[0].placeId, 'AR:georef:66035010');
      assert.equal(body.candidates[0].governmentLocalCode, null);
      assert.equal(body.candidates[0].governmentLocalMatch, false);
      assert.equal(body.requiresConfirmation, true);
    } finally {
      globalThis.fetch = original;
    }
  });
});

// ------------------------------------------------------------
// 11. Privacidad
// ------------------------------------------------------------

describe('privacidad', () => {
  const geo = read('worker/geo.js');

  // Coordenada con muchos decimales: identifica una casa, no un barrio. La
  // caché de áreas es global al módulo (por isolate, como en el Worker), así
  // que este bloque usa una celda propia para no depender del orden de los tests.
  const LAT = -26.834512345;
  const LON = -65.220987654;

  it('la coordenada exacta NO sale hacia Georef: sólo el centro de la celda', async () => {
    const original = globalThis.fetch;
    const llamadas: string[] = [];
    globalThis.fetch = async (input: any) => {
      llamadas.push(String(input));
      return new Response(JSON.stringify({
        ubicacion: {
          provincia: { id: '66', nombre: 'Salta' },
          departamento: { id: '66035', nombre: 'Cerrillos' },
          gobierno_local: null,
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
      await callGeo({ action: 'resolveCoords', lat: LAT, lon: LON }, session);
      // La segunda consulta en la misma celda se sirve de caché: la cuota
      // oficial de Georef es de 10.000 por día, así que esto no es opcional.
      const repetida = await callGeo({ action: 'resolveCoords', lat: LAT + 0.0001, lon: LON }, session);
      assert.equal(repetida.body.cache, 'memory');
      assert.equal(repetida.body.upstream, 'cached');
      assert.equal(llamadas.length, 1, 'la celda ya resuelta no debe volver a salir a la red');
      const url = llamadas[0];
      // Ni los decimales finos ni la coordenada completa viajan.
      assert.doesNotMatch(url, /26\.834512345|65\.220987654/);
      assert.doesNotMatch(url, /834512|220987/);
      // Lo que viaja es el centro de la celda, y está a menos de 1 km.
      const params = new URL(url).searchParams;
      const sentLat = Number(params.get('lat'));
      const sentLon = Number(params.get('lon'));
      const moved = geoDistanceKm(LAT, LON, sentLat, sentLon);
      assert.ok(moved > 0, 'debería haber redondeo');
      assert.ok(moved <= 1, `se movió ${moved} km`);
      assert.equal(sentLat, geoCell(LAT, LON)!.centerLat);
      assert.equal(sentLon, geoCell(LAT, LON)!.centerLng);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('las distancias devueltas no permiten trilaterar la posición del usuario', async () => {
    // Tres distancias exactas a centroides públicos reconstruyen el punto de
    // origen. Si se midieran desde la coordenada real, el redondeo a celda no
    // serviría para nada: se miden desde el centro de la celda.
    const cell = geoCell(LAT, LON)!;
    const { body } = await callGeo({ action: 'resolveCoords', lat: LAT, lon: LON });
    assert.ok(body.candidates.length >= 3);
    for (const c of body.candidates) {
      const desdeCelda = geoDistanceKm(cell.centerLat, cell.centerLng, c.centroidLat, c.centroidLng);
      const desdeUsuario = geoDistanceKm(LAT, LON, c.centroidLat, c.centroidLng);
      assert.ok(
        Math.abs(c.distanceKm - desdeCelda) < 0.01,
        `${c.localityName}: ${c.distanceKm} debería medirse desde la celda (${desdeCelda})`
      );
      // Y no coincide con la distancia real, salvo que la celda no haya movido nada.
      if (Math.abs(desdeUsuario - desdeCelda) > 0.01) {
        assert.notEqual(c.distanceKm, Number(desdeUsuario.toFixed(3)));
      }
    }
  });

  it('dos usuarios de la misma celda reciben respuestas idénticas', async () => {
    // Indistinguibilidad dentro de la celda: si las respuestas difirieran, la
    // diferencia sería información sobre la posición dentro de la celda.
    const a = await callGeo({ action: 'resolveCoords', lat: LAT, lon: LON });
    const b = await callGeo({ action: 'resolveCoords', lat: LAT + 0.00002, lon: LON - 0.00003 });
    assert.equal(geoCell(LAT, LON)!.key, geoCell(LAT + 0.00002, LON - 0.00003)!.key);
    assert.deepEqual(a.body.candidates, b.body.candidates);
    assert.deepEqual(a.body.cell, b.body.cell);
  });

  it('la respuesta pública no contiene la coordenada recibida', async () => {
    const { body } = await callGeo({ action: 'resolveCoords', lat: LAT, lon: LON });
    const raw = JSON.stringify(body);
    assert.doesNotMatch(raw, /24\.886612345|65\.464578901/);
    assert.doesNotMatch(raw, /886612|464578/);
    // Sólo se devuelve el centro de celda, y redondeado a ~1 km.
    assert.ok(body.cell);
    assert.equal(body.cell.centerLat, coarseCoord(geoCell(LAT, LON)!.centerLat));
    assert.equal(body.cell.centerLng, coarseCoord(geoCell(LAT, LON)!.centerLng));
    for (const key of ['lat', 'lon', 'lng', 'latitude', 'longitude']) {
      assert.equal(key in body, false, `la respuesta no debe traer ${key}`);
    }
  });

  it('el redondeo ocurre ANTES de salir a la red, no después', () => {
    // La función que sale a internet recibe una celda: no tiene acceso al punto.
    assert.match(geo, /async function fetchAreaFromGeoref\(cell\)/);
    assert.match(geo, /resolveCellArea\(cell, \{ allowUpstream \}\)/);
    assert.match(geo, /lat=\$\{cell\.centerLat\}&lon=\$\{cell\.centerLng\}/);
  });

  it('no se registran coordenadas: el módulo no loguea nada', () => {
    assert.doesNotMatch(geo, /console\.(log|info|warn|error)/);
  });

  it('la clave de caché no contiene la coordenada del usuario', () => {
    const cell = geoCell(-24.785912345, -65.411798765);
    assert.ok(cell);
    assert.doesNotMatch(cell.key, /\./);
  });

  it('el candidato expone el centroide público del lugar, no la posición del usuario', () => {
    const salta = placeById(IDS.salta)!;
    const res = placeFromCoords({ lat: -24.9, lng: -65.5, administrativeArea: null });
    for (const c of res.candidates) {
      assert.equal(c.place.centroidLat, placeById(c.place.providerPlaceId)!.centroidLat);
    }
    // El centroide es un dato del catálogo oficial, idéntico para todo el mundo.
    assert.equal(salta.centroidLat, placeById(IDS.salta)!.centroidLat);
  });

  it('las protecciones existentes siguen intactas', () => {
    // El sistema nuevo no debe degradar lo que ya protegía la ubicación.
    assert.match(read('lib/lastLocation.ts'), /export function publicPayloadHasUserCoords/);
    const push = read('lib/pushPolicy.ts');
    assert.match(push, /keys\.includes\('lat'\) \|\| keys\.includes\('lon'\)/);
    assert.match(push, /export function payloadHasSensitiveLocation/);
  });
});

// ------------------------------------------------------------
// 12. Alcance: la fundación no se pisa con lo legacy
// ------------------------------------------------------------

describe('alcance de la fundación', () => {
  it('el módulo nuevo no ensombrece al lib/geo.ts que todavía se usa', () => {
    // Varias pantallas importan '../lib/geo'. Un directorio lib/geo/ haría que
    // ese import cambie de destino en cuanto alguien agregue un index, así que
    // el sistema nuevo vive en lib/geoplace/.
    assert.match(read('lib/geo.ts'), /export async function detectCurrentLocality/);
    for (const file of ['screens/AlertsScreen.tsx', 'screens/AdoptionDiscoveryScreen.tsx', 'components/LocalityPicker.tsx']) {
      assert.match(read(file), /from '\.\.\/lib\/geo'/, file);
    }
    assert.throws(() => read('lib/geo/catalog.ts'), 'lib/geo/ no debe existir como directorio');
  });

  it('LocalityPicker y el catálogo viejo siguen en su lugar', () => {
    const picker = read('components/LocalityPicker.tsx');
    assert.match(picker, /acceptTyped/);
    assert.match(read('lib/localities.ts'), /ARGENTINA_LOCALITIES/);
  });

  it('el endpoint /geo no toca D1', () => {
    const geo = read('worker/geo.js');
    // SQL en mayúsculas, para no confundirse con memoryCache.delete().
    assert.doesNotMatch(geo, /\b(INSERT INTO|UPDATE |DELETE FROM|ALTER TABLE|CREATE TABLE|DROP TABLE)/);
    assert.doesNotMatch(geo, /env\.DB/);
    assert.doesNotMatch(geo, /geo_places/);
    assert.doesNotMatch(geo, /\.prepare\(/);
  });
});
