import { haversineKm, validLatLng } from './feedGeo.ts';
import { parseTerritory, type Territory } from './geoplace/territory.ts';

/** Last useful location only. Never a history of positions. */
export const LAST_LOCATION_POLICY = {
  staleMs: 6 * 60 * 60 * 1000,
  significantMoveKm: 2,
  accuracy: 'balanced' as const,
  alertRadiusKm: 10,
};

export const LAST_LOCATION_CACHE_KEY = 'animaldex-last-useful-location';

/**
 * Última ubicación útil del visitante, para ordenar Inicio.
 *
 * `lat`/`lng` son el centroide público del lugar resuelto, NO la posición del
 * dispositivo. La coordenada real se usa una vez, dentro de
 * `locateCurrentPlace()`, y no sale de ahí: lo que se guarda y se manda al
 * servidor es un punto de referencia de una localidad, que ya es público.
 *
 * `source` distingue de dónde salió la señal:
 *   geo      resuelta por el endpoint /geo a partir del GPS (Fase 5).
 *   profile  texto de la cuenta, sin GPS.
 *   cache    lo que había guardado.
 *   gps      formato anterior, cuando la señal venía del reverse geocoder del
 *            sistema operativo. Ya no se escribe; se sigue leyendo para no
 *            invalidar cachés existentes.
 */
export type LastLocationSnapshot = {
  lat: number | null;
  lng: number | null;
  locality: string | null;
  /** Identidad territorial del lugar, cuando se pudo afirmar alguna. */
  territory: Territory | null;
  updatedAt: number;
  source: 'geo' | 'gps' | 'profile' | 'cache';
};

const SOURCES = ['geo', 'gps', 'profile', 'cache'];

export function parseLastLocation(raw: unknown): LastLocationSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const lat = row.lat == null ? null : Number(row.lat);
  const lng = row.lng == null ? null : Number(row.lng);
  const locality = typeof row.locality === 'string' && row.locality.trim() ? row.locality.trim() : null;
  const updatedAt = Number(row.updatedAt);
  const source = SOURCES.includes(row.source as string) ? (row.source as LastLocationSnapshot['source']) : 'cache';
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return null;
  if (lat != null && lng != null && !validLatLng(lat, lng)) return null;
  const territory = parseTerritory(row.territory);
  if (lat == null && lng == null && !locality && !territory) return null;
  return { lat, lng, locality, territory, updatedAt, source };
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
