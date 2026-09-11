// ============================================================
// Normalización de texto geográfico.
// ============================================================
// Determinista y sin dependencia de locale. NO usar LOWER() de SQLite para
// esto: su minusculización es solo ASCII, así que LOWER('ORÁN') devuelve
// 'orÁn' y "Oran" nunca alcanza a "Orán".
// ============================================================

/**
 * Normaliza texto para comparar e indexar: sin diacríticos, en minúsculas, sin
 * signos, con espacios colapsados y recortados.
 *
 * normalizeGeoText('  SAN   RAMÓN de la Nueva Orán ') === 'san ramon de la nueva oran'
 */
export function normalizeGeoText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Tokens normalizados, útiles para coincidencias por palabra y por prefijo. */
export function geoTokens(value: unknown): string[] {
  const normalized = normalizeGeoText(value);
  return normalized ? normalized.split(' ') : [];
}

/** true si `needle` aparece como palabra completa dentro de `haystack`. */
export function containsWord(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  const words = needle.split(' ');
  const tokens = haystack.split(' ');
  for (let i = 0; i + words.length <= tokens.length; i += 1) {
    let hit = true;
    for (let j = 0; j < words.length; j += 1) {
      if (tokens[i + j] !== words[j]) { hit = false; break; }
    }
    if (hit) return true;
  }
  return false;
}

/** true si cada palabra de `needle` es prefijo de una palabra de `haystack`, en orden. */
export function matchesTokenPrefix(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  const words = needle.split(' ');
  const tokens = haystack.split(' ');
  let cursor = 0;
  for (const word of words) {
    let found = -1;
    for (let i = cursor; i < tokens.length; i += 1) {
      if (tokens[i].startsWith(word)) { found = i; break; }
    }
    if (found === -1) return false;
    cursor = found + 1;
  }
  return true;
}

const EARTH_RADIUS_KM = 6371;
const DEG = Math.PI / 180;

/** Distancia sobre la esfera, en km. Misma fórmula que lib/feedGeo. */
export function geoDistanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = (bLat - aLat) * DEG;
  const dLng = (bLng - aLng) * DEG;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isFiniteCoord(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function validGeoPoint(lat: unknown, lng: unknown): boolean {
  return isFiniteCoord(lat) && isFiniteCoord(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
