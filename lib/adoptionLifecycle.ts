// ============================================================
// Animaldex Adopciones web — vigencia, pausa y enlace privado.
// ============================================================
// Puro: lo comparten el Worker y la app web.
//
// Solo aplica a alertas de adopción creadas desde la sección web
// (`expires_at` con valor). Las alertas existentes tienen `expires_at` NULL
// y conservan su comportamiento actual.
// ============================================================

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Ciclo de una publicación de un usuario registrado. */
export const ADOPTION_CYCLE_MS = 7 * DAY_MS;

/** Vigencia total de una publicación sin cuenta. No se renueva. */
export const GUEST_ADOPTION_TTL_MS = 7 * DAY_MS;

/** Denuncias de usuarios distintos que ocultan una publicación del muro. */
export const ADOPTION_REPORT_HIDE_THRESHOLD = 3;

/**
 * Publicaciones sin cuenta por red (hash de IP) en 24 h. Valor por defecto;
 * el Worker lo toma de la variable GUEST_POSTS_PER_IP_PER_DAY si existe.
 */
export const GUEST_POSTS_PER_IP_PER_DAY = 3;

/** Tope global por hora. Variable del Worker: GUEST_POSTS_GLOBAL_PER_HOUR. */
export const GUEST_POSTS_GLOBAL_PER_HOUR = 60;

/** Tiempo que se conserva el registro de límites (más que la ventana de 24 h). */
export const GUEST_RATE_RETENTION_MS = 2 * DAY_MS;

/**
 * Publicaciones vencidas borradas por lote. Variable: GUEST_CLEANUP_BATCH_SIZE.
 * Con un lote cada 5 minutos son 2880 por día, más que el tope global
 * por defecto (60 × 24 = 1440).
 */
export const GUEST_CLEANUP_BATCH_SIZE = 10;

/** Acción que el widget declara y el Worker exige en siteverify. */
export const TURNSTILE_ACTION = 'adoption_publish';

/** Hostnames aceptados si no se define TURNSTILE_ALLOWED_HOSTNAMES. */
export const DEFAULT_TURNSTILE_HOSTNAMES: readonly string[] = [
  'animaldex.com',
  'www.animaldex.com',
  'animaldex-web.pages.dev',
];

export type AdoptionMediaKind = 'photo' | 'flyer';

export function parseAdoptionMediaKind(raw: unknown): AdoptionMediaKind | null {
  return raw === 'photo' || raw === 'flyer' ? raw : null;
}

export type AdoptionPostState = 'active' | 'paused' | 'expired' | 'resolved';

export type AdoptionLifecycleFields = {
  status?: string | null;
  resolvedAt?: number | null;
  expiresAt?: number | null;
  pausedAt?: number | null;
  isGuest?: boolean | null;
};

export function adoptionPostState(a: AdoptionLifecycleFields, now: number): AdoptionPostState {
  if (a.resolvedAt || (a.status && a.status !== 'active')) return 'resolved';
  if (a.expiresAt != null && a.expiresAt <= now) return 'expired';
  if (a.pausedAt != null) return 'paused';
  return 'active';
}

export function adoptionRemainingMs(a: AdoptionLifecycleFields, now: number): number | null {
  if (a.expiresAt == null) return null;
  return Math.max(0, a.expiresAt - now);
}

/** "Quedan 3 días" / "Queda 1 día" / "Quedan 5 h" / "Vencida". */
export function adoptionRemainingLabel(a: AdoptionLifecycleFields, now: number): string {
  const ms = adoptionRemainingMs(a, now);
  if (ms == null) return 'Sin vencimiento';
  if (ms <= 0) return 'Vencida';
  const days = Math.floor(ms / DAY_MS);
  if (days >= 1) return days === 1 ? 'Queda 1 día' : `Quedan ${days} días`;
  const hours = Math.max(1, Math.floor(ms / (60 * 60 * 1000)));
  return hours === 1 ? 'Queda 1 hora' : `Quedan ${hours} horas`;
}

export function adoptionStateLabel(state: AdoptionPostState): string {
  if (state === 'active') return 'Activa';
  if (state === 'paused') return 'Pausada';
  if (state === 'expired') return 'Vencida';
  return 'Finalizada';
}

/** Un usuario registrado renueva cuando terminó el ciclo (igual que Mercado). */
export function canRenewAdoptionPost(a: AdoptionLifecycleFields, now: number): boolean {
  if (a.isGuest) return false;
  if (a.expiresAt == null) return false;
  const state = adoptionPostState(a, now);
  return state === 'expired';
}

export function canResumeAdoptionPost(a: AdoptionLifecycleFields, now: number): boolean {
  return !a.isGuest && adoptionPostState(a, now) === 'paused';
}

export function canPauseAdoptionPost(a: AdoptionLifecycleFields, now: number): boolean {
  return !a.isGuest && adoptionPostState(a, now) === 'active';
}

// ---------- Enlace privado de gestión (publicaciones sin cuenta) ----------
// El enlace es `/adopciones/<slug>/gestionar#<alertId>.<token>`. El fragmento
// no viaja en peticiones HTTP, no queda en logs del servidor ni en Referer.

const ALERT_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;

export function buildManageFragment(alertId: string, token: string): string {
  return `${alertId}.${token}`;
}

export function parseManageFragment(raw: unknown): { alertId: string; token: string } | null {
  const s = String(raw || '').replace(/^#/, '').trim();
  const dot = s.indexOf('.');
  if (dot <= 0) return null;
  const alertId = s.slice(0, dot);
  const token = s.slice(dot + 1);
  if (!ALERT_ID_RE.test(alertId) || !TOKEN_RE.test(token)) return null;
  return { alertId, token };
}
