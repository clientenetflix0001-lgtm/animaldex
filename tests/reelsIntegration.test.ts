import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createChooserDestination } from '../lib/createChooser.ts';
import {
  authorizeOwnedPetId,
  authorizeOwnedProfileId,
  reelSocialActorIsAccountUser,
} from '../lib/reelAuth.ts';
import {
  REEL_COMMENT_ACTIVITY_TYPE,
  REEL_LIKE_ACTIVITY_TYPE,
  reelActivityAbsoluteUrl,
  reelActivityPath,
  reelActivityPushPayload,
  reelCommentActivityText,
  reelIdFromActivityUrl,
  reelLikeActivityText,
  shouldCreateReelActivity,
} from '../lib/reelActivity.ts';
import {
  appendUniqueReels,
  clampReelGridLimit,
  gridTileUsesPlayer,
  ownerGridLabel,
  profileReelsOwnerStatuses,
  reelViewerParamsFromGrid,
  reelViewerStartIndex,
  reelVisibleOnPetGrid,
  reelVisibleOnProfileGrid,
  REEL_GRID_PAGE,
} from '../lib/reelGrid.ts';
import { getMuxThumbnail, shouldPlayReel } from '../lib/reels.ts';
import { parsePushNav, pushNavDestination } from '../lib/pushPolicy.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('Crear: Publicación | Reel', () => {
  it('Publicación abre el flujo existente y Reel abre CreateReel', () => {
    assert.equal(createChooserDestination('post'), 'CreatePost');
    assert.equal(createChooserDestination('reel'), 'CreateReel');
    const app = read('App.tsx');
    const chooser = read('screens/CreateChooserScreen.tsx');
    assert.match(app, /CreateChooserScreen/);
    assert.match(app, /name="CreatePost"/);
    assert.match(app, /component=\{CreatePostScreen\}/);
    assert.match(chooser, /open\('post'\)/);
    assert.match(chooser, /open\('reel'\)/);
    assert.match(chooser, /createChooserDestination\(kind\)/);
    assert.doesNotMatch(chooser, /CreatePostScreen/);
  });

  it('no modifica CreatePostScreen ni /upload de imágenes', () => {
    const createPost = read('screens/CreatePostScreen.tsx');
    assert.match(createPost, /mediaTypes: \['images'\]/);
    assert.doesNotMatch(createPost, /CreateChooser|createReelUpload|CreateReel/);
  });
});

describe('visibilidad en perfil', () => {
  it('ready es público; processing/failed propio solo dueño; deleted oculto', () => {
    assert.equal(reelVisibleOnProfileGrid({ status: 'ready' }, { isOwner: false }), true);
    assert.equal(reelVisibleOnProfileGrid({ status: 'processing' }, { isOwner: true }), true);
    assert.equal(reelVisibleOnProfileGrid({ status: 'processing' }, { isOwner: false }), false);
    assert.equal(reelVisibleOnProfileGrid({ status: 'uploading' }, { isOwner: false }), false);
    assert.equal(reelVisibleOnProfileGrid({ status: 'upload_failed' }, { isOwner: false }), false);
    assert.equal(reelVisibleOnProfileGrid({ status: 'processing_failed' }, { isOwner: true }), true);
    assert.equal(reelVisibleOnProfileGrid({ status: 'deleted' }, { isOwner: true }), false);
    assert.equal(reelVisibleOnProfileGrid({ status: 'ready', deletedAt: 1 }, { isOwner: true }), false);
    assert.equal(ownerGridLabel('processing'), 'Procesando…');
    assert.equal(ownerGridLabel('ready'), null);
    assert.deepEqual(profileReelsOwnerStatuses(false), ['ready']);
    assert.ok(profileReelsOwnerStatuses(true).includes('processing'));
  });
});

describe('mascota protagonista', () => {
  it('solo el Reel de esa mascota ready aparece', () => {
    assert.equal(reelVisibleOnPetGrid({ status: 'ready', petId: 'pet-a' }, 'pet-a'), true);
    assert.equal(reelVisibleOnPetGrid({ status: 'ready', petId: 'pet-b' }, 'pet-a'), false);
    assert.equal(reelVisibleOnPetGrid({ status: 'processing', petId: 'pet-a' }, 'pet-a'), false);
    const mux = read('worker/reelsMux.js');
    assert.match(mux, /action === 'petReels'/);
    assert.match(mux, /r\.pet_id = \? AND r\.status = 'ready'/);
  });
});

