// ============================================================
// Animaldex — GPS a lugar normalizado.
// ============================================================
// Reemplaza a `detectCurrentLocality()` como identidad territorial. La
// diferencia de fondo:
//
//   detectCurrentLocality()  ->  Location.reverseGeocodeAsync()  ->  texto
//   locateCurrentPlace()     ->  Worker /geo  ->  provincia + departamento
//                                oficiales  ->  candidatos GeoPlace
//
// `reverseGeocodeAsync` devuelve el texto que le parece al sistema operativo:
// no es un identificador, cambia entre Android e iOS, y no se puede comparar
// con el catálogo oficial. Sirve para mostrar, no para decidir territorio.
//
// PRIVACIDAD: la coordenada se obtiene acá y NO se devuelve al llamador. El
// Worker la redondea a una celda de ~1 km antes de consultar al proveedor
// oficial. Esta función sólo entrega lugares del catálogo, que son públicos.
// ============================================================

import * as Location from 'expo-location';
import { db } from './db';
import { placeById, placeFromCoords } from './geoplace/resolve.ts';
import { GEO_COUNTRY_CODE, GEO_PROVIDER } from './geoplace/catalog.ts';
import type { GeoCandidate, GeoPlace, PlaceResolution } from './geoplace/types.ts';

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
 * Traduce la respuesta de `/geo`. Los lugares se resuelven contra el catálogo
 * embebido y no se construyen con lo que llegó por la red: el `placeId` es la
 * identidad, el resto del payload es sólo señal.
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
    // Se respeta lo que decidió el servidor, y ante la duda se confirma.
    requiresConfirmation: raw.requiresConfirmation !== false,
    source: raw.source === 'official' ? 'official' : 'offline-fallback',
    boundaryRisk: !!raw.boundaryRisk,
    governmentLocalCorroborated: !!raw.governmentLocalCorroborated,
    reason: raw.reason || 'offline-fallback',
  };
}

/**
 * Pide la ubicación, la resuelve contra el endpoint GEO y devuelve candidatos.
 *
 * Nunca devuelve la coordenada del usuario. Si el endpoint no responde (Georef
 * caído, sin red, sin sesión) resuelve localmente contra el catálogo embebido,
 * con confianza baja y confirmación obligatoria: crear contenido no se bloquea
 * porque un servicio externo esté caído.
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
    const wire = await db.geoResolveCoords(coords.latitude, coords.longitude);
    const resolution = resolutionFromWire(wire);
    if (resolution) return { ok: true, ...resolution };
  } catch {
    // Sin red o endpoint caído: se sigue con el catálogo local.
  }

  // Fallback local. No hay polígono oficial, así que esto es una sugerencia por
  // cercanía de centroide y nunca una localidad confirmada.
  const local = placeFromCoords({ lat: coords.latitude, lng: coords.longitude });
  return { ok: true, ...local };
}

// `unambiguousPlace` vive en placeResolution.ts, que no importa expo-location
// ni el cliente HTTP. Se reexporta para que las pantallas sigan pidiéndolo acá.
export { unambiguousPlace } from './placeResolution.ts';
