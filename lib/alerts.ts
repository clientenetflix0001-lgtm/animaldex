// ============================================================
// Animaldex — Alertas (perdidos / avistados / encontrados / adopción)
// ============================================================

export type AlertType = 'lost' | 'sighting' | 'found' | 'adoption';
export type AlertStatus = 'active' | 'resolved';
export type AlertResolutionType = 'found' | 'reunited' | 'adopted';
export type AlertSex = 'macho' | 'hembra' | null;

export const ALERT_TYPE_IDS: AlertType[] = ['lost', 'sighting', 'found', 'adoption'];
export const ALERT_RENEW_MS = 7 * 24 * 60 * 60 * 1000;
export const ALERT_RESOLVED_NOT_RENEWABLE = 'Esta alerta ya está resuelta y no se puede renovar.';
export const ALERT_RESOLVE_OWNER_ERROR = 'Solo el autor puede resolver esta alerta.';
export const ALERT_RESOLVE_TYPE_ERROR = 'Ese resultado no corresponde a este tipo de alerta.';
export const ALERT_ALREADY_RESOLVED = 'Esta alerta ya está resuelta.';

export interface AlertTypeConfig {
  label: string;
  shortLabel: string;
  createLabel: string;
  emoji: string;
  color: string;
  contextVerb: string;
}

export const ALERT_TYPES: Record<AlertType, AlertTypeConfig> = {
  lost: {
    label: 'MASCOTA PERDIDA',
    shortLabel: 'Perdida',
    createLabel: 'Perdí a mi mascota',
    emoji: '🚨',
    color: '#E0483E',
    contextVerb: 'perdió',
  },
  sighting: {
    label: 'MASCOTA AVISTADA',
    shortLabel: 'Avistada',
    createLabel: 'Vi una mascota',
    emoji: '👀',
    color: '#D97706',
    contextVerb: 'vio',
  },
  found: {
    label: 'MASCOTA ENCONTRADA',
    shortLabel: 'Encontrada',
    createLabel: 'La encontré y está conmigo',
    emoji: '💚',
    color: '#2EA65A',
    contextVerb: 'encontró',
  },
  adoption: {
    label: 'EN ADOPCIÓN',
    shortLabel: 'Adopción',
    createLabel: 'En adopción',
    emoji: '💜',
    color: '#A94CF4',
    contextVerb: 'publicó',
  },
};

export interface AlertSpeciesOption {
  id: string;
  label: string;
  emoji: string;
}

export const ALERT_SPECIES: AlertSpeciesOption[] = [
  { id: 'perro', label: 'Perro', emoji: '🐶' },
  { id: 'gato', label: 'Gato', emoji: '🐱' },
  { id: 'conejo', label: 'Conejo', emoji: '🐰' },
  { id: 'loro', label: 'Ave', emoji: '🦜' },
  { id: 'hámster', label: 'Hámster', emoji: '🐹' },
  { id: 'otro', label: 'Otro', emoji: '🐾' },
];

export function speciesEmoji(species: string): string {
  return ALERT_SPECIES.find((s) => s.id === species)?.emoji ?? '🐾';
}

export function speciesLabel(species: string): string {
  return ALERT_SPECIES.find((s) => s.id === species)?.label ?? 'Animal';
}

export function parseAlertType(raw: unknown): AlertType | null {
  const t = String(raw || '').trim().toLowerCase();
  if (t === 'lost' || t === 'sighting' || t === 'found' || t === 'adoption') return t;
  return null;
}

export function parseAlertResolutionType(raw: unknown): AlertResolutionType | null {
  const t = String(raw || '').trim().toLowerCase();
  if (t === 'found' || t === 'reunited' || t === 'adopted') return t;
  if (t === 'resolved_found') return 'found';
  if (t === 'resolved_reunited') return 'reunited';
  if (t === 'resolved_adopted') return 'adopted';
  return null;
}

export function allowedResolutionForType(type: AlertType | string | null | undefined): AlertResolutionType | null {
  const t = parseAlertType(type);
  if (t === 'lost') return 'found';
  if (t === 'sighting' || t === 'found') return 'reunited';
  if (t === 'adoption') return 'adopted';
  return null;
}

export function isAlertResolved(alert: {
  status?: string | null;
  resolvedAt?: number | null;
  resolved_at?: number | null;
}): boolean {
  if (String(alert.status || '').toLowerCase() === 'resolved') return true;
  return !!(alert.resolvedAt || alert.resolved_at);
}

