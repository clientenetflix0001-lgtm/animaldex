// ============================================================
// Animaldex — GPS a lugar normalizado.
// ============================================================
// Camino normal (sin Georef remoto):
//
//   GPS → Location.reverseGeocodeAsync() → texto de municipio/departamento
//       → catálogo GEO embebido → GeoPlace + IDs existentes
//
// El reverse geocoder del sistema operativo es rápido y ya distinguía
// Cerrillos de Salta. El catálogo convierte ese texto en la identidad que
// ya usan Alertas, Adopción y Páginas. `/geo` (Georef remoto) sigue en el
// Worker por si otro sistema lo necesita; esta función ya no lo llama.
//
// PRIVACIDAD: la coordenada se obtiene acá y NO se devuelve al llamador.
// Tampoco se manda al Worker. Esta función sólo entrega lugares del catálogo,
// que son públicos.
// ============================================================

import * as Location from 'expo-location';
import { placeById } from './geoplace/catalog.ts';
import { resolutionFromGeocode } from './geoplace/fromGeocode.ts';
import { GEO_COUNTRY_CODE, GEO_PROVIDER } from './geoplace/catalog.ts';
import type { GeoCandidate, PlaceResolution } from './geoplace/types.ts';

export type LocateFailure =
  /** El usuario no dio permiso de ubicación. */
  | 'permission-denied'
  /** El dispositivo no pudo obtener una posición. */
  | 'position-unavailable';

export type LocateResult =
  | ({ ok: true } & PlaceResolution)
  | { ok: false; reason: LocateFailure };

/** Reconstruye un candidato del catálogo local a partir de la respuesta del Worker. */
function candidateFromWire(raw: any): GeoCandidate | null {
  const place = placeById(raw?.placeId);
  if (!place) return null;
  const distanceKm = Number.isFinite(Number(raw?.distanceKm)) ? Number(raw.distanceKm) : null;
  return {
    place,
    distanceKm,
    withinResolvedArea: !!raw?.withinResolvedArea,
    governmentLocalMatch: !!raw?.governmentLocalMatch,
  };
}

/**
 * Traduce la respuesta de `/geo`. Se conserva porque el endpoint sigue
 * existiendo para otros consumidores; el camino de detección automática
 * ya no lo usa.
 */
export function resolutionFromWire(raw: any): PlaceResolution | null {
  if (!raw || raw.ok !== true) return null;
  const candidates = Array.isArray(raw.candidates)
    ? raw.candidates.map(candidateFromWire).filter((c: GeoCandidate | null): c is GeoCandidate => !!c)
    : [];
  const area = raw.administrativeArea;
  return {
    administrativeArea: area && area.admin2Code
      ? {
        countryCode: String(area.countryCode || GEO_COUNTRY_CODE),
        provider: String(area.provider || GEO_PROVIDER),
        admin1Code: String(area.admin1Code || ''),
        admin1Name: String(area.admin1Name || ''),
        admin2Code: String(area.admin2Code),
        admin2Name: String(area.admin2Name || ''),
        governmentLocalCode: area.governmentLocalCode ?? null,
        governmentLocalName: area.governmentLocalName ?? null,
      }
      : null,
    candidates,
    confidence: raw.confidence === 'high' || raw.confidence === 'medium' ? raw.confidence : 'low',
    requiresConfirmation: raw.requiresConfirmation !== false,
    source: raw.source === 'official' ? 'official' : 'offline-fallback',
    boundaryRisk: !!raw.boundaryRisk,
    governmentLocalCorroborated: !!raw.governmentLocalCorroborated,
    reason: raw.reason || 'offline-fallback',
  };
}

const SAFE_EMPTY: PlaceResolution = {
  administrativeArea: null,
  candidates: [],
  confidence: 'low',
  requiresConfirmation: true,
  source: 'device-geocode',
  boundaryRisk: false,
  governmentLocalCorroborated: false,
  reason: 'no-candidates',
};

/**
 * Pide la ubicación, la pasa por el reverse geocoder del dispositivo y la
 * normaliza contra el catálogo embebido.
 *
 * Nunca devuelve la coordenada del usuario. Si el geocoder falla, no se
 * inventa un lugar por cercanía de centroide: el usuario elige a mano.
 */
export async function locateCurrentPlace(): Promise<LocateResult> {
  let coords: { latitude: number; longitude: number };
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { ok: false, reason: 'permission-denied' };
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    coords = pos.coords;
    if (!Number.isFinite(coords?.latitude) || !Number.isFinite(coords?.longitude)) {
      return { ok: false, reason: 'position-unavailable' };
    }
  } catch {
    return { ok: false, reason: 'position-unavailable' };
  }

  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
    const r = results?.[0];
    return {
      ok: true,
      ...resolutionFromGeocode({
        city: r?.city ?? null,
        subregion: r?.subregion ?? null,
        region: r?.region ?? null,
      }),
    };
  } catch {
    return { ok: true, ...SAFE_EMPTY };
  }
}

// `unambiguousPlace` vive en placeResolution.ts, que no importa expo-location
// ni el cliente HTTP. Se reexporta para que las pantallas sigan pidiéndolo acá.
export { unambiguousPlace } from './placeResolution.ts';
