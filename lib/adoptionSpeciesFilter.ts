// ============================================================
// Filtro de especie del muro de Adopciones.
// ============================================================
// No reescribe filas. La especie estructurada ya viene en `species`.
// Un flyer no tiene especie cargada por quien publica: el valor `otro`
// que guarda el Worker es un relleno, no una clasificación. Esos avisos
// se ven en «Todos» y no entran en Perros, Gatos ni Otros.
// ============================================================

export type AdoptionSpeciesFilter = 'all' | 'perro' | 'gato' | 'otro';

export const ADOPTION_SPECIES_FILTERS: readonly { id: AdoptionSpeciesFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'perro', label: 'Perros' },
  { id: 'gato', label: 'Gatos' },
  { id: 'otro', label: 'Otros' },
];

export type AdoptionSpeciesGroup = 'perro' | 'gato' | 'otro' | 'unknown';

export function adoptionSpeciesGroup(alert: {
  species?: string | null;
  mediaKind?: 'photo' | 'flyer' | null;
}): AdoptionSpeciesGroup {
  if (alert.mediaKind === 'flyer') return 'unknown';
  const species = String(alert.species || '').trim().toLowerCase();
  if (!species) return 'unknown';
  if (species === 'perro') return 'perro';
  if (species === 'gato') return 'gato';
  return 'otro';
}

export function matchesAdoptionSpeciesFilter(
  alert: { species?: string | null; mediaKind?: 'photo' | 'flyer' | null },
  filter: AdoptionSpeciesFilter
): boolean {
  if (filter === 'all') return true;
  return adoptionSpeciesGroup(alert) === filter;
}
