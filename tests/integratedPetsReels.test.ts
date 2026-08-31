import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MOBILE_TAB_ORDER, TAB_ICONS, tabImmediatelyAfter } from '../lib/mainTabs.ts';
import { planMainTabPress, shouldPlayFeedReels } from '../lib/feedReelsNav.ts';
import { filterReelsForFeed, reelBelongsInReelsFeed, shouldPlayReel } from '../lib/reels.ts';
import {
  filterPersonalPets,
  petsForPublishingIdentity,
  petAllowedForAuthorIdentity,
  POST_PET_IDENTITY_ERROR,
} from '../lib/petOwnership.ts';
import { editIdentityLabel, isManagedPageType } from '../features/profiles/profileTypes.ts';
import { resolveAppLink } from '../lib/appLinks.ts';
import { createChooserDestination } from '../lib/createChooser.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const app = read('App.tsx');
const sidebar = read('components/Sidebar.tsx');
const worker = read('worker/index.js');
const reelsMux = read('worker/reelsMux.js');
const userProfile = read('screens/UserProfileScreen.tsx');
const publicProfile = read('screens/PublicProfileScreen.tsx');
const myPets = read('screens/MyPetsScreen.tsx');
const createPost = read('screens/CreatePostScreen.tsx');
const createReel = read('screens/CreateReelScreen.tsx');
const packageJson = read('package.json');

const ACCOUNT = 'u-1';
const personal = { id: 'pr-me', type: 'personal' as const, accountId: ACCOUNT };
const pageA = { id: 'pr-a', type: 'protector' as const, accountId: ACCOUNT };
const pageB = { id: 'pr-b', type: 'protector' as const, accountId: ACCOUNT };
const nina = { id: 'nina', user_id: ACCOUNT, profile_id: null, userId: ACCOUNT, profileId: null };
const firulais = { id: 'firu', user_id: ACCOUNT, profile_id: 'pr-a', userId: ACCOUNT, profileId: 'pr-a' };

describe('1. tabs incluyen Mascotas a la derecha de +', () => {
  it('orden Inicio | Reels | Alertas | + | Mascotas | Mercado | Perfil', () => {
    assert.deepEqual(MOBILE_TAB_ORDER, [
      'Inicio',
      'Reels',
      'Alertas',
      'Crear',
      'Mascotas',
      'Mercado',
      'Perfil',
    ]);
    assert.equal(tabImmediatelyAfter(MOBILE_TAB_ORDER, 'Crear'), 'Mascotas');
    assert.deepEqual(TAB_ICONS.Mascotas, { on: 'paw', off: 'paw-outline' });
    assert.match(app, /name="Mascotas" component=\{MascotasStack\}/);
    assert.match(app, /Crear[\s\S]{0,120}Mascotas[\s\S]{0,80}Mercado/);
  });
});

describe('2. Home ↔ Reels sigue sincronizado', () => {
  it('tap Reels = setPage; tap Inicio = setPage; ReelsTabBridge intacto', () => {
    assert.deepEqual(planMainTabPress({ pressed: 'Reels', navFocused: 'Inicio', feedPage: 0 }), {
      kind: 'setPage',
      page: 1,
    });
    assert.deepEqual(planMainTabPress({ pressed: 'Inicio', navFocused: 'Inicio', feedPage: 1 }), {
      kind: 'setPage',
      page: 0,
    });
    assert.match(app, /ReelsTabBridge/);
    assert.match(app, /planMainTabPress/);
    assert.match(app, /FeedReelsNavProvider/);
    assert.match(sidebar, /planMainTabPress/);
    assert.match(sidebar, /useFeedReelsNav/);
  });
});

describe('3–4. Reels playback gating y feed solo ready + playback', () => {
  it('un solo Reel activo y pausa fuera de Reels', () => {
    assert.equal(shouldPlayFeedReels({ page: 1, tabFocused: true }), true);
    assert.equal(shouldPlayFeedReels({ page: 0, tabFocused: true }), false);
    assert.equal(shouldPlayReel({
      tabFocused: true,
      reelsPageVisible: true,
      reelIsActive: true,
      appIsForeground: true,
    }), true);
    assert.equal(shouldPlayReel({
      tabFocused: false,
      reelsPageVisible: true,
      reelIsActive: true,
      appIsForeground: true,
    }), false);
  });

  it('uploading/processing/failed no entran al feed', () => {
    assert.equal(reelBelongsInReelsFeed({ status: 'ready', playbackId: 'pb' }), true);
    assert.equal(reelBelongsInReelsFeed({ status: 'uploading', playbackId: 'pb' }), false);
    assert.equal(reelBelongsInReelsFeed({ status: 'processing', playbackId: 'pb' }), false);
    assert.equal(reelBelongsInReelsFeed({ status: 'failed', playbackId: 'pb' }), false);
    assert.deepEqual(
      filterReelsForFeed([
        { id: 'ok', status: 'ready', playbackId: 'pb' },
        { id: 'up', status: 'uploading', playbackId: null },
      ]).map((r) => r.id),
      ['ok'],
    );
  });
});

