// Geo helpers for Home ranking. No maps, no UI, no expo-location.
//
// Two distinct contracts — do not mix them:
//   postLocalityRelevant  → same locality / zone text (posts have no lat/lng today)
//   alertWithinRadiusKm   → real 10 km via bounding box + Haversine (alerts have coords)
//
// Future posts with lat/lng can call postWithinRadiusKm without rewriting the compositor.

/** Real metric radius. Alerts (and any future row that actually stores lat/lng). */
export const ALERT_RADIUS_KM = 10;
/** @deprecated Use ALERT_RADIUS_KM. This is a metric radius, not a post locality flag. */
export const NEARBY_RADIUS_KM = ALERT_RADIUS_KM;
export const EARTH_RADIUS_KM = 6371;

export type Locatable = { lat?: number | null; lng?: number | null; lon?: number | null };

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
export function boundingBox(lat: number, lng: number, radiusKm = ALERT_RADIUS_KM): BoundingBox {
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
  to: Locatable,
  radiusKm = ALERT_RADIUS_KM
): boolean {
  const toLng = to.lng ?? to.lon;
  if (!validLatLng(from.lat, from.lng) || !validLatLng(to.lat, toLng)) return false;
  const box = boundingBox(from.lat, from.lng, radiusKm);
  if (!pointInBoundingBox(to.lat, toLng, box)) return false;
  return haversineKm(from.lat, from.lng, to.lat, toLng) <= radiusKm + 1e-6;
}

export function hasMetricCoords(row: Locatable | null | undefined): boolean {
  if (!row) return false;
  return validLatLng(row.lat, row.lng ?? row.lon);
}

/** Alerts with real coordinates. Never used to rank posts without lat/lng. */
export function alertWithinRadiusKm(
  alert: Locatable,
  viewer: GeoPoint,
  radiusKm = ALERT_RADIUS_KM
): boolean {
  return isWithinRadiusKm(viewer, alert, radiusKm);
}

/**
 * Future posts that store lat/lng. Returns false when the post has no coords
 * so we never claim a 10 km distance for locality-only posts.
 */
export function postWithinRadiusKm(
  post: Locatable,
  viewer: GeoPoint,
  radiusKm = ALERT_RADIUS_KM
): boolean {
  if (!hasMetricCoords(post)) return false;
  return isWithinRadiusKm(viewer, post, radiusKm);
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

/**
 * Post local relevance: same locality / zone text.
 * Not a metric distance. Posts today have no lat/lng.
 */
export function postLocalityRelevant(
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
