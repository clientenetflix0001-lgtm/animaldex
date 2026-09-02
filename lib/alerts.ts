// ============================================================
// Animaldex — Alertas (perdidos / avistados / encontrados / adopción)
// ============================================================

export type AlertType = 'lost' | 'sighting' | 'found' | 'adoption';
export type AlertStatus = 'active' | 'resolved';
export type AlertResolutionType = 'found' | 'reunited' | 'adopted';
export type AlertSex = 'macho' | 'hembra' | null;

export const ALERT_TYPE_IDS: AlertType[] = ['lost', 'sighting', 'found', 'adoption'];
export const ALERT_RENEW_MS = 7 * 24 * 60 * 60 * 1000;
export const ALERT_RENEW_DAY_MS = 24 * 60 * 60 * 1000;

export type AlertCreatePrimaryId = 'lost' | 'seen-or-found' | 'adoption';

export const ALERT_CREATE_PRIMARY: Array<{
  id: AlertCreatePrimaryId;
  type: AlertType | null;
  label: string;
  emoji: string;
  color: string;
}> = [
  { id: 'lost', type: 'lost', label: 'Perdí a mi mascota', emoji: '🔴', color: '#E0483E' },
  { id: 'seen-or-found', type: null, label: 'Vi o encontré una mascota', emoji: '🟢', color: '#2EA65A' },
  { id: 'adoption', type: 'adoption', label: 'Dar una mascota en adopción', emoji: '💜', color: '#A94CF4' },
];

export const ALERT_SIGHTING_SUBCHOICES: Array<{ type: 'sighting' | 'found'; label: string }> = [
  { type: 'sighting', label: 'La vi' },
  { type: 'found', label: 'La encontré y está conmigo' },
];