describe('grilla: thumbnail, sin player', () => {
  it('usa Mux thumbnail y no crea HLS/VideoPlayer', () => {
    const grid = read('components/ReelGrid.tsx');
    assert.match(grid, /getMuxThumbnail/);
    assert.match(grid, /cachePolicy="memory-disk"/);
    assert.match(grid, /recyclingKey=\{reel\.id\}/);
    assert.doesNotMatch(grid, /expo-video|useVideoPlayer|VideoView|stream\.mux\.com/);
    assert.equal(gridTileUsesPlayer({ hlsUrl: 'https://stream.mux.com/x.m3u8' }), false);
    const thumb = getMuxThumbnail('play1', { width: 240, height: 426 });
    assert.match(thumb || '', /image\.mux\.com\/play1\/thumbnail/);
    assert.doesNotMatch(thumb || '', /stream\.mux\.com/);
  });
});

describe('navegación viewer y retorno', () => {
  it('perfil → Reel abre ese índice y el stack vuelve al perfil', () => {
    const items = [{ id: 'r1' }, { id: 'r2' }, { id: 'r5' }, { id: 'r9' }];
    const params = reelViewerParamsFromGrid({
      reelId: 'r5',
      items,
      index: 2,
      scope: { type: 'profile', id: 'prof-1' },
    });
    assert.equal(params.reelId, 'r5');
    assert.equal(params.scope, 'profile');
    assert.equal(params.scopeId, 'prof-1');
    assert.equal(params.initialIndex, 2);
    assert.equal(reelViewerStartIndex(items, 'r5'), 2);
    const viewer = read('screens/ReelViewerScreen.tsx');
    const reels = read('screens/ReelsScreen.tsx');
    assert.match(viewer, /scope=\{listScope\}/);
    assert.match(viewer, /initialIndex=\{start\}/);
    assert.match(reels, /initialScrollIndex/);
    assert.match(reels, /profileReels|petReels|userReels/);
  });

  it('mascota → Reel conserva scope pet; Reel → perfil no reconstruye lista', () => {
    const params = reelViewerParamsFromGrid({
      reelId: 'r1',
      items: [{ id: 'r1' }],
      index: 0,
      scope: { type: 'pet', id: 'pet-9' },
    });
    assert.equal(params.scope, 'pet');
    assert.equal(params.scopeId, 'pet-9');
    const card = read('screens/ReelsScreen.tsx');
    assert.match(card, /openHumanProfile/);
    assert.match(card, /navigate\('PetProfile'/);
    assert.match(card, /shouldPlayReel/);
  });
});

describe('actividad like / comment', () => {
  it('genera copy coherente, no se notifica a sí mismo, destino /r/:id', () => {
    assert.equal(reelLikeActivityText(), 'le dio me gusta a tu Reel');
    assert.equal(reelCommentActivityText('hola'), 'comentó tu Reel: "hola"');
    assert.equal(shouldCreateReelActivity('owner', 'actor'), true);
    assert.equal(shouldCreateReelActivity('owner', 'owner'), false);
    assert.equal(shouldCreateReelActivity('owner', null), false);
    assert.equal(reelActivityPath('reel-1'), '/r/reel-1');
    assert.equal(reelActivityAbsoluteUrl('reel-1'), 'https://animaldex-web.pages.dev/r/reel-1');
    assert.doesNotMatch(reelActivityAbsoluteUrl('reel-1'), /animaldex\.com/);
    assert.equal(reelIdFromActivityUrl('https://animaldex-web.pages.dev/r/reel-1'), 'reel-1');
    const worker = read('worker/index.js');
    assert.match(worker, /type: 'reel_like'/);
    assert.match(worker, /type: 'reel_comment'/);
    assert.match(worker, /rl\.user_id != \?/);
    assert.match(worker, /rc\.user_id != \?/);
    const activity = read('screens/ActivityScreen.tsx');
    assert.match(activity, /n\.reelId/);
    assert.match(activity, /navigate\('ReelViewer'/);
    const payload = reelActivityPushPayload({
      type: REEL_LIKE_ACTIVITY_TYPE,
      reelId: 'reel-9',
      actorName: 'Ana',
    });
    assert.equal(payload.data.url, '/r/reel-9');
    assert.equal(payload.data.type, 'reel_like');
    assert.equal(
      reelActivityPushPayload({
        type: REEL_COMMENT_ACTIVITY_TYPE,
        reelId: 'reel-9',
        actorName: 'Ana',
        commentPreview: 'lindo',
      }).data.url,
      '/r/reel-9'
    );
  });
});

describe('seguridad profileId y pet', () => {
  it('perfil propio y empresa propia ok; empresa ajena y pet ajena rechazados', () => {
    assert.deepEqual(authorizeOwnedProfileId(null, ['p1'], 'p1'), { ok: true, profileId: 'p1' });
    assert.deepEqual(authorizeOwnedProfileId('biz-1', ['p1', 'biz-1'], 'p1'), { ok: true, profileId: 'biz-1' });
    assert.deepEqual(authorizeOwnedProfileId('ajena', ['p1', 'biz-1'], 'p1'), {
      ok: false,
      status: 403,
      error: 'Ese perfil no es tuyo',
    });
    assert.deepEqual(authorizeOwnedPetId('pet-1', ['pet-1']), { ok: true, petId: 'pet-1' });
    assert.deepEqual(authorizeOwnedPetId('pet-ajena', ['pet-1']), {
      ok: false,
      status: 403,
      error: 'Esa mascota no es tuya',
    });
    const mux = read('worker/reelsMux.js');
    assert.match(mux, /authorizeOwnedProfileId/);
    assert.match(mux, /authorizeOwnedPetId/);
    assert.equal(reelSocialActorIsAccountUser(), true);
  });
});

describe('paginación de grilla', () => {
  it('append sin duplicados y página 12', () => {
    assert.equal(REEL_GRID_PAGE, 12);
    assert.equal(clampReelGridLimit(3), 3);
    assert.equal(clampReelGridLimit(99), 24);
    const a = [{ id: '1' }, { id: '2' }];
    const b = [{ id: '2' }, { id: '3' }];
    assert.deepEqual(appendUniqueReels(a, b).map((r) => r.id), ['1', '2', '3']);
    const user = read('screens/UserProfileScreen.tsx');
    assert.match(user, /onEndReached/);
    assert.match(user, /key=\{tab === 'reels' \? 'user-reels'/);
  });
});

describe('player al abrir perfil', () => {
  it('sin foco no reproduce; volver conserva índice por params', () => {
    assert.equal(
      shouldPlayReel({
        tabFocused: false,
        reelsPageVisible: true,
        reelIsActive: true,
        appIsForeground: true,
      }),
      false
    );
    assert.equal(
      shouldPlayReel({
        tabFocused: true,
        reelsPageVisible: true,
        reelIsActive: true,
        appIsForeground: true,
      }),
      true
    );
    assert.equal(reelViewerStartIndex([{ id: 'a' }, { id: 'b' }], 'b', 0), 1);
  });
});

describe('índices locales y no-deploy', () => {
  it('003 es local y no está en ensureReelsSchema', () => {
    const mig = read('migrations/003_reels_profile_indexes.sql');
    assert.match(mig, /idx_reels_author_profile/);
    assert.match(mig, /idx_reels_pet/);
    assert.match(mig, /NO ejecutar contra D1 remoto/);
    const schema = read('lib/reelsSchema.ts');
    assert.doesNotMatch(schema, /idx_reels_author_profile/);
    const mux = read('worker/reelsMux.js');
    assert.match(mux, /action === 'profileReels'/);
    assert.match(mux, /action === 'userReels'/);
  });
});

describe('perfiles integrados', () => {
  it('personal, empresa y protector tienen Reels sin borrar secciones', () => {
    const user = read('screens/UserProfileScreen.tsx');
    const pub = read('screens/PublicProfileScreen.tsx');
    const pet = read('screens/PetProfileScreen.tsx');
    assert.match(user, /accessibilityLabel="Reels"/);
    assert.match(user, /accessibilityLabel="Publicaciones"/);
    assert.match(pub, /PROTECTOR_TABS/);
    assert.match(pub, /label: 'Mascotas'/);
    assert.match(pub, /label: 'Reels'/);
    assert.match(pet, /galleryTab/);
    assert.match(pet, /Publicaciones/);
  });
});
