/**
 * Discovery de adopción — primera versión.
 *
 * Fuente A (esta entrega): mascotas de perfiles protector/refugio
 * con care_status = 'en_adopcion'. Un solo perfil de mascota; esta
 * pantalla solo las descubre.
 *
 * Fuente B (preparada, NO implementada): alertas de usuarios comunes
 * con futura categoría "En adopción". mergeAdoptionSources() ya acepta
 * ambas listas para no reescribir la UI cuando B exista.
 *
 * Ubicación: profiles.locality (normalizada, mismo catálogo que
 * Alertas/Mercado) para filtrar exact match. profiles.location sigue
 * siendo dirección visible y no se usa como filtro.
 */

function speciesBucket(species: string | null | undefined): 'perro' | 'gato' | 'otro' {
  if (species === 'perro') return 'perro';
  if (species === 'gato') return 'gato';
  return 'otro';
}

export const ADOPTION_PURPLE = '#A94CF4';
export const ADOPTION_PAGE_SIZE = 8;
export const FUTURE_ALERT_ADOPTION_TYPE = 'en_adopcion';
export const ADOPTION_LOCALITY_KEY = 'animaldex-adoption-locality';

export type AdoptionSource = 'protector_pet' | 'alert_en_adopcion';

export type AdoptionSpeciesFilter = 'todos' | 'perro' | 'gato' | 'otro';
export type AdoptionSizeFilter = 'todos' | 'pequeno' | 'mediano' | 'grande';
export type AdoptionSexFilter = 'todos' | 'macho' | 'hembra';

export const ADOPTION_SPECIES_FILTERS: { id: AdoptionSpeciesFilter; label: string }[] = [
  { id: 'todos', label: 'Todas' },
  { id: 'perro', label: '🐶 Perros' },
  { id: 'gato', label: '🐱 Gatos' },
  { id: 'otro', label: 'Otros' },
];

export const ADOPTION_SIZE_FILTERS: { id: AdoptionSizeFilter; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'pequeno', label: 'Pequeño' },
  { id: 'mediano', label: 'Mediano' },
  { id: 'grande', label: 'Grande' },
];

export const ADOPTION_SEX_FILTERS: { id: AdoptionSexFilter; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'macho', label: 'Macho' },
  { id: 'hembra', label: 'Hembra' },
];

export interface AdoptionCard {
  id: string;
  source: AdoptionSource;
  petId: string | null;
  petUsername: string | null;
  name: string;
  photo: string | null;
  birthDate: string | null;
  careStatus: string | null;
  adoptionStartedAt: number | null;
  size: string | null;
  sex: string | null;
  species: string | null;
  shelterProfileId: string | null;
  shelterName: string | null;
  shelterUsername: string | null;
  shelterLocation: string | null;
  shelterLocality: string | null;
  createdAt: number;
}

export interface AdoptionFilters {
  species: AdoptionSpeciesFilter;
  size: AdoptionSizeFilter;
  sex: AdoptionSexFilter;
  locality?: string | null;
}

export interface AdoptionQuery extends AdoptionFilters {
  locality?: string | null;
  before?: number;
  limit?: number;
}

export interface AdoptionPage {
  items: AdoptionCard[];
  hasMore: boolean;
  cursor?: number;
}

export interface AdoptionPetInput {
  id: string;
  name: string;
  username?: string | null;
  species?: string | null;
  avatarUrl?: string | null;
  createdAt: number;
  profileId?: string | null;
  careStatus?: string | null;
  sex?: string | null;
  birthDate?: string | null;
  size?: string | null;
  adoptionStartedAt?: number | null;
  archivedAt?: number | null;
}

export interface ApiAdoptionItem extends AdoptionPetInput {
  source?: AdoptionSource;
  shelterId?: string | null;
  shelterName?: string | null;
  shelterUsername?: string | null;
  shelterLocation?: string | null;
  shelterLocality?: string | null;
}

export function petFeedId(petId: string): string {
  return `pet:${petId}`;
}

export function alertFeedId(alertId: string): string {
  return `alert:${alertId}`;
}

