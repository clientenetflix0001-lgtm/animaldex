/**
 * Protección mínima anti-spam de shareLocation (memoria del isolate).
 * El Worker replica estas constantes y el criterio. Sin tabla D1.
 */

export const SHARE_LOCATION_WINDOW_MS = 45 * 1000;
export const SHARE_LOCATION_MAX = 1;

export interface ShareLocationBucket {
  start: number;
  n: number;
}

/** true = limitado (rechazar). La primera llamada de una ventana no está limitada. */
export function shareLocationLimited(
  store: Map<string, ShareLocationBucket>,
  ip: string,
  petId: string,
  now: number
): boolean {
  const key = `${ip || 'unknown'}|${petId}`;
  const rec = store.get(key);
  if (!rec || now - rec.start >= SHARE_LOCATION_WINDOW_MS) {
    store.set(key, { start: now, n: 1 });
    return false;
  }
  if (rec.n >= SHARE_LOCATION_MAX) return true;
  rec.n += 1;
  return false;
}
