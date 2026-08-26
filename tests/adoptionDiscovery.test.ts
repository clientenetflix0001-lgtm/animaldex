import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compactAgeLabel, adoptionStatusOverlay } from '../lib/compactTime.ts';
import { parsePetSex } from '../lib/petFields.ts';
import {
  ADOPTION_PAGE_SIZE,
  ADOPTION_SEX_FILTERS,
  ADOPTION_SIZE_FILTERS,
  ADOPTION_SPECIES_FILTERS,
  adoptionCardFromAlert,
  adoptionCardFromProtectorPet,
  adoptionImmersiveInsets,
  adoptionTabBarVisible,
  alertFeedId,
  dedupeAdoptionCards,
  matchesAdoptionFilters,
  localityMatches,
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
    sex: overrides.sex !== undefined ? overrides.sex : 'hembra',
    species: overrides.species ?? 'perro',
    shelterProfileId: overrides.profileId ?? 'shelter-1',
    shelterName: 'APAN Salta',
    shelterUsername: 'apansalta',
    shelterLocation: 'Calle 123',
    shelterLocality: 'Salta Capital',
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

  it('vive también en createTabProfileStack para conservar BottomTabNavigator', () => {
    const tabStack = readFileSync(join(root, 'lib/tabProfileStack.tsx'), 'utf8');
    assert.match(tabStack, /name="AdoptionDiscovery"/);
    assert.match(tabStack, /AdoptionDiscoveryScreen/);
    assert.match(types, /TabProfileStackParamList = \{[\s\S]*AdoptionDiscovery: undefined/);
    assert.match(app, /function MobileTabBar/);
    assert.match(app, /MOBILE_TAB_ORDER/);
    assert.match(app, /tabBar=\{\(props\) => <MobileTabBar/);
    assert.doesNotMatch(app, /tabBar=\{\(\) => null\}/);
    assert.doesNotMatch(discovery, /tabBarStyle:\s*\{\s*display:\s*'none'/);
    assert.match(discovery, /navigation\.goBack\(\)/);
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

  it('ranking prioriza localidad exacta y no usa likes', () => {
    const far = pet({ id: 'far', adoptionStartedAt: 1, createdAt: 50 });
    far.shelterLocality = 'Cafayate';
    const near = pet({ id: 'near', adoptionStartedAt: 20, createdAt: 40 });
    const ordered = rankAdoptionCards([far, near], 'Salta Capital');
    assert.equal(ordered[0].petId, 'near');
    const src = readFileSync(join(root, 'lib/adoptionDiscovery.ts'), 'utf8');
    assert.doesNotMatch(src, /likeCount/);
    assert.doesNotMatch(src, /\.includes\(/);
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
    assert.match(chunk, /LOWER\(pr\.locality\) = LOWER\(\?\)/);
    assert.match(chunk, /shelterLocality/);
    assert.doesNotMatch(chunk, /en_recuperacion/);
    assert.doesNotMatch(chunk, /pr\.location, ''\)\) LIKE/);
  });
});

describe('sexo macho/hembra', () => {
  it('parsePetSex acepta macho, hembra y null; rechaza basura', () => {
    assert.deepEqual(parsePetSex('macho'), { ok: true, value: 'macho' });
    assert.deepEqual(parsePetSex('Hembra'), { ok: true, value: 'hembra' });
    assert.deepEqual(parsePetSex(null), { ok: true, value: null });
    assert.deepEqual(parsePetSex(''), { ok: true, value: null });
    assert.deepEqual(parsePetSex(undefined), { ok: true, value: null });
    assert.equal(parsePetSex('otro').ok, false);
    assert.equal(parsePetSex('xyz').ok, false);
  });

  it('createPet persiste sex; inválidos se rechazan; updatePet cambia sex', () => {
    function action(name: string) {
      const start = worker.indexOf(`if (action === '${name}')`);
      assert.ok(start >= 0, name);
      const next = worker.indexOf('if (action ===', start + 10);
      return worker.slice(start, next > start ? next : undefined);
    }
    const create = action('createPet');
    const update = action('updatePet');
    assert.match(create, /parsePetSex\(body\.sex\)/);
    assert.match(create, /Sexo inválido/);
    assert.match(create, /birth_date, size, sex, neutered/);
    assert.match(update, /if \(body\.sex !== undefined\)/);
    assert.match(update, /size = \?, sex = \?, neutered/);
    assert.match(worker, /function parsePetSex/);
    const addPet = readFileSync(join(root, 'screens/AddPetScreen.tsx'), 'utf8');
    assert.match(addPet, /PET_SEXES/);
    assert.match(addPet, /label\}>Sexo</);
  });

  it('legacy NULL no entra en Macho/Hembra pero sí en Todos', () => {
    const unknown = pet({ id: 'u', sex: null });
    const male = pet({ id: 'm', sex: 'macho' });
    const female = pet({ id: 'f', sex: 'hembra' });
    const all = { species: 'todos' as const, size: 'todos' as const, sex: 'todos' as const };
    assert.equal(matchesAdoptionFilters(unknown, all), true);
    assert.equal(matchesAdoptionFilters(unknown, { ...all, sex: 'macho' }), false);
    assert.equal(matchesAdoptionFilters(unknown, { ...all, sex: 'hembra' }), false);
    assert.equal(matchesAdoptionFilters(male, { ...all, sex: 'macho' }), true);
    assert.equal(matchesAdoptionFilters(female, { ...all, sex: 'hembra' }), true);
  });
});

describe('locality normalizada del protector', () => {
  it('guarda profiles.locality y no pisa location', () => {
    assert.match(worker, /ALTER TABLE profiles ADD COLUMN locality TEXT/);
    const start = worker.indexOf("if (action === 'updatePublicProfile')");
    const chunk = worker.slice(start, start + 1800);
    assert.match(chunk, /locality = \?/);
    assert.match(chunk, /location = \?, locality = \?, phone/);
    const edit = readFileSync(join(root, 'screens/EditPublicProfileScreen.tsx'), 'utf8');
    assert.match(edit, /LocalityPicker/);
    assert.match(edit, /profileType === 'protector'/);
    assert.match(edit, /location: location\.trim\(\)/);
    assert.match(edit, /locality: profileType === 'protector' \? locality/);
  });

  it('adoptionFeed filtra exact match por locality; NULL queda fuera del filtro', () => {
    const withLoc = pet({ id: 'a' });
    const otherCity = pet({ id: 'b' });
    otherCity.shelterLocality = 'Cafayate';
    const missing = pet({ id: 'c' });
    missing.shelterLocality = null;
    const filters = {
      species: 'todos' as const,
      size: 'todos' as const,
      sex: 'todos' as const,
      locality: 'Salta Capital',
    };
    assert.equal(matchesAdoptionFilters(withLoc, filters), true);
    assert.equal(matchesAdoptionFilters(otherCity, filters), false);
    assert.equal(matchesAdoptionFilters(missing, filters), false);
    assert.equal(matchesAdoptionFilters(missing, { ...filters, locality: null }), true);
    assert.equal(localityMatches('Salta Capital', 'Salta'), false);
    assert.equal(localityMatches('Salta Capital', 'Salta Capital'), true);
  });

  it('combina especie + porte + sexo + locality', () => {
    const hit = pet({ id: 'hit', species: 'perro', size: 'pequeno', sex: 'hembra' });
    const missSex = pet({ id: 's', species: 'perro', size: 'pequeno', sex: 'macho' });
    const missCity = pet({ id: 'c', species: 'perro', size: 'pequeno', sex: 'hembra' });
    missCity.shelterLocality = 'Orán';
    const missNull = pet({ id: 'n', species: 'perro', size: 'pequeno', sex: 'hembra' });
    missNull.shelterLocality = null;
    const filters = {
      species: 'perro' as const,
      size: 'pequeno' as const,
      sex: 'hembra' as const,
      locality: 'Salta Capital',
    };
    assert.deepEqual(
      [hit, missSex, missCity, missNull].filter((c) => matchesAdoptionFilters(c, filters)).map((c) => c.petId),
      ['hit']
    );
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

describe('layout inmersivo Adoptar', () => {
  it('elimina el header blanco y superpone chrome sobre la foto', () => {
    assert.doesNotMatch(discovery, /SafeAreaView/);
    assert.doesNotMatch(discovery, /backgroundColor: '#FFFFFF'/);
    assert.doesNotMatch(discovery, /backgroundColor: colors\.bg/);
    assert.match(discovery, /styles\.topChrome/);
    assert.match(discovery, /pointerEvents="box-none"/);
    assert.match(discovery, /LinearGradient/);
    assert.match(discovery, /rgba\(0,0,0,0\.46\)/);
    assert.doesNotMatch(discovery, /backgroundColor: '#000000',\s*height:/);
    assert.match(discovery, /color="#FFFFFF"/);
    assert.match(discovery, /styles\.chipOn/);
  });

  it('conserva filtros y valores enviados a fetchAdoptionPage', () => {
    assert.deepEqual(ADOPTION_SPECIES_FILTERS.map((f) => f.id), ['todos', 'perro', 'gato', 'otro']);
    assert.deepEqual(ADOPTION_SIZE_FILTERS.map((f) => f.id), ['todos', 'pequeno', 'mediano', 'grande']);
    assert.deepEqual(ADOPTION_SEX_FILTERS.map((f) => f.id), ['todos', 'macho', 'hembra']);
    assert.match(discovery, /ADOPTION_SPECIES_FILTERS/);
    assert.match(discovery, /ADOPTION_SIZE_FILTERS/);
    assert.match(discovery, /ADOPTION_SEX_FILTERS/);
    assert.match(discovery, /setSpecies/);
    assert.match(discovery, /setSize/);
    assert.match(discovery, /setSex/);
    assert.match(discovery, /\.\.\.filters,\s*locality: targetLocality/);
    assert.match(discovery, /LocalityPicker/);
    assert.match(discovery, /saveAdoptionLocality/);
  });

  it('AdoptionDiscoveryCard mantiene datos, acciones y CTA', () => {
    assert.match(card, /compactAgeLabel\(card\.birthDate\)/);
    assert.match(card, /adoptionStatusOverlay\(card\.careStatus, card\.adoptionStartedAt\)/);
    assert.match(card, /card\.shelterName/);
    assert.match(card, /card\.shelterLocality \|\| card\.shelterLocation/);
    assert.match(card, /WantToAdoptButton/);
    assert.match(card, /onToggleLike/);
    assert.match(card, /onComments/);
    assert.match(card, /sharePetProfile/);
    assert.match(card, /thumb\(/);
    assert.match(card, /export default memo\(AdoptionDiscoveryCard\)/);
    assert.match(card, /bottomPad/);
  });

  it('calcula altura de página con insets reales, no padding fijo de un teléfono', () => {
    const withTabs = adoptionImmersiveInsets({ top: 24, bottom: 48 }, true);
    assert.deepEqual(withTabs, { headerPadTop: 24, systemBottomPad: 0 });
    const threeButtons = adoptionImmersiveInsets({ top: 28, bottom: 48 }, false);
    assert.equal(threeButtons.systemBottomPad, 48);
    const gestures = adoptionImmersiveInsets({ top: 28, bottom: 16 }, false);
    assert.equal(gestures.systemBottomPad, 16);
    const zero = adoptionImmersiveInsets({ top: 0, bottom: 0 }, false);
    assert.equal(zero.systemBottomPad, 0);

    const tabParent = () => ({ getState: () => ({ type: 'tab' as const }) });
    assert.equal(adoptionTabBarVisible(tabParent), true);
    const stackParent = () => ({ getState: () => ({ type: 'stack' as const }) });
    assert.equal(adoptionTabBarVisible(stackParent), false);

    assert.match(discovery, /useSafeAreaInsets/);
    assert.match(discovery, /adoptionImmersiveInsets/);
    assert.match(discovery, /snapToInterval=\{listH\}/);
    assert.match(discovery, /pagingEnabled/);
    assert.match(discovery, /getItemLayout/);
    assert.match(discovery, /windowSize=\{3\}/);
    assert.doesNotMatch(discovery, /paddingBottom:\s*4[0-9]/);
    assert.doesNotMatch(discovery, /paddingBottom:\s*80/);
    assert.doesNotMatch(discovery, /paddingBottom:\s*48/);
  });

  it('no modifica adoptionFeed ni el Worker', () => {
    const start = worker.indexOf("action === 'adoptionFeed'");
    const chunk = worker.slice(start, start + 2800);
    assert.match(chunk, /LOWER\(pr\.locality\) = LOWER\(\?\)/);
    assert.match(chunk, /p\.care_status = 'en_adopcion'/);
    const feedLib = readFileSync(join(root, 'lib/adoptionFeed.ts'), 'utf8');
    assert.match(feedLib, /db\.adoptionFeed/);
  });

  it('top chrome es overlay absoluto y no consume altura del FlatList', () => {
    const chrome = discovery.slice(discovery.indexOf('topChrome:'));
    const chromeBlock = chrome.slice(0, chrome.indexOf('topFade:'));
    assert.match(chromeBlock, /position: 'absolute'/);
    assert.match(chromeBlock, /top: 0/);
    assert.match(chromeBlock, /left: 0/);
    assert.match(chromeBlock, /right: 0/);
    assert.doesNotMatch(chromeBlock, /bottom:\s*0/);
    assert.doesNotMatch(chromeBlock, /absoluteFillObject/);
    assert.match(discovery, /style=\{styles\.list\}/);
    assert.match(discovery, /list: \{ flex: 1 \}/);
    assert.match(discovery, /snapToInterval=\{listH\}/);
    assert.match(discovery, /pagingEnabled/);
    assert.match(discovery, /pointerEvents="box-none"/);
    assert.match(discovery, /paddingTop: pads\.headerPadTop/);
    assert.match(discovery, /useSafeAreaInsets/);
    const tabStack = readFileSync(join(root, 'lib/tabProfileStack.tsx'), 'utf8');
    assert.match(tabStack, /name="AdoptionDiscovery"/);
    assert.match(app, /function MobileTabBar/);
    assert.match(app, /tabBar=\{\(props\) => <MobileTabBar/);
    assert.doesNotMatch(discovery, /tabBarStyle/);
    assert.match(discovery, /setSpecies/);
    assert.match(discovery, /setSize/);
    assert.match(discovery, /setSex/);
    assert.match(discovery, /onPress=\{\(\) => setPickerVisible\(true\)\}/);
    assert.match(discovery, /onPress=\{\(\) => navigation\.goBack\(\)\}/);
  });
});
