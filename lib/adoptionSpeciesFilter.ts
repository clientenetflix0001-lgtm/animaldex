// ============================================================
// Filtro de especie del muro de Adopciones.
// ============================================================
// La especie estructurada vive en `species`. Un flyer viejo tiene
// `otro` como relleno del Worker, sin que nadie haya elegido especie:
// se ve en «Todos» y no entra en Perros, Gatos ni Otros.
//
// Un flyer nuevo guarda la especie elegida y, en `description`, esta
// marca invisible. No hace falta otra columna. Las fotos no la usan.
// ============================================================

export type AdoptionSpeciesFilter = 'all' | 'perro' | 'gato' | 'otro';

export const ADOPTION_SPECIES_FILTERS: readonly { id: AdoptionSpeciesFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'perro', label: 'Perros' },
  { id: 'gato', label: 'Gatos' },
  { id: 'otro', label: 'Otros' },
];

/** Marca de especie confirmada en un flyer. Invisible y fuera de `species`. */
export const ADOPTION_FLYER_SPECIES_MARK = '\u2060';

export type AdoptionSpeciesGroup = 'perro' | 'gato' | 'otro' | 'unknown';

export function adoptionFlyerSpeciesConfirmed(alert: {
  mediaKind?: 'photo' | 'flyer' | null;
  description?: string | null;
}): boolean {
  return alert.mediaKind === 'flyer' && String(alert.description || '').startsWith(ADOPTION_FLYER_SPECIES_MARK);
}

export function adoptionVisibleDescription(value?: string | null): string {
  return String(value || '').replace(/^\u2060+/, '');
}

export function adoptionSpeciesGroup(alert: {
  species?: string | null;
  mediaKind?: 'photo' | 'flyer' | null;
  description?: string | null;
}): AdoptionSpeciesGroup {
  if (alert.mediaKind === 'flyer' && !adoptionFlyerSpeciesConfirmed(alert)) return 'unknown';
  const species = String(alert.species || '').trim().toLowerCase();
  if (!species) return 'unknown';
  if (species === 'perro') return 'perro';
  if (species === 'gato') return 'gato';
  return 'otro';
}

export function matchesAdoptionSpeciesFilter(
  alert: { species?: string | null; mediaKind?: 'photo' | 'flyer' | null; description?: string | null },
  filter: AdoptionSpeciesFilter
): boolean {
  if (filter === 'all') return true;
  return adoptionSpeciesGroup(alert) === filter;
}
