import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compactAgeLabel, adoptionStatusOverlay } from '../lib/compactTime.ts';
import {
  ADOPTION_PAGE_SIZE,
  adoptionCardFromAlert,
  adoptionCardFromProtectorPet,
  alertFeedId,
  dedupeAdoptionCards,
  matchesAdoptionFilters,
  mergeAdoptionSources,
  paginateAdoptionCards,
  petFeedId,
  rankAdoptionCards,
  type AdoptionCard,
} from '../lib/adoptionDiscovery.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'App.tsx'), 'utf8');
const types = readFileSync(join(root, 'lib/types.ts'), 'utf8');
const feed = readFileSync(join(root, 'screens/FeedScreen.tsx'), 'utf8');
const profile = readFileSync(join(root, 'screens/UserProfileScreen.tsx'), 'utf8');
const discovery = readFileSync(join(root, 'screens/AdoptionDiscoveryScreen.tsx'), 'utf8');
const btn = readFileSync(join(root, 'components/WantToAdoptButton.tsx'), 'utf8');
const card = readFileSync(join(root, 'components/AdoptionDiscoveryCard.tsx'), 'utf8');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
const linking = readFileSync(join(root, 'app.json'), 'utf8');
const feedScreenFull = feed;

function pet(overrides: Partial<{
  id: string;
  name: string;
  careStatus: string;
  species: string;
  size: string | null;
  sex: string | null;
  birthDate: string | null;
  adoptionStartedAt: number | null;
  createdAt: number;
  profileId: string | null;
  username: string | null;
  archivedAt: number | null;
}>): AdoptionCard {
  const id = overrides.id || 'p1';
  return {
    id: petFeedId(id),
    source: 'protector_pet',
    petId: id,
    petUsername: overrides.username ?? id,
    name: overrides.name || 'Luna',
    photo: null,
    birthDate: overrides.birthDate ?? '2024-08-23',
    careStatus: overrides.careStatus ?? 'en_adopcion',
    adoptionStartedAt: overrides.adoptionStartedAt ?? 1,
    size: overrides.size ?? 'pequeno',
    sex: overrides.sex ?? 'hembra',
    species: overrides.species ?? 'perro',
    shelterProfileId: overrides.profileId ?? 'shelter-1',
    shelterName: 'APAN Salta',
    shelterUsername: 'apansalta',
    shelterLocation: 'Salta Capital',
    createdAt: overrides.createdAt ?? 100,
  };
}

