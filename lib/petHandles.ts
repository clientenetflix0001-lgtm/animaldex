import { isReservedPublicUsername, USERNAME_RE, normalizePublicUsername } from './publicHandles.ts';

/** Sufijo reservado exclusivamente para mascotas. */
export const PET_SUFFIX = '.pet';

/** Base editable: 3–16 para que `base + ".pet"` quede en 7–20 (USERNAME_RE). */
export const PET_BASE_MIN = 3;
export const PET_BASE_MAX = 16;

export const PET_TAKEN_ERROR = 'Este usuario ya está en uso. Elegí otro.';
export const PET_SUFFIX_RESERVED_ERROR = 'El sufijo .pet está reservado para mascotas';
export const PET_USERNAME_INVALID_ERROR =
  'El usuario de la mascota debe ser nombre.pet (3-16 letras o números en la parte editable)';
export const PET_USERNAME_IMMUTABLE_ERROR = 'El usuario de una mascota no se puede cambiar.';

/** Primeros segmentos de rutas públicas: `p.pet`, `pet.pet`, `a.pet`, `m.pet`, `r.pet`. */
const PET_ROUTE_BASES = new Set(['p', 'pet', 'a', 'm', 'r']);

export function hasPetSuffix(value: string): boolean {
  return normalizePublicUsername(value).endsWith(PET_SUFFIX);
}

export function stripPetSuffix(value: string): string {
  const s = normalizePublicUsername(value);
  return hasPetSuffix(s) ? s.slice(0, -PET_SUFFIX.length) : s;
}

/**
 * Normaliza la parte editable. Reutiliza la convención actual de AddPet
 * (NFD, minúsculas, espacios → `_`) y además quita puntos residuales
 * para que pegar `luna.pet` no produzca `luna.pet.pet`.
 */
export function normalizePetUsernameBase(raw: string): string {
  let s = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^@+/, '');
  s = stripPetSuffix(s);
  s = s.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  return s.slice(0, PET_BASE_MAX);
}

export function suggestPetUsernameBase(name: string): string {
  const base = normalizePetUsernameBase(name);
  if (base.length >= PET_BASE_MIN) return base;
  return (base + 'pet').slice(0, PET_BASE_MAX);
}

export function isReservedPetUsernameBase(base: string): boolean {
  const b = normalizePetUsernameBase(base);
  if (!b) return true;
  if (PET_ROUTE_BASES.has(b)) return true;
  if (isReservedPublicUsername(b)) return true;
  if (isReservedPublicUsername(b + PET_SUFFIX)) return true;
  return false;
}

export function isValidPetUsernameBase(base: string): boolean {
  if (!/^[a-z0-9_]{3,16}$/.test(base)) return false;
  if (isReservedPetUsernameBase(base)) return false;
  return true;
}

export function buildPetUsername(base: string): string {
  return `${normalizePetUsernameBase(base)}${PET_SUFFIX}`;
}

export function isValidPetUsername(value: string): boolean {
  const s = normalizePublicUsername(value);
  if (!s.endsWith(PET_SUFFIX)) return false;
  if (!USERNAME_RE.test(s)) return false;
  if (s.slice(0, -PET_SUFFIX.length).includes('.')) return false;
  return isValidPetUsernameBase(stripPetSuffix(s));
}

/** El cliente/servidor solo aceptan un handle que ya termina en `.pet`. */
export function parsePetUsernameInput(raw: string): string | null {
  const s = normalizePublicUsername(raw);
  if (!hasPetSuffix(s)) return null;
  const built = buildPetUsername(stripPetSuffix(s));
  return isValidPetUsername(built) ? built : null;
}

function stemWithNumericSuffix(base: string, n: number): string {
  if (n <= 1) return base;
  const suffix = String(n);
  const maxStem = PET_BASE_MAX - suffix.length;
  const stem = base.length <= maxStem ? base : base.slice(0, Math.max(PET_BASE_MIN, maxStem));
  return `${stem}${suffix}`.slice(0, PET_BASE_MAX);
}

export function petUsernameCandidates(base: string, limit = 40): string[] {
  const normalized = normalizePetUsernameBase(base);
  const stem0 = normalized.length >= PET_BASE_MIN ? normalized : (normalized + 'pet').slice(0, PET_BASE_MAX);
  const out: string[] = [];
  const tryAdd = (stem: string) => {
    const full = `${stem}${PET_SUFFIX}`;
    if (isValidPetUsername(full) && !out.includes(full)) out.push(full);
  };
  tryAdd(stem0);
  for (let i = 2; out.length < limit && i < 220; i++) {
    tryAdd(stemWithNumericSuffix(stem0, i));
  }
  return out;
}

