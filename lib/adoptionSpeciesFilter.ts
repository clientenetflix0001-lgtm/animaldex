// ============================================================
// Filtro de especie del muro de Adopciones.
// ============================================================
// La especie vive en `species`. Un flyer entra en Perros, Gatos u Otros
// solo si `speciesConfirmed` es true: quien publica eligió la especie y
// el Worker la guardó en `species_confirmed`.
//
// Los flyers anteriores tienen esa columna en NULL. Aunque `species`
// sea `otro` de relleno, se ven en Todos y no se clasifican solos.
// Las fotos y las alertas de la app no usan la marca: su species sigue
// igual.
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
  speciesConfirmed?: boolean | null;
}): AdoptionSpeciesGroup {
  if (alert.mediaKind === 'flyer' && alert.speciesConfirmed !== true) return 'unknown';
  const species = String(alert.species || '').trim().toLowerCase();
  if (!species) return 'unknown';
  if (species === 'perro') return 'perro';
  if (species === 'gato') return 'gato';
  return 'otro';
}

export function matchesAdoptionSpeciesFilter(
  alert: { species?: string | null; mediaKind?: 'photo' | 'flyer' | null; speciesConfirmed?: boolean | null },
  filter: AdoptionSpeciesFilter
): boolean {
  if (filter === 'all') return true;
  return adoptionSpeciesGroup(alert) === filter;
}
