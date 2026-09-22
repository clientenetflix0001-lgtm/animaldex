// Catálogo controlado de razas para alertas Perdido/Encontrado.
// El valor persistido es siempre breed_id. El texto libre solo busca.

export const BREED_UNKNOWN_ID = null;
export const BREED_UNKNOWN_OPTION_ID = 'unknown';

export type CatalogSpecies = 'dog' | 'cat' | 'other';

export type BreedCatalogEntry = {
  id: string;
  species: CatalogSpecies;
  label: string;
  pluralLabel: string;
  aliases: readonly string[];
};

/** 10 razas caninas iniciales. Ampliar este array no requiere migración. */
export const DOG_BREED_CATALOG: readonly BreedCatalogEntry[] = [
  {
    id: 'poodle',
    species: 'dog',
    label: 'Caniche',
    pluralLabel: 'Caniches',
    aliases: ['poodle', 'caniche', 'cani', 'caniches', 'toy poodle'],
  },
  {
    id: 'cocker_spaniel',
    species: 'dog',
    label: 'Cocker Spaniel',
    pluralLabel: 'Cocker Spaniel',
    aliases: ['cocker', 'cocker spaniel', 'spaniel'],
  },
  {
    id: 'labrador_retriever',
    species: 'dog',
    label: 'Labrador Retriever',
    pluralLabel: 'Labradores Retriever',
    aliases: ['labrador', 'labrador retriever', 'labr', 'labradorretriever'],
  },
  {
    id: 'dachshund',
    species: 'dog',
    label: 'Dachshund / Salchicha',
    pluralLabel: 'Dachshund / Salchicha',
    aliases: ['dachshund', 'dach', 'salchicha', 'sal', 'salchichas', 'teckel'],
  },
  {
    id: 'french_bulldog',
    species: 'dog',
    label: 'Bulldog Francés',
    pluralLabel: 'Bulldogs Franceses',
    aliases: ['french bulldog', 'bulldog frances', 'bulldog francés', 'frances', 'frenchie'],
  },
  {
    id: 'golden_retriever',
    species: 'dog',
    label: 'Golden Retriever',
    pluralLabel: 'Golden Retriever',
    aliases: ['golden', 'golden retriever', 'goldenretriever'],
  },
  {
    id: 'german_shepherd',
    species: 'dog',
    label: 'Pastor Alemán',
    pluralLabel: 'Pastores Alemanes',
    aliases: ['pastor aleman', 'pastor alemán', 'german shepherd', 'ovejero', 'alsatian'],
  },
  {
    id: 'chihuahua',
    species: 'dog',
    label: 'Chihuahua',
    pluralLabel: 'Chihuahuas',
    aliases: ['chihuahua', 'chihuahueño', 'chihuahuenio'],
  },
  {
    id: 'beagle',
    species: 'dog',
    label: 'Beagle',
    pluralLabel: 'Beagles',
    aliases: ['beagle', 'beagles'],
  },
  {
    id: 'schnauzer',
    species: 'dog',
    label: 'Schnauzer',
    pluralLabel: 'Schnauzer',
    aliases: ['schnauzer', 'schnauzers'],
  },
];

export const BREED_UNKNOWN_LABEL = 'Otra / No sé';
export const BREED_UNKNOWN_FOUND_LABEL = 'No sé la raza';

const CATALOG_BY_ID = new Map(DOG_BREED_CATALOG.map((b) => [b.id, b]));

export function normalizeSearchText(raw: string | null | undefined): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function compactSearchText(raw: string | null | undefined): string {
  return normalizeSearchText(raw).replace(/\s+/g, '');
}

/** Alertas usan `perro`/`gato`. El catálogo usa `dog`/`cat`. */
export function catalogSpeciesFromAlert(species: string | null | undefined): CatalogSpecies {
  const key = compactSearchText(species);
  if (key === 'perro' || key === 'dog' || key === 'canine') return 'dog';
  if (key === 'gato' || key === 'cat' || key === 'felino' || key === 'feline') return 'cat';
  return 'other';
}

export function breedById(id: string | null | undefined): BreedCatalogEntry | null {
  if (!id) return null;
  return CATALOG_BY_ID.get(String(id)) || null;
}

export function isCatalogBreedId(id: string | null | undefined): boolean {
  return !!breedById(id);
}

export function breedBelongsToSpecies(
  breedId: string | null | undefined,
  species: string | null | undefined
): boolean {
  const breed = breedById(breedId);
  if (!breed) return false;
  return breed.species === catalogSpeciesFromAlert(species);
}

export function persistableBreedId(
  raw: string | null | undefined,
  species: string | null | undefined
): string | null {
  if (raw == null || raw === '' || raw === BREED_UNKNOWN_OPTION_ID) return null;
  if (!isCatalogBreedId(raw)) return null;
  if (species && !breedBelongsToSpecies(raw, species)) return null;
  return raw;
}

export function breedDisplayLabel(breedId: string | null | undefined): string {
  return breedById(breedId)?.label || '';
}

export function breedPluralLabel(breedId: string | null | undefined): string {
  return breedById(breedId)?.pluralLabel || breedDisplayLabel(breedId);
}

function entryMatchesQuery(entry: BreedCatalogEntry, query: string, compact: string): boolean {
  if (!query) return true;
  const haystacks = [entry.id.replace(/_/g, ' '), entry.label, entry.pluralLabel, ...entry.aliases];
  return haystacks.some((h) => {
    const n = normalizeSearchText(h);
    const c = compactSearchText(h);
    return n.includes(query) || c.includes(compact) || compact.includes(c);
  });
}

/** Sugerencias. El usuario debe tocar una; no se acepta el texto como breed_id. */
export function suggestBreeds(
  query: string | null | undefined,
  species: string | null | undefined
): BreedCatalogEntry[] {
  const catalogSpecies = catalogSpeciesFromAlert(species);
  if (catalogSpecies !== 'dog') return [];
  const q = normalizeSearchText(query);
  const compact = compactSearchText(query);
  return DOG_BREED_CATALOG.filter((entry) => entryMatchesQuery(entry, q, compact));
}

export function resolveBreedSuggestion(
  query: string | null | undefined,
  species: string | null | undefined
): BreedCatalogEntry | null {
  const hits = suggestBreeds(query, species);
  if (hits.length === 1) return hits[0];
  const compact = compactSearchText(query);
  return hits.find((h) => h.id === compact || h.aliases.some((a) => compactSearchText(a) === compact)) || null;
}

/** No persiste typos ni texto libre. Solo IDs del catálogo o null. */
export function parseBreedInput(
  raw: string | null | undefined,
  species: string | null | undefined
): { breedId: string | null; accepted: boolean } {
  const trimmed = String(raw || '').trim();
  if (!trimmed || trimmed === BREED_UNKNOWN_OPTION_ID || trimmed === BREED_UNKNOWN_LABEL || trimmed === BREED_UNKNOWN_FOUND_LABEL) {
    return { breedId: null, accepted: true };
  }
  if (isCatalogBreedId(trimmed)) {
    const id = persistableBreedId(trimmed, species);
    return { breedId: id, accepted: id != null || catalogSpeciesFromAlert(species) !== 'dog' };
  }
  return { breedId: null, accepted: false };
}

export const ALERT_BREED_ID_COLUMN = 'breed_id';