export function adoptionCardFromProtectorPet(
  pet: AdoptionPetInput | ApiAdoptionItem,
  shelter?: {
    id?: string | null;
    name?: string | null;
    username?: string | null;
    location?: string | null;
    locality?: string | null;
  } | null
): AdoptionCard | null {
  if (!pet?.id) return null;
  if (pet.archivedAt) return null;
  if (pet.careStatus !== 'en_adopcion') return null;
  const shelterId = (pet as ApiAdoptionItem).shelterId || shelter?.id || pet.profileId || null;
  if (!shelterId) return null;
  return {
    id: petFeedId(pet.id),
    source: 'protector_pet',
    petId: pet.id,
    petUsername: pet.username || null,
    name: pet.name,
    photo: pet.avatarUrl || null,
    birthDate: pet.birthDate || null,
    careStatus: pet.careStatus,
    adoptionStartedAt: pet.adoptionStartedAt || null,
    size: pet.size || null,
    sex: pet.sex || null,
    species: pet.species || null,
    shelterProfileId: shelterId,
    shelterName: (pet as ApiAdoptionItem).shelterName || shelter?.name || null,
    shelterUsername: (pet as ApiAdoptionItem).shelterUsername || shelter?.username || null,
    shelterLocation: (pet as ApiAdoptionItem).shelterLocation || shelter?.location || null,
    shelterLocality: (pet as ApiAdoptionItem).shelterLocality || shelter?.locality || null,
    createdAt: pet.createdAt,
  };
}

/** Reservado: Alertas categoría "En adopción". Hoy siempre null. */
export function adoptionCardFromAlert(_alert: { id?: string } | null | undefined): AdoptionCard | null {
  return null;
}

export function matchesAdoptionFilters(card: AdoptionCard, filters: AdoptionFilters): boolean {
  if (card.source === 'protector_pet' && card.careStatus !== 'en_adopcion') return false;
  if (card.careStatus === 'en_recuperacion') return false;
  if (filters.species !== 'todos' && speciesBucket(card.species) !== filters.species) return false;
  if (filters.size !== 'todos') {
    if (!card.size || card.size !== filters.size) return false;
  }
  if (filters.sex !== 'todos') {
    const sex = String(card.sex || '').trim().toLowerCase();
    if (sex !== filters.sex) return false;
  }
  if (filters.locality) {
    if (!localityMatches(card.shelterLocality, filters.locality)) return false;
  }
  return true;
}

export function localityMatches(
  shelterLocality: string | null | undefined,
  locality: string | null | undefined
): boolean {
  if (!locality || !shelterLocality) return false;
  return shelterLocality.trim().toLowerCase() === locality.trim().toLowerCase();
}

function varietyBucket(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 7;
}

/** Ranking determinista: localidad exacta → espera → actividad → variedad. */
export function rankAdoptionCards(
  cards: AdoptionCard[],
  locality?: string | null,
  _now: number = Date.now()
): AdoptionCard[] {
  return [...cards].sort((a, b) => {
    const locA = localityMatches(a.shelterLocality, locality) ? 0 : 1;
    const locB = localityMatches(b.shelterLocality, locality) ? 0 : 1;
    if (locA !== locB) return locA - locB;
    const waitA = a.adoptionStartedAt || a.createdAt;
    const waitB = b.adoptionStartedAt || b.createdAt;
    if (waitA !== waitB) return waitA - waitB;
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
    const variety = varietyBucket(a.id) - varietyBucket(b.id);
    if (variety !== 0) return variety;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function dedupeAdoptionCards(cards: AdoptionCard[]): AdoptionCard[] {
  const seen = new Set<string>();
  const out: AdoptionCard[] = [];
  for (const card of cards) {
    const key = card.petId ? petFeedId(card.petId) : card.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(card);
  }
  return out;
}

export function mergeAdoptionSources(
  protectorPets: AdoptionCard[],
  alertCards: AdoptionCard[] = [],
  locality?: string | null
): AdoptionCard[] {
  const merged = dedupeAdoptionCards([...protectorPets, ...alertCards]);
  const visible = merged.filter((card) => {
    if (card.source === 'protector_pet') return card.careStatus === 'en_adopcion';
    if (card.source === 'alert_en_adopcion') return true;
    return false;
  });
  return rankAdoptionCards(visible, locality);
}

export function paginateAdoptionCards(
  ranked: AdoptionCard[],
  before?: number,
  limit: number = ADOPTION_PAGE_SIZE
): AdoptionPage {
  const pool = typeof before === 'number' ? ranked.filter((c) => c.createdAt < before) : ranked;
  const items = pool.slice(0, limit);
  return {
    items,
    hasMore: pool.length > items.length,
    cursor: items.length ? items[items.length - 1].createdAt : before,
  };
}
