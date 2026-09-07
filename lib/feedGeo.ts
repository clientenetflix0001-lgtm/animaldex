// Geo helpers for Home ranking. No maps, no UI, no expo-location.
// Posts today have no coordinates; 10 km Haversine applies to alerts
// (and any future row that actually stores lat/lng).

export const NEARBY_RADIUS_KM = 10;
export const EARTH_RADIUS_KM = 6371;

export type GeoPoint = { lat: number; lng: number };

export type BoundingBox = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

export function isFiniteCoord(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function validLatLng(lat: unknown, lng: unknown): lat is number {
  return isFiniteCoord(lat) && isFiniteCoord(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/** Prefilter before Haversine. ~1° lat ≈ 111 km. */
export function boundingBox(lat: number, lng: number, radiusKm = NEARBY_RADIUS_KM): BoundingBox {
  const latDelta = radiusKm / 111;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const lngDenom = Math.max(0.01, 111 * Math.abs(cosLat));
  const lngDelta = radiusKm / lngDenom;
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

export function pointInBoundingBox(lat: number, lng: number, box: BoundingBox): boolean {
  return lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng;
}

export function isWithinRadiusKm(
  from: GeoPoint,
  to: { lat?: number | null; lng?: number | null; lon?: number | null },
  radiusKm = NEARBY_RADIUS_KM
): boolean {
  const toLng = to.lng ?? to.lon;
  if (!validLatLng(from.lat, from.lng) || !validLatLng(to.lat, toLng)) return false;
  const box = boundingBox(from.lat, from.lng, radiusKm);
  if (!pointInBoundingBox(to.lat, toLng, box)) return false;
  return haversineKm(from.lat, from.lng, to.lat, toLng) <= radiusKm + 1e-6;
}

export function normalizeLocality(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

export function localitiesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeLocality(a);
  const right = normalizeLocality(b);
  if (!left || !right) return false;
  return left === right;
}

/** Author text location may be a free-form address; exact locality still wins. */
export function authorLooksNearby(
  authorLocality: string | null | undefined,
  authorLocationText: string | null | undefined,
  viewerLocality: string | null | undefined
): boolean {
  if (localitiesMatch(authorLocality, viewerLocality)) return true;
  const viewer = normalizeLocality(viewerLocality);
  const text = normalizeLocality(authorLocationText);
  if (!viewer || !text) return false;
  return text === viewer;
}