describe('navegación hacia Adoptar', () => {
  it('registra AdoptionDiscovery en el Root Stack autenticado', () => {
    assert.match(types, /AdoptionDiscovery: undefined/);
    assert.match(app, /name="AdoptionDiscovery"/);
    assert.match(app, /AdoptionDiscoveryScreen/);
    assert.match(feed, /navigate\('AdoptionDiscovery'\)/);
    assert.match(profile, /navigate\('AdoptionDiscovery'\)/);
    assert.match(discovery, /navigate\('PetProfile'/);
    assert.match(discovery, /navigate\('PublicProfile'/);
    assert.doesNotMatch(app, /AdoptionDiscovery: 'adoptar'/);
    assert.doesNotMatch(linking, /adoptar/);
  });

  it('el botón reutilizable vive en Feed y en mi perfil', () => {
    assert.match(btn, /WantToAdoptButton/);
    assert.match(btn, /withRepeat/);
    assert.match(btn, /1\.04/);
    assert.match(feed, /WantToAdoptButton/);
    assert.match(profile, /WantToAdoptButton/);
    assert.match(profile, /Editar perfil/);
    assert.match(profile, /\+ Mascota/);
  });
});

describe('filtros combinables y solo En adopción', () => {
  it('combina Perros + Pequeño + Hembra', () => {
    const cards = [
      pet({ id: 'a', species: 'perro', size: 'pequeno', sex: 'hembra' }),
      pet({ id: 'b', species: 'perro', size: 'grande', sex: 'hembra' }),
      pet({ id: 'c', species: 'gato', size: 'pequeno', sex: 'hembra' }),
      pet({ id: 'd', species: 'perro', size: 'pequeno', sex: 'macho' }),
    ];
    const ok = cards.filter((c) =>
      matchesAdoptionFilters(c, { species: 'perro', size: 'pequeno', sex: 'hembra' })
    );
    assert.deepEqual(ok.map((c) => c.petId), ['a']);
  });

  it('excluye En recuperación y admite solo En adopción', () => {
    const recovering = pet({ id: 'r', careStatus: 'en_recuperacion' });
    const home = pet({ id: 'h', careStatus: 'en_casa' });
    const adopt = pet({ id: 'ok' });
    const filters = { species: 'todos' as const, size: 'todos' as const, sex: 'todos' as const };
    assert.equal(matchesAdoptionFilters(recovering, filters), false);
    assert.equal(matchesAdoptionFilters(home, filters), false);
    assert.equal(matchesAdoptionFilters(adopt, filters), true);
    assert.equal(adoptionCardFromProtectorPet({
      id: 'x', name: 'X', species: 'perro', createdAt: 1, careStatus: 'en_recuperacion', profileId: 's',
    }), null);
  });

  it('Otros agrupa especies que no son perro/gato', () => {
    const rabbit = pet({ id: 'c', species: 'conejo' });
    assert.equal(matchesAdoptionFilters(rabbit, { species: 'otro', size: 'todos', sex: 'todos' }), true);
    assert.equal(matchesAdoptionFilters(rabbit, { species: 'perro', size: 'todos', sex: 'todos' }), false);
  });
});

describe('edad, espera, ranking y paginación', () => {
  it('calcula edad desde birth_date y espera desde adoption_started_at', () => {
    const now = new Date(2026, 7, 23);
    assert.equal(compactAgeLabel('2024-08-23', now), 'Edad 2 AÑOS');
    assert.equal(
      adoptionStatusOverlay('en_adopcion', new Date(2026, 2, 23).getTime(), now.getTime()),
      'En adopción · Esperando 5M'
    );
    assert.match(card, /compactAgeLabel/);
    assert.match(card, /adoptionStatusOverlay/);
  });

  it('pagina sin duplicados y omite recuperación', () => {
    const ranked = [
      pet({ id: '1', createdAt: 30 }),
      pet({ id: '1', createdAt: 30 }),
      pet({ id: '2', createdAt: 20 }),
      pet({ id: '3', createdAt: 10, careStatus: 'en_recuperacion' }),
    ];
    const unique = mergeAdoptionSources(ranked, []);
    assert.deepEqual(unique.map((c) => c.petId), ['1', '2']);
    const page1 = paginateAdoptionCards(unique, undefined, 1);
    assert.equal(page1.items.length, 1);
    assert.equal(page1.hasMore, true);
    const page2 = paginateAdoptionCards(unique, page1.cursor, 1);
    assert.equal(page2.items[0].petId, '2');
    assert.equal(dedupeAdoptionCards(ranked).length, 3);
    assert.equal(ADOPTION_PAGE_SIZE, 8);
  });

  it('ranking prioriza localidad y no usa likes', () => {
    const far = pet({ id: 'far', adoptionStartedAt: 1, createdAt: 50 });
    far.shelterLocation = 'Cafayate';
    const near = pet({ id: 'near', adoptionStartedAt: 20, createdAt: 40 });
    const ordered = rankAdoptionCards([far, near], 'Salta Capital');
    assert.equal(ordered[0].petId, 'near');
    const src = readFileSync(join(root, 'lib/adoptionDiscovery.ts'), 'utf8');
    assert.doesNotMatch(src, /likeCount/);
  });
});

describe('navegación PetProfile / PublicProfile y fuente A', () => {
  it('el card abre perfil de mascota y de refugio existentes', () => {
    assert.match(discovery, /PetProfile/);
    assert.match(discovery, /PublicProfile/);
    assert.match(card, /sharePetProfile/);
    assert.equal(adoptionCardFromAlert({ id: 'a1' }), null);
    assert.equal(alertFeedId('a1'), 'alert:a1');
  });

  it('Worker lista solo en_adopcion de protectoras, con paginación', () => {
    const start = worker.indexOf("action === 'adoptionFeed'");
    assert.ok(start >= 0);
    const chunk = worker.slice(start, start + 2800);
    assert.match(chunk, /p\.care_status = 'en_adopcion'/);
    assert.match(chunk, /pr\.type = 'protector'/);
    assert.match(chunk, /p\.created_at < \?/);
    assert.match(chunk, /hasMore/);
    assert.match(chunk, /source: 'protector_pet'/);
    assert.doesNotMatch(chunk, /en_recuperacion/);
  });
});

describe('no rompe Feed A2, App Links, runtime ni Push', () => {
  it('Feed sigue con loadMore y PostCard intactos', () => {
    assert.match(feedScreenFull, /onEndReached=\{loadMore\}/);
    const postCard = readFileSync(join(root, 'components/PostCard.tsx'), 'utf8');
    assert.match(postCard, /onOpenPet/);
    const appJson = JSON.parse(linking);
    assert.equal(appJson.expo.version, '1.1.0');
    assert.equal(appJson.expo.android.versionCode, 2);
    assert.equal(appJson.expo.runtimeVersion.policy, 'appVersion');
  });
});

describe('capa de fetch', () => {
  it('AdoptionDiscovery usa fetchAdoptionPage paginado', () => {
    const feedLib = readFileSync(join(root, 'lib/adoptionFeed.ts'), 'utf8');
    const screen = readFileSync(join(root, 'screens/AdoptionDiscoveryScreen.tsx'), 'utf8');
    assert.match(feedLib, /db\.adoptionFeed/);
    assert.match(feedLib, /featuredPets/);
    assert.match(screen, /fetchAdoptionPage/);
    assert.match(screen, /ADOPTION_PAGE_SIZE/);
  });
});