export function firstFreePetUsername(base: string, occupied: Iterable<string>): string | null {
  const taken = new Set([...occupied].map((u) => String(u || '').toLowerCase()));
  for (const candidate of petUsernameCandidates(base, 80)) {
    if (!taken.has(candidate)) return candidate;
  }
  return null;
}

export function allocateNextPetUsername(base: string, occupied: Iterable<string>): string | null {
  return firstFreePetUsername(base, occupied);
}

/** Parte editable mostrada en el input. Pega `luna.pet` → `luna`. */
export function applyEditablePetBase(raw: string): string {
  return normalizePetUsernameBase(raw);
}

/**
 * Evita que una respuesta vieja (Lu) pise la sugerencia actual (Luna).
 * Solo reescribe la base cuando el usuario no tocó el @ a mano.
 */
export function applySuggestionIfCurrent(opts: {
  requestId: number;
  latestId: number;
  userTouched: boolean;
  suggestion?: string | null;
  available: boolean;
}): string | null {
  if (opts.requestId !== opts.latestId) return null;
  if (opts.userTouched) return null;
  if (opts.available) return null;
  if (!opts.suggestion || !isValidPetUsername(opts.suggestion)) return null;
  return stripPetSuffix(opts.suggestion);
}

export function petCanonicalPath(handleOrId: string): string {
  const h = normalizePublicUsername(handleOrId);
  if (isValidPetUsername(h)) return `/${h}`;
  return `/pet/${encodeURIComponent(String(handleOrId || '').replace(/^@/, ''))}`;
}

export type PetUsernameUpdateResult =
  | { ok: true; username: string }
  | { ok: false; error: string; status: 409 };

/**
 * Username de mascota existente: omitido o igual → se conserva.
 * Distinto → 409. No crea aliases. No escribe DB.
 */
export function resolvePetUsernameUpdate(
  currentUsername: string | null | undefined,
  requested: unknown
): PetUsernameUpdateResult {
  const current = String(currentUsername ?? '');
  if (requested == null || String(requested).trim() === '') {
    return { ok: true, username: current };
  }
  const raw = String(requested).trim();
  const next = parsePetUsernameInput(raw) || raw.toLowerCase();
  if (next !== current.toLowerCase()) {
    return { ok: false, error: PET_USERNAME_IMMUTABLE_ERROR, status: 409 };
  }
  return { ok: true, username: current };
}

export const PET_DELETE_TOMBSTONE_SQL =
  'INSERT OR IGNORE INTO pet_username_aliases (old_username, pet_id, new_username, created_at) VALUES (?, ?, ?, ?)';

function petHandleKey(raw: string): string {
  return normalizePublicUsername(raw);
}

/** Handles a reservar al borrar: username actual + aliases legacy del mismo pet. */
export function petDeleteReservedHandles(
  username: string | null | undefined,
  existingAliases: readonly string[] = []
): string[] {
  const out: string[] = [];
  const add = (raw: string) => {
    const s = petHandleKey(raw);
    if (s && !out.includes(s)) out.push(s);
  };
  add(String(username || ''));
  for (const a of existingAliases) add(a);
  return out;
}

export function petDeleteTombstoneRows(
  petId: string,
  username: string | null | undefined,
  existingAliases: readonly string[] = []
): Array<{ oldUsername: string; petId: string; newUsername: string }> {
  const canonical = petHandleKey(String(username || ''));
  return petDeleteReservedHandles(username, existingAliases).map((oldUsername) => ({
    oldUsername,
    petId,
    newUsername: canonical || oldUsername,
  }));
}

/** INSERT OR IGNORE: mismo pet o ausente → ok; otra mascota → no sobrescribir. */
export function canInsertPetHandleTombstone(
  existingPetId: string | null | undefined,
  petId: string
): boolean {
  if (!existingPetId) return true;
  return existingPetId === petId;
}

/**
 * Tras delete el tombstone reserva el handle, pero el lookup solo
 * resuelve si la fila de pets sigue existiendo.
 */
export function petHandleLookupAfterDelete(opts: {
  liveByUsername: { id: string } | null;
  aliasTargetPet: { id: string } | null;
}): { id: string } | null {
  if (opts.liveByUsername) return opts.liveByUsername;
  return opts.aliasTargetPet;
}