export function alertBumpedAt(alert: { createdAt?: number; renewedAt?: number | null; created_at?: number; renewed_at?: number | null }): number {
  return Number(alert.renewedAt || alert.renewed_at || alert.createdAt || alert.created_at || 0);
}

export function canRenewAlert(
  alert: { status?: string | null; resolvedAt?: number | null; createdAt?: number; renewedAt?: number | null },
  now: number = Date.now()
): boolean {
  if (isAlertResolved(alert)) return false;
  return now - alertBumpedAt(alert) >= ALERT_RENEW_MS;
}

export function adoptedPhrase(sex: string | null | undefined, opts?: { uppercase?: boolean }): string {
  const s = String(sex || '').trim().toLowerCase();
  const upper = !!opts?.uppercase;
  if (s === 'hembra') return upper ? 'YA FUE ADOPTADA' : 'Ya fue adoptada';
  if (s === 'macho') return upper ? 'YA FUE ADOPTADO' : 'Ya fue adoptado';
  return upper ? 'YA FUE ADOPTADO/A' : 'Ya fue adoptado/a';
}

export function alertResolveActionLabel(type: AlertType | string | null | undefined, sex?: string | null): string {
  const t = parseAlertType(type);
  if (t === 'lost') return 'Ya apareció';
  if (t === 'sighting' || t === 'found') return 'Encontró a su familia';
  if (t === 'adoption') return adoptedPhrase(sex);
  return 'Marcar como resuelta';
}

export function alertResolvedHeadline(alert: {
  type?: string | null;
  petName?: string | null;
  pet_name?: string | null;
  sex?: string | null;
  resolutionType?: string | null;
  resolution_type?: string | null;
}): string {
  const t = parseAlertType(alert.type) || 'lost';
  const name = String(alert.petName || alert.pet_name || '').trim();
  if (t === 'lost') {
    return name ? `✅ ${name.toUpperCase()} YA APARECIÓ` : '✅ YA APARECIÓ';
  }
  if (t === 'sighting' || t === 'found') {
    return '💚 ENCONTRÓ A SU FAMILIA';
  }
  const phrase = adoptedPhrase(alert.sex, { uppercase: true });
  return name ? `💜 ${name.toUpperCase()} ${phrase}` : `💜 ${phrase}`;
}

export function alertActiveHeadline(type: AlertType | string | null | undefined, species?: string): string {
  const t = parseAlertType(type) || 'lost';
  const cfg = ALERT_TYPES[t];
  return `${cfg.emoji} ${cfg.label}`;
}

export function alertHeadline(type: AlertType, species: string): string {
  return alertActiveHeadline(type, species);
}

export function alertBadgeText(alert: {
  type?: string | null;
  status?: string | null;
  resolvedAt?: number | null;
  petName?: string | null;
  pet_name?: string | null;
  sex?: string | null;
  species?: string | null;
}): string {
  if (isAlertResolved(alert)) return alertResolvedHeadline(alert);
  return alertActiveHeadline(alert.type, alert.species || '');
}

export function alertBadgeColor(alert: { type?: string | null; status?: string | null; resolvedAt?: number | null }): string {
  if (isAlertResolved(alert)) {
    const t = parseAlertType(alert.type);
    if (t === 'adoption') return '#A94CF4';
    if (t === 'lost') return '#2EA65A';
    return '#059669';
  }
  const t = parseAlertType(alert.type) || 'lost';
  return ALERT_TYPES[t].color;
}

export function alertContextLine(alert: {
  type?: string | null;
  username?: string | null;
  petName?: string | null;
  pet_name?: string | null;
  species?: string | null;
}): string {
  const user = String(alert.username || 'alguien').replace(/^@/, '');
  const name = String(alert.petName || alert.pet_name || '').trim();
  const species = speciesLabel(alert.species || '').toLowerCase();
  const t = parseAlertType(alert.type) || 'lost';
  if (t === 'lost') return name ? `${user} perdió a ${name}` : `${user} perdió una mascota`;
  if (t === 'sighting') return `${user} vio un ${species}`;
  if (t === 'found') return `${user} encontró un ${species}`;
  if (t === 'adoption') return name ? `${user} publicó a ${name} en adopción` : `${user} publicó una mascota en adopción`;
  return user;
}

