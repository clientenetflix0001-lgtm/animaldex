export const PERSONAL_STATUSES = [
  { id: 'en_casa', label: 'En casa', emoji: '🏠' },
  { id: 'perdido', label: 'Perdido', emoji: '💔' },
] as const;

export const PROTECTOR_STATUSES = [
  { id: 'en_adopcion', label: 'En adopción' },
  { id: 'en_recuperacion', label: 'En recuperación' },
] as const;

export type PersonalCareStatus = (typeof PERSONAL_STATUSES)[number]['id'];
export type ProtectorCareStatus = (typeof PROTECTOR_STATUSES)[number]['id'];
export type PetCareStatus = PersonalCareStatus | ProtectorCareStatus;

export const PET_SIZES = [
  { id: 'pequeno', label: 'Pequeño' },
  { id: 'mediano', label: 'Mediano' },
  { id: 'grande', label: 'Grande' },
] as const;

export const FORM_SPECIES = [
  { id: 'perro', label: 'Perro', emoji: '🐶' },
  { id: 'gato', label: 'Gato', emoji: '🐱' },
  { id: 'otro', label: 'Otro', emoji: '🐾' },
] as const;

export function isProtectorStatus(status: string | null | undefined): status is ProtectorCareStatus {
  return status === 'en_adopcion' || status === 'en_recuperacion';
}

export function isPersonalStatus(status: string | null | undefined): status is PersonalCareStatus {
  return status === 'en_casa' || status === 'perdido';
}

export function allowedStatuses(isProtector: boolean): readonly string[] {
  return isProtector ? PROTECTOR_STATUSES.map((s) => s.id) : PERSONAL_STATUSES.map((s) => s.id);
}

export function defaultCareStatus(isProtector: boolean): PetCareStatus {
  return isProtector ? 'en_adopcion' : 'en_casa';
}

export function speciesGroup(species: string | null | undefined): 'perro' | 'gato' | 'otro' {
  if (species === 'perro') return 'perro';
  if (species === 'gato') return 'gato';
  return 'otro';
}

export function speciesLabel(species: string | null | undefined): string {
  if (species === 'perro') return 'Perro';
  if (species === 'gato') return 'Gato';
  if (species === 'otro') return 'Otro';
  if (species === 'conejo') return 'Conejo';
  if (species === 'loro') return 'Loro';
  if (species === 'hámster') return 'Hámster';
  return species || '';
}

export function sizeLabel(size: string | null | undefined): string {
  if (size === 'pequeno') return 'Pequeño';
  if (size === 'mediano') return 'Mediano';
  if (size === 'grande') return 'Grande';
  return '';
}

export function careStatusLabel(status: string | null | undefined): string {
  if (status === 'en_casa') return '🏠 En casa';
  if (status === 'perdido') return '💔 Perdido';
  if (status === 'en_adopcion') return 'En adopción';
  if (status === 'en_recuperacion') return 'En recuperación';
  return '';
}

export function waitingLabel(startedAt: number | null | undefined, now: number = Date.now()): string {
  if (!startedAt || startedAt > now) return '';
  const days = Math.floor((now - startedAt) / 86400000);
  if (days < 1) return 'Esperando desde hoy';
  if (days < 30) return days === 1 ? 'Esperando hace 1 día' : `Esperando hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? 'Esperando hace 1 mes' : `Esperando hace ${months} meses`;
  const years = Math.floor(days / 365);
  return years === 1 ? 'Esperando hace 1 año' : `Esperando hace ${years} años`;
}

export type StatusFilter = 'todas' | 'en_adopcion' | 'en_recuperacion';
export type SpeciesFilter = 'todos' | 'perro' | 'gato' | 'otro';

export function filterProtectorPets<T extends { careStatus?: string | null; species?: string | null }>(
  pets: T[],
  status: StatusFilter,
  species: SpeciesFilter
): T[] {
  return pets.filter((p) => {
    if (status === 'en_adopcion' && p.careStatus !== 'en_adopcion') return false;
    if (status === 'en_recuperacion' && p.careStatus !== 'en_recuperacion') return false;
    if (species !== 'todos' && speciesGroup(p.species) !== species) return false;
    return true;
  });
}
