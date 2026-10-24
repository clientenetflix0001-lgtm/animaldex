// ============================================================
// Animaldex — GPS a lugar normalizado.
// ============================================================
// Camino normal (sin Georef remoto):
//
//   GPS → Location.reverseGeocodeAsync() → texto de municipio/departamento
//       → catálogo GEO embebido → GeoPlace + IDs existentes
//
// En web reverseGeocodeAsync no entrega texto (Expo SDK 49+). Ahí se usa
// el catálogo embebido por cercanía de celda, siempre con confirmación.
// No se llama a `/geo` (Georef remoto).
//
// PRIVACIDAD: la coordenada se obtiene acá y NO se devuelve al llamador.
// Tampoco se manda al Worker. Esta función sólo entrega lugares del catálogo,
// que son públicos.
// ============================================================

import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { placeById } from './geoplace/catalog.ts';
import { GEO_COUNTRY_CODE, GEO_PROVIDER } from './geoplace/catalog.ts';
import type { GeoCandidate, PlaceResolution } from './geoplace/types.ts';
import { chooseLocateResolution, EMPTY_DEVICE_RESOLUTION } from './placeLocateResolution.ts';

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

const SAFE_EMPTY = EMPTY_DEVICE_RESOLUTION;

async function ensureForegroundPermission(): Promise<'granted' | 'denied' | 'unavailable'> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.status === 'granted') return 'granted';
    if (current.status === 'denied' && current.canAskAgain === false) return 'denied';
    const requested = await Location.requestForegroundPermissionsAsync();
    if (requested.status === 'granted') return 'granted';
    return 'denied';
  } catch {
    try {
      const requested = await Location.requestForegroundPermissionsAsync();
      return requested.status === 'granted' ? 'granted' : 'unavailable';
    } catch {
      return 'unavailable';
    }
  }
}

/**
 * Pide la ubicación, la pasa por el reverse geocoder del dispositivo y la
 * normaliza contra el catálogo embebido.
 *
 * Nunca devuelve la coordenada del usuario. En Android, si el geocoder falla
 * no se inventa un lugar por cercanía de centroide. En web, sin texto de
 * geocoder, el catálogo local sugiere candidatos con confirmación.
 */
export async function locateCurrentPlace(): Promise<LocateResult> {
  let coords: { latitude: number; longitude: number };
  try {
    const permission = await ensureForegroundPermission();
    if (permission === 'denied') return { ok: false, reason: 'permission-denied' };
    if (permission !== 'granted') return { ok: false, reason: 'position-unavailable' };
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    coords = pos.coords;
    if (!Number.isFinite(coords?.latitude) || !Number.isFinite(coords?.longitude)) {
      return { ok: false, reason: 'position-unavailable' };
    }
  } catch {
    return { ok: false, reason: 'position-unavailable' };
  }

  let geocode = null;
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
    geocode = results?.[0] ?? null;
  } catch {
    geocode = null;
  }

  return {
    ok: true,
    ...chooseLocateResolution({
      platform: Platform.OS,
      geocode,
      latitude: coords.latitude,
      longitude: coords.longitude,
    }),
  };
}

export { SAFE_EMPTY };

// `unambiguousPlace` vive en placeResolution.ts, que no importa expo-location
// ni el cliente HTTP. Se reexporta para que las pantallas sigan pidiéndolo acá.
export { unambiguousPlace } from './placeResolution.ts';