describe('5–7. ownership personal vs Página y selector', () => {
  it('Mis mascotas solo personales; Página solo las suyas', () => {
    const pets = [nina, firulais];
    const profiles = [personal, pageA];
    assert.deepEqual(filterPersonalPets(pets, profiles).map((p) => p.id), ['nina']);
    assert.deepEqual(
      petsForPublishingIdentity(pets, { profileId: 'pr-a', type: 'protector' }, profiles).map((p) => p.id),
      ['firu'],
    );
    assert.match(myPets, /filterPersonalPets\(myPets, profiles\)/);
    assert.match(createPost, /petsForPublishingIdentity/);
    assert.match(createPost, /reconcileSelectedPetId/);
  });
});

describe('8. createPost autorización en Worker integrado', () => {
  it('petAllowedForAuthorIdentity convive con Mux/Reels', () => {
    assert.match(worker, /from '\.\/reelsMux\.js'/);
    assert.match(worker, /petAllowedForAuthorIdentity/);
    assert.match(worker, /handleMuxWebhook/);
    assert.match(worker, /runReelCleanup/);
    assert.match(reelsMux, /createReelUpload/);
    assert.equal(
      petAllowedForAuthorIdentity({
        accountId: ACCOUNT,
        pet: nina,
        author: personal,
      }).ok,
      true,
    );
    assert.deepEqual(
      petAllowedForAuthorIdentity({
        accountId: ACCOUNT,
        pet: firulais,
        author: personal,
        petProfile: pageA,
      }),
      { ok: false, code: 'identity_mismatch' },
    );
    assert.equal(
      petAllowedForAuthorIdentity({
        accountId: ACCOUNT,
        pet: firulais,
        author: pageA,
        petProfile: pageA,
      }).ok,
      true,
    );
    assert.deepEqual(
      petAllowedForAuthorIdentity({
        accountId: ACCOUNT,
        pet: firulais,
        author: pageB,
        petProfile: pageA,
      }),
      { ok: false, code: 'identity_mismatch' },
    );
    assert.match(worker, new RegExp(POST_PET_IDENTITY_ERROR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
});

describe('9–10. Mis páginas y Perfil personal', () => {
  it('perfil propio dice Mis páginas; identidad personal sigue Perfil', () => {
    assert.match(userProfile, /Mis páginas/);
    assert.equal(editIdentityLabel('personal'), 'Editar perfil');
    assert.equal(editIdentityLabel('protector'), 'Editar página');
    assert.equal(isManagedPageType('personal'), false);
    assert.equal(isManagedPageType('protector'), true);
    assert.match(app, /title: 'Editar página'/);
    assert.match(app, /title: 'Editar perfil'/);
  });
});

describe('11–12. Reels en perfiles y mascota protagonista', () => {
  it('grillas de Reels y pet_id en CreateReel / perfiles', () => {
    assert.match(userProfile, /useReelGrid/);
    assert.match(publicProfile, /useReelGrid/);
    assert.match(publicProfile, /PAGE_TABS/);
    assert.match(createReel, /pet_id|petId/);
    assert.match(createReel, /authorizeOwnedPetId|selectedPet|petId/);
  });
});

describe('13–16. App Links, +, Mercado y Alertas', () => {
  it('links /r/:id y /mascotas coexisten', () => {
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/r/reel-1'), {
      screen: 'ReelViewer',
      params: { reelId: 'reel-1' },
    });
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/mascotas'), {
      screen: 'Tabs',
      params: { screen: 'Mascotas' },
    });
    assert.match(app, /ReelViewer: 'r\/:reelId'/);
    assert.match(app, /Mascotas: 'mascotas'/);
  });

  it('+ abre chooser; Mercado y Alertas siguen registrados', () => {
    assert.equal(createChooserDestination('post'), 'CreatePost');
    assert.equal(createChooserDestination('reel'), 'CreateReel');
    assert.match(app, /CreateChooserScreen/);
    assert.match(app, /name="CreatePost"/);
    assert.match(app, /name="Mercado" component=\{MercadoStack\}/);
    assert.match(app, /name="Alertas" component=\{AlertasStack\}/);
    assert.match(packageJson, /"expo-video"/);
    assert.match(packageJson, /"react-native-video-trim"/);
  });
});
