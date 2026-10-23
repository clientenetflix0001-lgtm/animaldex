/**
 * Elige cómo convertir GPS → catálogo.
 *
 * Android/iOS: reverse geocode del SO → texto → catálogo.
 * Web: expo-location.reverseGeocodeAsync() devuelve [] (API retirada en
 * SDK 49). No se llama a Georef remoto. Se usa el catálogo embebido por
 * cercanía de celda, siempre con confirmación, igual que el fallback
 * offline de placeFromCoords.
 */

import { GEO_MAX_PLAUSIBLE_KM, placeFromCoords } from './geoplace/resolve.ts';
import { resolutionFromGeocode, type DeviceGeocode } from './geoplace/fromGeocode.ts';
import type { PlaceResolution } from './geoplace/types.ts';

export const EMPTY_DEVICE_RESOLUTION: PlaceResolution = {
  administrativeArea: null,
  candidates: [],
  confidence: 'low',
  requiresConfirmation: true,
  source: 'device-geocode',
  boundaryRisk: false,
  governmentLocalCorroborated: false,
  reason: 'no-candidates',
};

export function geocodeHasText(geocode: DeviceGeocode | null | undefined): boolean {
  if (!geocode) return false;
  return !!(String(geocode.city || '').trim() || String(geocode.subregion || '').trim() || String(geocode.region || '').trim());
}

export function chooseLocateResolution(input: {
  platform: string;
  geocode: DeviceGeocode | null | undefined;
  latitude: number;
  longitude: number;
}): PlaceResolution {
  if (geocodeHasText(input.geocode)) {
    return resolutionFromGeocode({
      city: input.geocode?.city ?? null,
      subregion: input.geocode?.subregion ?? null,
      region: input.geocode?.region ?? null,
    });
  }

  // Android: geocoder vacío o fallido no inventa un municipio por centroide.
  if (input.platform !== 'web') return EMPTY_DEVICE_RESOLUTION;

  const res = placeFromCoords({ lat: input.latitude, lng: input.longitude });
  const nearestKm = res.candidates[0]?.distanceKm;
  if (nearestKm != null && nearestKm > GEO_MAX_PLAUSIBLE_KM) {
    return { ...EMPTY_DEVICE_RESOLUTION, source: 'offline-fallback', reason: 'no-candidates' };
  }
  return res;
}
