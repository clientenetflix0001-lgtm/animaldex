// ============================================================
// Animaldex — Alertas (animales perdidos / encontrados)
// ============================================================
// Constantes, tipos y helpers compartidos por las pantallas de
// Alertas. Estructura pensada para crecer sin romper nada:
// agregar un nuevo AlertType (ej. 'sighting', 'reunited') solo
// requiere sumar una entrada en ALERT_TYPES.

export type AlertType = 'lost' | 'found';
export type AlertStatus = 'active' | 'resolved';

export interface AlertTypeConfig {
  label: string;
  shortLabel: string;
  emoji: string;
  color: string;
}

export const ALERT_TYPES: Record<AlertType, AlertTypeConfig> = {
  lost: { label: 'PERDIDO', shortLabel: 'Perdido', emoji: '🚨', color: '#E0483E' },
  found: { label: 'ENCONTRADO', shortLabel: 'Encontrado', emoji: '🚨', color: '#2EA65A' },
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

// Título tipo "🚨 PERRO PERDIDO" para el encabezado de cada alerta.
export function alertHeadline(type: AlertType, species: string): string {
  const t = ALERT_TYPES[type] ?? ALERT_TYPES.lost;
  return `${t.emoji} ${speciesLabel(species).toUpperCase()} ${t.label}`;
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