export function alertTypeFromCreatePrimary(
  primary: AlertCreatePrimaryId,
  seenKind: 'sighting' | 'found' | null
): AlertType | null {
  if (primary === 'lost') return 'lost';
  if (primary === 'adoption') return 'adoption';
  if (primary === 'seen-or-found') return seenKind;
  return null;
}
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
    color: '#2EA65A',
    contextVerb: 'vio',
  },
  found: {
    label: 'MASCOTA ENCONTRADA',
    shortLabel: 'Encontrada',
    createLabel: 'La encontré y está conmigo',
    emoji: '🟢',
    color: '#2EA65A',
    contextVerb: 'encontró',
  },
  adoption: {
    label: 'EN ADOPCIÓN',
    shortLabel: 'Adopción',
    createLabel: 'Dar una mascota en adopción',
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

export function alertSpeciesNoun(species: string | null | undefined): string {
  const id = String(species || '').trim().toLowerCase();
  if (id === 'perro') return 'perro';
  if (id === 'gato') return 'gato';
  if (id === 'conejo') return 'conejo';
  if (id === 'loro') return 'ave';
  if (id === 'hámster' || id === 'hamster') return 'hámster';
  return 'mascota';
}

export function alertSpeciesArticle(species: string | null | undefined): 'un' | 'una' {
  const noun = alertSpeciesNoun(species);
  if (noun === 'mascota' || noun === 'ave') return 'una';
  return 'un';
}

export function alertSpeciesIndefinite(species: string | null | undefined): string {
  return `${alertSpeciesArticle(species)} ${alertSpeciesNoun(species)}`;
}

export function alertSpeciesPossessive(species: string | null | undefined): string {
  return `su ${alertSpeciesNoun(species)}`;
}

export function displayAlertUsername(username: string | null | undefined): string {
  return String(username || 'alguien').replace(/^@/, '');
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

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function alertRenewalDueAt(alert: { createdAt?: number; renewedAt?: number | null; created_at?: number; renewed_at?: number | null }): number {
  return alertBumpedAt(alert) + ALERT_RENEW_MS;
}

export function alertRenewalUi(
  alert: { status?: string | null; resolvedAt?: number | null; createdAt?: number; renewedAt?: number | null },
  now: number = Date.now()
): { canRenew: boolean; label: string } {
  if (isAlertResolved(alert)) return { canRenew: false, label: '' };
  const due = alertRenewalDueAt(alert);
  if (now >= due) return { canRenew: true, label: 'Renovar publicación' };
  const days = Math.max(1, Math.ceil((due - now) / ALERT_RENEW_DAY_MS));
  if (days <= 2) {
    const d = new Date(due);
    return { canRenew: false, label: `Podés renovar el ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}` };
  }
  return { canRenew: false, label: `Renovable en ${days} días` };
}

export function alertNeedsRenewalNotice(
  alert: {
    status?: string | null;
    resolvedAt?: number | null;
    resolved_at?: number | null;
    createdAt?: number;
    created_at?: number;
    renewedAt?: number | null;
    renewed_at?: number | null;
    renewalNotifiedAt?: number | null;
    renewal_notified_at?: number | null;
  },
  now: number = Date.now()
): boolean {
  if (isAlertResolved(alert)) return false;
  const bump = alertBumpedAt(alert);
  if (!bump || now < bump + ALERT_RENEW_MS) return false;
  const notified = Number(alert.renewalNotifiedAt || alert.renewal_notified_at || 0);
  if (notified && notified >= bump) return false;
  return true;
}

export function alertRenewalPushCopy(alert: {
  type?: string | null;
  petName?: string | null;
  pet_name?: string | null;
}): { title: string; body: string } {
  const t = parseAlertType(alert.type) || 'lost';
  const name = String(alert.petName || alert.pet_name || '').trim();
  const title = '🚨 Tu alerta puede renovarse';
  if (t === 'adoption') {
    return {
      title,
      body: name ? `Ya podés renovar la publicación de ${name}.` : 'Ya podés renovar tu publicación de adopción.',
    };
  }
  if (t === 'lost') {
    return {
      title,
      body: name
        ? `Ya podés renovar la alerta de ${name} para volver a darle visibilidad.`
        : 'Ya podés renovar tu alerta para volver a darle visibilidad.',
    };
  }
  return {
    title,
    body: 'Ya podés renovar tu alerta para volver a darle visibilidad.',
  };
}

export function alertRenewalPushType(type: AlertType | string | null | undefined): 'lost_pet' | 'adoption' {
  return parseAlertType(type) === 'adoption' ? 'adoption' : 'lost_pet';
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
  const user = displayAlertUsername(alert.username);
  const name = String(alert.petName || alert.pet_name || '').trim();
  const t = parseAlertType(alert.type) || 'lost';
  if (t === 'lost') return name ? `${user} perdió a ${name}` : `${user} perdió a ${alertSpeciesPossessive(alert.species)}`;
  if (t === 'sighting') return `${user} vio ${alertSpeciesIndefinite(alert.species)}`;
  if (t === 'found') return `${user} encontró ${alertSpeciesIndefinite(alert.species)}`;
  if (t === 'adoption') return name ? `${user} publicó a ${name} en adopción` : `${user} publicó una mascota en adopción`;
  return user;
}

export function alertFoundSafeNote(alert: {
  type?: string | null;
  status?: string | null;
  resolvedAt?: number | null;
  resolved_at?: number | null;
}): string | null {
  if (parseAlertType(alert.type) !== 'found') return null;
  if (isAlertResolved(alert)) return null;
  return 'Está resguardado';
}

export function myAlertPrimaryLabel(alert: {
  type?: string | null;
  status?: string | null;
  resolvedAt?: number | null;
  petName?: string | null;
  pet_name?: string | null;
  sex?: string | null;
}): string {
  if (isAlertResolved(alert)) return alertResolvedHeadline(alert);
  const t = parseAlertType(alert.type) || 'lost';
  const cfg = ALERT_TYPES[t];
  return `${cfg.emoji} ${cfg.createLabel}`;
}

export function myAlertSecondaryLine(alert: {
  petName?: string | null;
  pet_name?: string | null;
  species?: string | null;
}): string {
  const name = String(alert.petName || alert.pet_name || '').trim();
  const spec = speciesLabel(alert.species || '');
  return name ? `${name} · ${spec}` : spec;
}

export function alertListTime(ts: number, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - ts) / 60000));
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'hace 1 día';
  if (days < 7) return `hace ${days} días`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return 'hace 1 semana';
  if (weeks < 5) return `hace ${weeks} semanas`;
  return timestampToDateString(ts);
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
  resolved_at?: number | null;
  petName?: string | null;
  pet_name?: string | null;
  sex?: string | null;
  username?: string | null;
  locality?: string | null;
  species?: string | null;
  description?: string | null;
}): { title: string; description: string; shareText: string } {
  const name = String(alert.petName || alert.pet_name || '').trim();
  const user = displayAlertUsername(alert.username);
  const t = parseAlertType(alert.type) || 'lost';
  const loc = String(alert.locality || '').trim();
  const inLoc = loc ? ` en ${loc}` : '';
  const noun = alertSpeciesNoun(alert.species);
  const indef = alertSpeciesIndefinite(alert.species);
  const possessive = alertSpeciesPossessive(alert.species);
  if (isAlertResolved(alert)) {
    if (t === 'lost') {
      const title = name ? `✅ ${name} ya apareció` : '✅ Ya apareció';
      return {
        title,
        description: `La alerta de ${user} fue resuelta.${name ? ` ${name} volvió a casa.` : ''}`,
        shareText: title,
      };
    }
    if (t === 'adoption') {
      const phrase = adoptedPhrase(alert.sex).toLowerCase();
      const title = name ? `💜 ${name} ${phrase}` : `💜 ${adoptedPhrase(alert.sex)}`;
      return {
        title,
        description: `Esta publicación de adopción de ${user} ya fue resuelta.`,
        shareText: title,
      };
    }
    return {
      title: '💚 Esta mascota encontró a su familia',
      description: `La alerta publicada por ${user} fue resuelta.`,
      shareText: '💚 Esta mascota encontró a su familia',
    };
  }
  if (t === 'lost') {
    const title = name
      ? `🚨 Ayudá a ${user} a encontrar a ${name}`
      : `🚨 Ayudá a ${user} a encontrar a ${possessive}`;
    return {
      title,
      description: `Se perdió ${possessive}${inLoc}. Compartí esta publicación para ayudar a que vuelva a casa.`,
      shareText: title,
    };
  }
  if (t === 'sighting') {
    const title = `👀 ${user} vio ${indef}${inLoc}`;
    return {
      title,
      description: '¿Lo reconocés? Ayudanos a encontrar a su familia compartiendo esta publicación.',
      shareText: title,
    };
  }
  if (t === 'found') {
    const title = `🟢 ${user} encontró ${indef}${inLoc}`;
    return {
      title,
      description: 'El animal está resguardado. Compartí esta publicación para ayudar a encontrar a su familia.',
      shareText: title,
    };
  }
  if (name) {
    const title = `💜 ${name} está buscando una familia`;
    return {
      title,
      description: `${user} publicó a ${name} en adopción${inLoc}. Conocé su historia y ayudala/o a encontrar una familia.`,
      shareText: title,
    };
  }
  const title = `💜 ${user} publicó una mascota en adopción`;
  return {
    title,
    description: `${user} publicó una mascota en adopción${inLoc}. Conocé su historia y ayudala/o a encontrar una familia.`,
    shareText: title,
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
