import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './db';
import {
  ADOPTION_LOCALITY_KEY,
  ADOPTION_PAGE_SIZE,
  adoptionCardFromProtectorPet,
  dedupeAdoptionCards,
  matchesAdoptionFilters,
  rankAdoptionCards,
  type AdoptionCard,
  type AdoptionPage,
  type AdoptionQuery,
  type ApiAdoptionItem,
} from './adoptionDiscovery';

export async function saveAdoptionLocality(entry: {
  locality: string;
  province: string | null;
}): Promise<void> {
  try {
    await AsyncStorage.setItem(ADOPTION_LOCALITY_KEY, JSON.stringify(entry));
  } catch {}
}

export async function loadSavedAdoptionLocality(): Promise<{
  locality: string;
  province: string | null;
} | null> {
  try {
    const raw = await AsyncStorage.getItem(ADOPTION_LOCALITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.locality === 'string' && parsed.locality) return parsed;
    return null;
  } catch {
    return null;
  }
}

function mapApiItems(rows: ApiAdoptionItem[] | undefined): AdoptionCard[] {
  return (rows || [])
    .map((pet) => adoptionCardFromProtectorPet(pet))
    .filter((card): card is AdoptionCard => !!card);
}

async function fetchAdoptionFallback(query: AdoptionQuery): Promise<AdoptionPage> {
  const { pets } = await db.featuredPets();
  const base = (pets || [])
    .map((pet) => adoptionCardFromProtectorPet(pet))
    .filter((card): card is AdoptionCard => !!card);

  const missing = [...new Set(base.filter((c) => !c.shelterName && c.shelterProfileId).map((c) => c.shelterProfileId!))];
  const shelters = await Promise.all(
    missing.slice(0, 8).map((id) => db.publicProfile({ profileId: id }).catch(() => null))
  );
  const byId = new Map<string, { name: string; username: string; avatar: string | null; location: string | null; locality: string | null }>();
  shelters.forEach((res, i) => {
    const id = missing[i];
    if (!res?.profile || !id) return;
    byId.set(id, {
      name: res.profile.name,
      username: res.profile.username,
      avatar: res.profile.avatar || null,
      location: res.profile.location || null,
      locality: res.profile.locality || null,
    });
  });

  const withShelter = base.map((card) => {
    const extra = card.shelterProfileId ? byId.get(card.shelterProfileId) : undefined;
    if (!extra) return card;
    return {
      ...card,
      shelterName: card.shelterName || extra.name,
      shelterUsername: card.shelterUsername || extra.username,
      shelterAvatar: card.shelterAvatar || extra.avatar,
      shelterLocation: card.shelterLocation || extra.location,
      shelterLocality: card.shelterLocality || extra.locality,
    };
  });

  const filtered = withShelter.filter((card) => matchesAdoptionFilters(card, query));
  const ranked = rankAdoptionCards(filtered, query.locality);
  if (query.before) return { items: [], hasMore: false, cursor: query.before };
  return { items: ranked, hasMore: false, cursor: ranked.at(-1)?.createdAt };
}

export async function fetchAdoptionPage(query: AdoptionQuery): Promise<AdoptionPage> {
  try {
    const res = await db.adoptionFeed({
      locality: query.locality || undefined,
      species: query.species,
      size: query.size,
      sex: query.sex,
      before: query.before,
      limit: query.limit || ADOPTION_PAGE_SIZE,
    });
    const items = dedupeAdoptionCards(
      mapApiItems(res.items).filter((card) => matchesAdoptionFilters(card, query))
    );
    return {
      items,
      hasMore: !!res.hasMore,
      cursor: items.length ? items[items.length - 1].createdAt : query.before,
    };
  } catch {
    return fetchAdoptionFallback(query);
  }
}
