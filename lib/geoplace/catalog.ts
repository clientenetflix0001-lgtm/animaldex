// ============================================================
// Catálogo geográfico embebido.
// ============================================================
// Única fuente de verdad para lugares. El snapshot viene del Servicio Georef
// v2.1 y se regenera con `node scripts/geo/build-catalog.mjs`.
//
// Los índices se construyen la primera vez que se usan para no pagar el costo
// en el arranque de la app.
// ============================================================

import snapshot from './catalog.ar.ts';
import {
  containsWord,
  geoDistanceKm,
  matchesTokenPrefix,
  normalizeGeoText,
  validGeoPoint,
} from './normalize.ts';
import type {
  GeoCatalogMeta,
  GeoPlace,
  GeoSearchResult,
  GeoTextMatch,
  GeoTextMatchTier,
  GeoContext,
} from './types.ts';

export const GEO_CATALOG_VERSION = snapshot.geoCatalogVersion;
export const GEO_COUNTRY_CODE = snapshot.countryCode;
export const GEO_PROVIDER = snapshot.provider;

/**
 * Atribución CC BY 4.0. Obligatoria en cualquier pantalla que muestre estos
 * datos: se renderiza en el pie del PlacePicker y en "Fuentes de datos".
 */
export const GEO_ATTRIBUTION = snapshot.attribution;

export function geoCatalogMeta(): GeoCatalogMeta {
  const { admin1, admin2, governmentLocal, placeFields, places, ...meta } = snapshot;
  return meta;
}

export function qualifyPlaceId(providerPlaceId: string, countryCode = GEO_COUNTRY_CODE, provider = GEO_PROVIDER): string {
  return `${countryCode}:${provider}:${providerPlaceId}`;
}

export type ParsedPlaceId = { countryCode: string; provider: string; providerPlaceId: string } | null;

/** Parte un placeId cualificado. Devuelve null si no tiene la forma esperada. */
export function parsePlaceId(placeId: unknown): ParsedPlaceId {
  const parts = String(placeId ?? '').split(':');
  if (parts.length !== 3) return null;
  const [countryCode, provider, providerPlaceId] = parts;
  if (!countryCode || !provider || !providerPlaceId) return null;
  return { countryCode, provider, providerPlaceId };
}

type Indexes = {
  places: GeoPlace[];
  byPlaceId: Map<string, GeoPlace>;
  byProviderId: Map<string, GeoPlace>;
  byNameNorm: Map<string, GeoPlace[]>;
  byAdmin2: Map<string, GeoPlace[]>;
  byAdmin1: Map<string, GeoPlace[]>;
  nameNorms: Map<string, string>;
};

let indexes: Indexes | null = null;

function build(): Indexes {
  const places: GeoPlace[] = [];
  const byPlaceId = new Map<string, GeoPlace>();
  const byProviderId = new Map<string, GeoPlace>();
  const byNameNorm = new Map<string, GeoPlace[]>();
  const byAdmin2 = new Map<string, GeoPlace[]>();
  const byAdmin1 = new Map<string, GeoPlace[]>();
  const nameNorms = new Map<string, string>();

  for (const row of snapshot.places) {
    const [providerPlaceId, localityName, admin1Code, admin2Code, governmentLocalCode, lat, lng] = row;
    const place: GeoPlace = {
      placeId: qualifyPlaceId(providerPlaceId),
      countryCode: snapshot.countryCode,
      provider: snapshot.provider,
      providerPlaceId,
      localityName,
      admin1Code,
      admin1Name: snapshot.admin1[admin1Code] || '',
      admin2Code,
      admin2Name: snapshot.admin2[admin2Code] || '',
      governmentLocalCode: governmentLocalCode || null,
      governmentLocalName: governmentLocalCode ? snapshot.governmentLocal[governmentLocalCode] || null : null,
      centroidLat: lat,
      centroidLng: lng,
    };

    places.push(place);
    byPlaceId.set(place.placeId, place);
    byProviderId.set(providerPlaceId, place);

    const nameNorm = normalizeGeoText(localityName);
    nameNorms.set(place.placeId, nameNorm);
    const sameName = byNameNorm.get(nameNorm);
    if (sameName) sameName.push(place); else byNameNorm.set(nameNorm, [place]);

    const inAdmin2 = byAdmin2.get(admin2Code);
    if (inAdmin2) inAdmin2.push(place); else byAdmin2.set(admin2Code, [place]);

    const inAdmin1 = byAdmin1.get(admin1Code);
    if (inAdmin1) inAdmin1.push(place); else byAdmin1.set(admin1Code, [place]);
  }

  return { places, byPlaceId, byProviderId, byNameNorm, byAdmin2, byAdmin1, nameNorms };
}

function idx(): Indexes {
  if (!indexes) indexes = build();
  return indexes;
}

export function allPlaces(): readonly GeoPlace[] {
  return idx().places;
}

/**
 * Busca por identidad. Acepta el placeId cualificado (`AR:georef:66028050`) y,
 * por conveniencia, el id del proveedor a secas (`66028050`).
 */
export function placeById(placeId: unknown): GeoPlace | null {
  const key = String(placeId ?? '').trim();
  if (!key) return null;
  const direct = idx().byPlaceId.get(key);
  if (direct) return direct;
  const parsed = parsePlaceId(key);
  if (parsed) {
    if (parsed.countryCode !== snapshot.countryCode || parsed.provider !== snapshot.provider) return null;
    return idx().byProviderId.get(parsed.providerPlaceId) || null;
  }
  return idx().byProviderId.get(key) || null;
}

/** Todos los lugares con ese nombre exacto normalizado. Puede devolver varios. */
export function placesByExactName(name: unknown): GeoPlace[] {
  return idx().byNameNorm.get(normalizeGeoText(name)) || [];
}

