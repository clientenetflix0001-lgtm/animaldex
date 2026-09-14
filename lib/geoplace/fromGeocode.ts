// ============================================================
// Reverse geocode del dispositivo → GeoPlace del catálogo.
// ============================================================
// El sistema operativo entrega texto (ciudad, departamento, provincia). Eso
// no es identidad. Acá se normaliza contra el catálogo embebido, sin llamar
// a Georef remoto ni afirmar barrios, calles o puntos de interés.
//
// Prioridad: MUNICIPIO. Si no hay municipio, DEPARTAMENTO. Nunca se elige
// una localidad censal tipo barrio cuando el gobierno local o el departamento
// apuntan a la cabecera.
// ============================================================

import { placesInAdmin2 } from './catalog.ts';
import { normalizeGeoText } from './normalize.ts';
import { resolvePlaceFromText } from './resolve.ts';
import type { AdministrativeArea, GeoPlace, PlaceResolution } from './types.ts';

/** Campos del reverse geocoder que sí se consideran. El resto se ignora. */
export type DeviceGeocode = {
  /** Municipio / ciudad. En Android suele ser `city`. */
  city?: string | null;
  /** Departamento. En Android suele ser `subregion`. */
  subregion?: string | null;
  /** Provincia. En Android suele ser `region`. */
  region?: string | null;
};

const EMPTY: PlaceResolution = {
  administrativeArea: null,
  candidates: [],
  confidence: 'low',
  requiresConfirmation: true,
  source: 'device-geocode',
  boundaryRisk: false,
  governmentLocalCorroborated: false,
  reason: 'no-candidates',
};

function textOf(value: unknown): string {
  return String(value || '').trim();
}

function areaFromPlace(place: GeoPlace): AdministrativeArea {
  return {
    countryCode: place.countryCode,
    provider: place.provider,
    admin1Code: place.admin1Code,
    admin1Name: place.admin1Name,
    admin2Code: place.admin2Code,
    admin2Name: place.admin2Name,
    governmentLocalCode: place.governmentLocalCode ?? null,
    governmentLocalName: place.governmentLocalName ?? null,
  };
}

function confirmed(place: GeoPlace): PlaceResolution {
  return {
    administrativeArea: areaFromPlace(place),
    candidates: [{
      place,
      distanceKm: null,
      withinResolvedArea: true,
      governmentLocalMatch: false,
    }],
    confidence: 'high',
    requiresConfirmation: false,
    source: 'device-geocode',
    boundaryRisk: false,
    governmentLocalCorroborated: false,
    reason: 'single-candidate',
  };
}

function isCabecera(place: GeoPlace): boolean {
  const loc = normalizeGeoText(place.localityName);
  const admin1 = normalizeGeoText(place.admin1Name);
  const admin2 = normalizeGeoText(place.admin2Name);
  if (!loc) return false;
  if (loc === admin2) return true;
  if (loc === admin1) return true;
  if (admin2 && admin2 !== 'capital' && loc.includes(admin2)) return true;
  return false;
}

/** Localidad censal tipo barrio/urbanización: no es municipio. */
function isBarrioLike(place: GeoPlace): boolean {
  if (isCabecera(place)) return false;
  const loc = normalizeGeoText(place.localityName);
  const gl = normalizeGeoText(place.governmentLocalName);
  if (gl && gl !== loc) return true;
  if (!place.governmentLocalName && !isCabecera(place)) return true;
  return false;
}

function cabeceraOfAdmin2(place: GeoPlace): GeoPlace | null {
  const hits = placesInAdmin2(place.admin2Code);
  const named = hits.filter((p) => normalizeGeoText(p.localityName) === normalizeGeoText(place.admin2Name));
  if (named.length === 1) return named[0];
  const capital = hits.filter((p) => normalizeGeoText(p.localityName) === normalizeGeoText(place.admin1Name));
  if (capital.length === 1) return capital[0];
  const byGl = resolvePlaceFromText(place.governmentLocalName, {
    admin1Code: place.admin1Code,
    admin1Name: place.admin1Name,
  });
  if (byGl.place && !byGl.ambiguous) return byGl.place;
  const byDept = resolvePlaceFromText(place.admin2Name, {
    admin1Code: place.admin1Code,
    admin1Name: place.admin1Name,
  });
  if (byDept.place && !byDept.ambiguous) return byDept.place;
  return null;
}

function toMunicipality(place: GeoPlace): GeoPlace {
  if (!isBarrioLike(place)) return place;
  if (place.governmentLocalName) {
    const gl = resolvePlaceFromText(place.governmentLocalName, {
      admin1Code: place.admin1Code,
      admin1Name: place.admin1Name,
    });
    if (gl.place && !gl.ambiguous) return gl.place;
  }
  return cabeceraOfAdmin2(place) || place;
}

function uniqueMunicipalities(places: GeoPlace[]): GeoPlace[] {
  const seen = new Set<string>();
  const out: GeoPlace[] = [];
  for (const raw of places) {
    const place = toMunicipality(raw);
    if (seen.has(place.placeId)) continue;
    seen.add(place.placeId);
    out.push(place);
  }
  return out;
}

function fromPlaces(places: GeoPlace[]): PlaceResolution {
  const unique = uniqueMunicipalities(places);
  if (unique.length === 1) return confirmed(unique[0]);
  if (unique.length > 1) {
    return {
      administrativeArea: null,
      candidates: unique.slice(0, 8).map((place) => ({
        place,
        distanceKm: null,
        withinResolvedArea: true,
        governmentLocalMatch: false,
      })),
      confidence: 'medium',
      requiresConfirmation: true,
      source: 'device-geocode',
      boundaryRisk: false,
      governmentLocalCorroborated: false,
      reason: 'multiple-candidates',
    };
  }
  return EMPTY;
}

function namedPlaces(name: string, region: string | null, subregion: string | null): GeoPlace[] {
  const res = resolvePlaceFromText(name, { admin1Name: region });
  let places = res.place && !res.ambiguous ? [res.place] : [...res.candidates];
  if (subregion && places.length > 1) {
    const nSub = normalizeGeoText(subregion);
    const scoped = places.filter((p) => normalizeGeoText(p.admin2Name) === nSub);
    if (scoped.length) places = scoped;
  }
  return places;
}

/**
 * Traduce el texto del reverse geocoder a un PlaceResolution del catálogo.
 *
 * Ignora a propósito calle, nombre de vía, distrito/barrio y puntos de interés:
 * esos campos no son municipio ni departamento.
 */
export function resolutionFromGeocode(hint: DeviceGeocode | null | undefined): PlaceResolution {
  const city = textOf(hint?.city);
  const subregion = textOf(hint?.subregion);
  const region = textOf(hint?.region);
  if (!city && !subregion) return EMPTY;

  const nCity = normalizeGeoText(city);
  const nSub = normalizeGeoText(subregion);

  if (city) {
    const got = fromPlaces(namedPlaces(city, region || null, subregion || null));
    if (got.reason !== 'no-candidates') return got;
  }

  if (subregion && nSub !== nCity) {
    const got = fromPlaces(namedPlaces(subregion, region || null, null));
    if (got.reason !== 'no-candidates') return got;
  }

  return EMPTY;
}