export function alertResolveConfirm(alert: {
  type?: string | null;
  petName?: string | null;
  pet_name?: string | null;
  sex?: string | null;
}): { title: string; message: string; confirmLabel: string } {
  const t = parseAlertType(alert.type) || 'lost';
  const name = String(alert.petName || alert.pet_name || '').trim();
  const message = 'Esta alerta se marcará como resuelta y dejará de renovarse.';
  if (t === 'lost') {
    return {
      title: name ? `¿${name} ya apareció?` : '¿Ya apareció?',
      message,
      confirmLabel: 'Sí, ya apareció',
    };
  }
  if (t === 'sighting' || t === 'found') {
    return {
      title: '¿La mascota encontró a su familia?',
      message,
      confirmLabel: 'Sí, encontró a su familia',
    };
  }
  const adopted = adoptedPhrase(alert.sex);
  return {
    title: name ? `¿${name} ${adopted.toLowerCase()}?` : `¿${adopted}?`,
    message,
    confirmLabel: `Sí, ${adopted.toLowerCase()}`,
  };
}

/** Copy futuro de notificación. No se dispara push todavía. */
export function alertResolvedGoodNews(alert: { type?: string | null; petName?: string | null; pet_name?: string | null }): string {
  const t = parseAlertType(alert.type) || 'lost';
  const name = String(alert.petName || alert.pet_name || '').trim();
  if (t === 'lost') return name ? `¡Qué buena noticia! ${name} ya apareció.` : '¡Qué buena noticia! Ya apareció.';
  if (t === 'adoption') return name ? `¡Qué buena noticia! ${name} ya tiene familia.` : '¡Qué buena noticia! Ya fue adoptada.';
  return '¡Qué buena noticia! Encontró a su familia.';
}

export function alertShareMeta(alert: {
  type?: string | null;
  status?: string | null;
  resolvedAt?: number | null;
  petName?: string | null;
  pet_name?: string | null;
  sex?: string | null;
  username?: string | null;
  locality?: string | null;
  description?: string | null;
}): { title: string; description: string } {
  const name = String(alert.petName || alert.pet_name || '').trim();
  const user = String(alert.username || 'alguien').replace(/^@/, '');
  const t = parseAlertType(alert.type) || 'lost';
  const loc = String(alert.locality || '').trim();
  if (isAlertResolved(alert)) {
    if (t === 'lost') {
      return {
        title: name ? `✅ ${name} ya apareció` : '✅ Ya apareció',
        description: `La alerta de ${user} fue resuelta.${name ? ` ${name} volvió a casa.` : ''}`,
      };
    }
    if (t === 'adoption') {
      const phrase = adoptedPhrase(alert.sex).toLowerCase();
      return {
        title: name ? `💜 ${name} ${phrase}` : `💜 ${adoptedPhrase(alert.sex)}`,
        description: `Esta publicación de adopción de ${user} ya fue resuelta.`,
      };
    }
    return {
      title: '💚 Esta mascota encontró a su familia',
      description: `La alerta publicada por ${user} fue resuelta.`,
    };
  }
  if (t === 'lost') {
    return {
      title: name ? `🚨 Ayudá a encontrar a ${name}` : '🚨 Ayudá a encontrar a esta mascota',
      description: `${alert.description || ''} · 📍 ${loc}`.trim(),
    };
  }
  if (t === 'sighting') {
    return {
      title: loc ? `👀 Mascota avistada en ${loc}` : '👀 Mascota avistada',
      description: `${alert.description || ''} · 📍 ${loc}`.trim(),
    };
  }
  if (t === 'found') {
    return {
      title: loc ? `💚 Mascota encontrada en ${loc}` : '💚 Mascota encontrada',
      description: `${alert.description || ''} · 📍 ${loc}`.trim(),
    };
  }
  return {
    title: name ? `💜 ${name} está en adopción` : '💜 Mascota en adopción',
    description: `${alert.description || ''} · 📍 ${loc}`.trim(),
  };
}

// ---------- Fecha del hecho (sin date-picker nativo: texto DD/MM/AAAA) ----------

export function todayDateString(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function yesterdayDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export function isValidDateString(s: string): boolean {
  const m = s.match(DATE_RE);
  if (!m) return false;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const now = new Date();
  const candidate = new Date(year, month - 1, day);
  return candidate.getTime() <= now.getTime() + 24 * 60 * 60 * 1000; // no fechas futuras
}

export function dateStringToTimestamp(s: string): number | null {
  const m = s.match(DATE_RE);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(year, month - 1, day, 12, 0, 0);
  return d.getTime();
}

export function timestampToDateString(ts: number): string {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}