/**
 * Lugares de un nivel 2 administrativo. Éste es el conjunto de candidatos del
 * resolvedor: el enlace a admin2 está completo al 100% en el catálogo, a
 * diferencia del gobierno local.
 */
export function placesInAdmin2(admin2Code: unknown): readonly GeoPlace[] {
  return idx().byAdmin2.get(String(admin2Code ?? '')) || [];
}

export function placesInAdmin1(admin1Code: unknown): readonly GeoPlace[] {
  return idx().byAdmin1.get(String(admin1Code ?? '')) || [];
}

/** Código de nivel 1 a partir de su nombre, para leer datos heredados. */
export function admin1CodeByName(name: unknown): string | null {
  const target = normalizeGeoText(name);
  if (!target) return null;
  for (const [code, label] of Object.entries(snapshot.admin1)) {
    if (normalizeGeoText(label) === target) return code;
  }
  return null;
}

export function admin1Name(code: unknown): string | null {
  return snapshot.admin1[String(code ?? '')] || null;
}

export function admin2Name(code: unknown): string | null {
  return snapshot.admin2[String(code ?? '')] || null;
}

export function governmentLocalName(code: unknown): string | null {
  return snapshot.governmentLocal[String(code ?? '')] || null;
}

const TIER_ORDER: GeoTextMatchTier[] = ['exact', 'alias', 'starts-with', 'word', 'token-prefix', 'substring'];
const tierRank = (tier: GeoTextMatchTier) => TIER_ORDER.indexOf(tier);

export const GEO_SEARCH_LIMIT = 12;

export type SearchOptions = {
  limit?: number;
  /** Restringe a un nivel 1 administrativo. */
  admin1Code?: string | null;
  /** Ordena por cercanía dentro de cada nivel de coincidencia. */
  nearLat?: number | null;
  nearLng?: number | null;
};

/**
 * Búsqueda por texto. El texto es SOLO una consulta: nunca se convierte en
 * ubicación. Devuelve candidatos ordenados y marca `ambiguous` cuando no hay un
 * único ganador, para que la UI desambigüe en lugar de elegir en silencio.
 *
 *   searchPlaces('oran')  -> San Ramón de la Nueva Orán (coincidencia por palabra)
 *   searchPlaces('metan') -> San José de Metán
 *   searchPlaces('salta') -> Salta (coincidencia exacta)
 *   searchPlaces('san lorenzo') -> 5 coincidencias exactas, ambiguous = true
 */
export function searchPlaces(query: unknown, options: SearchOptions = {}): GeoSearchResult {
  const raw = String(query ?? '');
  const normalizedQuery = normalizeGeoText(raw);
  const limit = Math.max(1, options.limit ?? GEO_SEARCH_LIMIT);
  const empty: GeoSearchResult = {
    query: raw.trim(),
    normalizedQuery,
    matches: [],
    exactCount: 0,
    ambiguous: false,
    truncated: false,
  };
  if (!normalizedQuery) return empty;

  const near = validGeoPoint(options.nearLat, options.nearLng)
    ? { lat: options.nearLat as number, lng: options.nearLng as number }
    : null;

  const { places, nameNorms } = idx();
  const scored: GeoTextMatch[] = [];
  let exactCount = 0;

  for (const place of places) {
    if (options.admin1Code && place.admin1Code !== options.admin1Code) continue;
    const nameNorm = nameNorms.get(place.placeId) || '';
    let tier: GeoTextMatchTier | null = null;

    if (nameNorm === normalizedQuery) tier = 'exact';
    else if (nameNorm.startsWith(`${normalizedQuery} `)) tier = 'starts-with';
    else if (containsWord(nameNorm, normalizedQuery)) tier = 'word';
    else if (matchesTokenPrefix(nameNorm, normalizedQuery)) tier = 'token-prefix';
    else if (nameNorm.includes(normalizedQuery)) tier = 'substring';

    if (!tier) continue;
    if (tier === 'exact') exactCount += 1;
    scored.push({
      place,
      tier,
      distanceKm: near ? geoDistanceKm(near.lat, near.lng, place.centroidLat, place.centroidLng) : null,
    });
  }

  scored.sort((a, b) => {
    const byTier = tierRank(a.tier) - tierRank(b.tier);
    if (byTier) return byTier;
    if (a.distanceKm != null && b.distanceKm != null && a.distanceKm !== b.distanceKm) {
      return a.distanceKm - b.distanceKm;
    }
    const byLength = a.place.localityName.length - b.place.localityName.length;
    if (byLength) return byLength;
    const byName = a.place.localityName.localeCompare(b.place.localityName, 'es');
    if (byName) return byName;
    return a.place.providerPlaceId.localeCompare(b.place.providerPlaceId);
  });

  const matches = scored.slice(0, limit);
  // Ambiguo si hay más de una coincidencia exacta, o si el mejor candidato no es
  // mejor que el siguiente. Un único resultado total nunca es ambiguo.
  const ambiguous = exactCount > 1
    || (scored.length > 1 && exactCount === 0 && scored[0].tier === scored[1].tier);

  return {
    query: raw.trim(),
    normalizedQuery,
    matches,
    exactCount,
    ambiguous,
    truncated: scored.length > matches.length,
  };
}

/** Nivel 1 conocido a partir de un contexto heredado (código o nombre). */
export function contextAdmin1Code(context: GeoContext | null | undefined): string | null {
  if (!context) return null;
  if (context.admin1Code && snapshot.admin1[context.admin1Code]) return context.admin1Code;
  return admin1CodeByName(context.admin1Name);
}
