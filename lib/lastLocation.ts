import { haversineKm, validLatLng } from './feedGeo';

/** Last useful location only. Never a history of positions. */
export const LAST_LOCATION_POLICY = {
  staleMs: 6 * 60 * 60 * 1000,
  significantMoveKm: 2,
  accuracy: 'balanced' as const,
  nearbyRadiusKm: 10,
};

export const LAST_LOCATION_CACHE_KEY = 'animaldex-last-useful-location';

export type LastLocationSnapshot = {
  lat: number | null;
  lng: number | null;
  locality: string | null;
  updatedAt: number;
  source: 'gps' | 'profile' | 'cache';
};

export function parseLastLocation(raw: unknown): LastLocationSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const lat = row.lat == null ? null : Number(row.lat);
  const lng = row.lng == null ? null : Number(row.lng);
  const locality = typeof row.locality === 'string' && row.locality.trim() ? row.locality.trim() : null;
  const updatedAt = Number(row.updatedAt);
  const source = row.source === 'gps' || row.source === 'profile' || row.source === 'cache' ? row.source : 'cache';
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return null;
  if (lat != null && lng != null && !validLatLng(lat, lng)) return null;
  if (lat == null && lng == null && !locality) return null;
  return { lat, lng, locality, updatedAt, source };
}

export function locationIsStale(prev: LastLocationSnapshot | null, now: number, staleMs = LAST_LOCATION_POLICY.staleMs): boolean {
  if (!prev) return true;
  return now - prev.updatedAt >= staleMs;
}

export function movedSignificantly(
  prev: LastLocationSnapshot | null,
  next: Pick<LastLocationSnapshot, 'lat' | 'lng'>,
  thresholdKm = LAST_LOCATION_POLICY.significantMoveKm
): boolean {
  if (!prev || !validLatLng(prev.lat, prev.lng) || !validLatLng(next.lat, next.lng)) return false;
  return haversineKm(prev.lat, prev.lng, next.lat, next.lng) >= thresholdKm;
}

export function localityChanged(prev: LastLocationSnapshot | null, nextLocality: string | null | undefined): boolean {
  const a = String(prev?.locality || '').trim().toLowerCase();
  const b = String(nextLocality || '').trim().toLowerCase();
  if (!b) return false;
  return a !== b;
}

/**
 * D1 write gate. Avoids foreground → WRITE → foreground → WRITE.
 * Local cache may update more freely; this is only the server write.
 */
export function shouldWriteLastLocation(
  prev: LastLocationSnapshot | null,
  next: Pick<LastLocationSnapshot, 'lat' | 'lng' | 'locality'>,
  now: number,
  policy = LAST_LOCATION_POLICY
): boolean {
  if (!prev) return Boolean((next.lat != null && next.lng != null) || next.locality);
  if (locationIsStale(prev, now, policy.staleMs)) return true;
  if (movedSignificantly(prev, next, policy.significantMoveKm)) return true;
  if (localityChanged(prev, next.locality)) return true;
  return false;
}

export function fallbackLocality(
  gpsLocality: string | null | undefined,
  profileLocality: string | null | undefined,
  profileLocationText: string | null | undefined
): string | null {
  const gps = String(gpsLocality || '').trim();
  if (gps) return gps;
  const catalog = String(profileLocality || '').trim();
  if (catalog) return catalog;
  const text = String(profileLocationText || '').trim();
  return text || null;
}

export function publicPayloadHasUserCoords(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const row = payload as Record<string, unknown>;
  const keys = ['last_lat', 'last_lng', 'lastLat', 'lastLng', 'last_location_lat', 'last_location_lng'];
  return keys.some((key) => key in row && row[key] != null);
}
