import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  STORY_IMAGE_KIND,
  STORY_METADATA_RETENTION_MS,
  STORY_PHOTO_DURATION_MS,
  STORY_PRIVACY_BREED,
  STORY_RATE_LIMIT_PER_DAY,
  STORY_SEEN_RING,
  STORY_TTL_MS,
  STORY_UNSEEN_GRADIENT,
  STORY_VIDEO_MAX_MS,
  applyStoryMuxWebhookEvent,
  buildStoryRailItems,
  canDeleteStory,
  clientStoryVideoRejects,
  isStoryId,
  isStoryMuxPassthrough,
  nextStoryIndex,
  normalizeBreedKey,
  planStoryCleanup,
  prevStoryIndex,
  resolveStoryAudience,
  resolveStoryBreedFromPet,
  storyBreedChannel,
  storyCommentAllowed,
  storyDestinations,
  storyExpiresAt,
  storyMediaSafeToDelete,
  storyMuxDurationRejects,
  storyProgressMs,
  storyRateLimited,
  storyRingVariant,
  storyVisibleInPublicFeed,
  uniqueBreedChannelsFromPets,
} from '../lib/stories.ts';
import { STORIES_SCHEMA_STATEMENTS, storiesSchemaApplyEnabled } from '../lib/storiesSchema.ts';
import { normalizeSql } from '../lib/reelsSchema.ts';
import { colors } from '../lib/theme.ts';
import { ADOPTION_PURPLE } from '../lib/adoptionDiscovery.ts';
import { muxCleanupEnabled } from '../lib/reels.ts';
import {
  bumpStoriesRevision,
  notifyStoriesChanged,
  shouldRefreshStoryRail,
  storyPublishInvalidatesFeedPosts,
  storyPublishRequiresRelogin,
  subscribeStoriesRevision,
} from '../lib/storyRailRefresh.ts';
import {
  openStoryAuthorProfile,
  openStoryProtagonistProfile,
  resolveStoryAuthorIdentity,
  storyAuthorPressPlan,
  storyAuthorVisibleName,
} from '../lib/storyAuthor.ts';
import {
  OVERLAY_SHEET_BOTTOM_EXTRA,
  OVERLAY_SHEET_BOTTOM_MIN,
  STORY_HOLD_MIN_DURATION_MS,
  STORY_PAN_ACTIVE_OFFSET_X,
  STORY_PAN_FAIL_OFFSET_Y,
  STORY_SWIPE_MIN_DX,
  applyStoryGesture,
  clamp01,
  classifyStorySwipe,
  remainingProgressMs,
  shouldIgnoreTapAfterHold,
  storyChromeInsets,
  storyChromeTopInset,
  storyCommentsComposerPadding,
  storyExplicitSurfaceStyle,
  storyGestureChildUsesExplicitStageSize,
  storyGestureDetectorChildUsesFlexLayout,
  storyGestureHoldUsesSharedValue,
  storyGesturePausesOnTouchStart,
  storyGestureUsesDedicatedHoldAndPan,
  storyGestureUsesPressableZones,
  storyHasExplicitSurface,
  storyLayoutBoxesEqual,
  storyLayoutToBox,
  storyMediaUsesRootAbsoluteFill,
  storyProgressDurationMs,
  storyProgressUsesInterval,
  storyProgressUsesPerFrameState,
  storyStageInsets,
} from '../lib/storyViewerUi.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
const storiesWorker = readFileSync(join(root, 'worker/stories.js'), 'utf8');
const reelsMux = readFileSync(join(root, 'worker/reelsMux.js'), 'utf8');
const migration = readFileSync(join(root, 'migrations/010_stories.sql'), 'utf8');
const feed = readFileSync(join(root, 'screens/FeedScreen.tsx'), 'utf8');
const rail = readFileSync(join(root, 'components/StoryRail.tsx'), 'utf8');
const circle = readFileSync(join(root, 'components/StoryCircle.tsx'), 'utf8');
const viewer = readFileSync(join(root, 'screens/StoryViewerScreen.tsx'), 'utf8');
const composer = readFileSync(join(root, 'screens/CreateStoryScreen.tsx'), 'utf8');
const comments = readFileSync(join(root, 'components/StoryCommentsSheet.tsx'), 'utf8');
const qrScanner = readFileSync(join(root, 'screens/QRScannerScreen.tsx'), 'utf8');
const app = readFileSync(join(root, 'App.tsx'), 'utf8');
const db = readFileSync(join(root, 'lib/db.ts'), 'utf8');
const types = readFileSync(join(root, 'lib/types.ts'), 'utf8');
const pkg = readFileSync(join(root, 'package.json'), 'utf8');
const petStatus = readFileSync(join(root, 'components/PetStatusAvatar.tsx'), 'utf8');
const petProfile = readFileSync(join(root, 'screens/PetProfileScreen.tsx'), 'utf8');
const myPets = readFileSync(join(root, 'screens/MyPetsScreen.tsx'), 'utf8');
const reelsLib = readFileSync(join(root, 'lib/reels.ts'), 'utf8');
const progressUi = readFileSync(join(root, 'components/StoryProgress.tsx'), 'utf8');
const store = readFileSync(join(root, 'lib/store.tsx'), 'utf8');
const viewerUi = readFileSync(join(root, 'lib/storyViewerUi.ts'), 'utf8');

const T0 = 1_700_000_000_000;

describe('schema / expiry / assets', () => {
  it('1. expires_at = created_at + 24h servidor', () => {
    assert.equal(storyExpiresAt(T0), T0 + STORY_TTL_MS);
    assert.equal(STORY_TTL_MS, 24 * 60 * 60 * 1000);
    assert.match(storiesWorker, /storyExpiresAt\(now\)/);
    assert.doesNotMatch(storiesWorker, /expiresAt.*body/);
  });

  it('2. foto Story usa kind story y cf_id propio', () => {
    assert.equal(STORY_IMAGE_KIND, 'story');
    assert.match(storiesWorker, /STORY_IMAGE_KIND/);
    assert.match(storiesWorker, /image_cf_id/);
    assert.match(composer, /STORY_IMAGE_KIND/);
    assert.match(composer, /registerImage\(up\.url, cfId \|\| undefined, STORY_IMAGE_KIND\)/);
  });

  it('3. Mux Story asset identificable con id story-', () => {
    assert.equal(isStoryId('story-1-abc'), true);
    assert.equal(isStoryMuxPassthrough('story-1-abc'), true);
    assert.equal(isStoryId('reel-1-abc'), false);
    assert.match(storiesWorker, /passthrough: id/);
    assert.match(storiesWorker, /story-\$\{now\}/);
  });

  it('4–6. audience normal / breed / both', () => {
    const breed = storyBreedChannel('perro', 'Caniche');
    assert.equal(resolveStoryAudience('normal', breed), 'normal');
    assert.equal(resolveStoryAudience('breed', breed), 'breed');
    assert.equal(resolveStoryAudience('both', breed), 'both');
    assert.equal(resolveStoryAudience('both', null), 'normal');
  });

  it('7–8. breed_key derivado del pet; cliente no falsifica', () => {
    const derived = resolveStoryBreedFromPet({ species: 'perro', breed: 'Caniche' }, 'Labrador');
    assert.equal(derived?.breedKey, 'caniche');
    assert.equal(derived?.channelKey, 'perro:caniche');
    assert.match(storiesWorker, /resolveStoryBreedFromPet\(protagonist, body\.breed/);
  });

  it('9–10. ownership mascota y Página', () => {
    assert.match(storiesWorker, /authorizeOwnedPetId/);
    assert.match(storiesWorker, /authorizeOwnedProfileId/);
    assert.match(storiesWorker, /petAllowedForAuthorIdentity/);
    assert.match(composer, /petsForPublishingIdentity/);
  });
});

describe('rail', () => {
  it('11–14. Tu historia primero, followed unseen, razas únicas', () => {
    const items = buildStoryRailItems({
      self: { hasStory: false, hasUnseen: false },
      followed: [
        { id: 'user:b', label: 'B', hasUnseen: false, latestAt: 20 },
        { id: 'user:a', label: 'A', hasUnseen: true, latestAt: 10 },
      ],
      myBreedChannels: [
        { channel: storyBreedChannel('perro', 'Caniche')!, hasActive: true, hasUnseen: true },
        { channel: storyBreedChannel('perro', 'caniche')!, hasActive: true, hasUnseen: false },
      ],
      extraBreedCount: 2,
    });
    assert.equal(items[0].kind, 'self');
    assert.equal(items[0].label, 'Tu historia');
    assert.equal(items[1].id, 'user:a');
    assert.equal(items[2].id, 'user:b');
    const breeds = uniqueBreedChannelsFromPets([
      { species: 'perro', breed: 'Caniche' },
      { species: 'perro', breed: 'caniche' },
      { species: 'perro', breed: 'Labrador' },
    ]);
    assert.deepEqual(
      breeds.map((b) => b.channelKey),
      ['perro:caniche', 'perro:labrador']
    );
  });

  it('15. sin raza no crea canal', () => {
    const none = uniqueBreedChannelsFromPets([{ species: 'perro', breed: '' }, { species: 'perro', breed: null }]);
    assert.deepEqual(none, []);
    assert.equal(resolveStoryBreedFromPet({ species: 'perro', breed: '  ' }), null);
  });

  it('16–18. unseen gradient, seen gray, un solo ring', () => {
    assert.deepEqual(STORY_UNSEEN_GRADIENT, [colors.primary, ADOPTION_PURPLE]);
    assert.equal(STORY_SEEN_RING, '#D1D5DB');
    assert.equal(storyRingVariant(true, true), 'unseen');
    assert.equal(storyRingVariant(true, false), 'seen');
    assert.equal(storyRingVariant(false, false), 'none');
    assert.match(circle, /STORY_UNSEEN_GRADIENT/);
    assert.match(circle, /STORY_SEEN_RING/);
    assert.doesNotMatch(circle, /PET_STATUS|PetStatusAvatar|green|#2EC4|#22c55e/);
  });

  it('19. no PetStatusRing dentro StoryRail', () => {
    assert.doesNotMatch(rail, /PetStatusAvatar/);
    assert.doesNotMatch(circle, /PetStatusAvatar/);
    assert.match(feed, /<StoryRail/);
    assert.doesNotMatch(feed, /StoriesBar/);
  });
});

describe('viewer', () => {
  it('20–24. foto, video, next, previous, X', () => {
    assert.equal(storyProgressMs('image', null), STORY_PHOTO_DURATION_MS);
    assert.equal(storyProgressMs('video', 8000), 8000);
    assert.equal(storyProgressMs('video', 20000), STORY_VIDEO_MAX_MS);
    assert.equal(nextStoryIndex(0, 2), 1);
    assert.equal(nextStoryIndex(1, 2), null);
    assert.equal(prevStoryIndex(1), 0);
    assert.equal(prevStoryIndex(0), null);
    assert.match(viewer, /stageSurface/);
    assert.match(viewer, /classifyStorySwipe/);
    assert.match(viewer, /accessibilityLabel="Cerrar"/);
    assert.match(viewer, /StoryProgress/);
  });

  it('25–28. mark viewed, un video, processing/expired no visibles', () => {
    assert.match(viewer, /markStoryViewed/);
    assert.match(viewer, /staysActiveInBackground = false/);
    assert.match(storiesWorker, /status = 'ready'/);
    assert.equal(storyVisibleInPublicFeed({ status: 'processing', expiresAt: T0 + 1000 }, T0), false);
    assert.equal(storyVisibleInPublicFeed({ status: 'ready', expiresAt: T0 - 1 }, T0), false);
    assert.equal(storyVisibleInPublicFeed({ status: 'ready', expiresAt: T0 + 1 }, T0), true);
    assert.equal(storyVisibleInPublicFeed({ status: 'ready', deletedAt: 1, expiresAt: T0 + 1000 }, T0), false);
  });
});

describe('comments', () => {
  it('29–33. auth, guest, listado, username, expirada', () => {
    const active = { status: 'ready', expiresAt: T0 + 10, deletedAt: null };
    assert.deepEqual(storyCommentAllowed(active, 'u1', T0), { ok: true });
    assert.deepEqual(storyCommentAllowed(active, null, T0), { ok: false, reason: 'guest' });
    assert.deepEqual(storyCommentAllowed({ status: 'ready', expiresAt: T0 - 1 }, 'u1', T0), {
      ok: false,
      reason: 'expired',
    });
    assert.match(comments, /Escribí un comentario/);
    assert.match(comments, /\{item\.username\}/);
    assert.doesNotMatch(comments, /@\{item\.username\}/);
    assert.match(storiesWorker, /createStoryComment/);
    assert.match(storiesWorker, /Inicia sesión para continuar/);
  });
});

describe('breed', () => {
  it('34–40. canales, case, species, mestizo, sin raza, ambas', () => {
    assert.equal(storyBreedChannel('perro', 'Caniche')?.channelKey, 'perro:caniche');
    assert.equal(storyBreedChannel('perro', 'Labrador')?.channelKey, 'perro:labrador');
    assert.notEqual(storyBreedChannel('perro', 'Labrador')?.channelKey, 'perro:caniche');
    assert.equal(normalizeBreedKey('CANICHE'), normalizeBreedKey('caniche'));
    assert.equal(normalizeBreedKey('Caniche'), 'caniche');
    assert.equal(storyBreedChannel('gato', 'Siamés')?.channelKey, 'gato:siames');
    assert.notEqual(storyBreedChannel('gato', 'Caniche')?.channelKey, storyBreedChannel('perro', 'Caniche')?.channelKey);
    assert.equal(storyBreedChannel('perro', 'Mestizo')?.breedLabel, 'Mestizos');
    assert.equal(storyBreedChannel('perro', 'mestiza')?.breedKey, 'mestizo');
    assert.equal(storyBreedChannel('perro', '') , null);
    const dest = storyDestinations(storyBreedChannel('perro', 'Caniche'));
    assert.deepEqual(
      dest.map((d) => d.id),
      ['normal', 'breed', 'both']
    );
    assert.deepEqual(storyDestinations(null).map((d) => d.id), ['normal']);
  });
});

describe('cleanup', () => {
  it('41–44. planifica foto/video, no toca activas, retry si falta media', () => {
    const plan = planStoryCleanup(
      [
        { id: 'story-exp-img', expiresAt: T0 - 1, imageCfId: 'cf1' },
        { id: 'story-exp-vid', expiresAt: T0 - 1, muxAssetId: 'mux1' },
        { id: 'story-live', expiresAt: T0 + 10, imageCfId: 'cf2' },
        {
          id: 'story-old',
          expiresAt: T0 - 1,
          mediaDeletedAt: T0 - STORY_METADATA_RETENTION_MS - 1,
        },
      ],
      T0
    );
    assert.deepEqual(
      plan.map((p) => p.type + ':' + p.storyId),
      ['delete_media:story-exp-img', 'delete_media:story-exp-vid', 'purge_metadata:story-old']
    );
    assert.match(storiesWorker, /deleteCloudflareStoryImage/);
    assert.match(storiesWorker, /muxDeleteAsset/);
    assert.match(storiesWorker, /cleanup_attempts = cleanup_attempts \+ 1/);
    assert.match(storiesWorker, /last_cleanup_error/);
  });

  it('45–47. no borra Reel, avatar ni post', () => {
    assert.deepEqual(storyMediaSafeToDelete({ muxAssetId: 'a', table: 'reels' }), {
      ok: false,
      reason: 'not_story_table',
    });
    assert.deepEqual(storyMediaSafeToDelete({ imageCfId: 'x', imageKind: 'avatar' }), {
      ok: false,
      reason: 'not_story_kind',
    });
    assert.deepEqual(
      storyMediaSafeToDelete({ imageCfId: 'x', imageKind: 'story', otherTablesUsingAsset: ['posts'] }),
      { ok: false, reason: 'shared_asset' }
    );
    assert.deepEqual(storyMediaSafeToDelete({ imageCfId: 'x', imageKind: 'story' }), {
      ok: true,
      reason: 'story_image',
    });
    assert.match(storiesWorker, /FROM posts WHERE image LIKE/);
    assert.match(storiesWorker, /FROM users WHERE avatar_url LIKE/);
    assert.doesNotMatch(storiesWorker, /DELETE FROM reels/);
    assert.match(worker, /runStoryCleanup/);
    assert.match(worker, /runReelCleanup/);
    assert.match(reelsMux, /SELECT \* FROM reels WHERE/);
    assert.doesNotMatch(reelsMux, /UPDATE stories SET cleanup_needed = 0 WHERE id = \?[\s\S]*runReelCleanup/);
  });

  it('48–49. delete manual limpia media y sale del feed', () => {
    assert.equal(canDeleteStory('u1', 'u1'), true);
    assert.equal(canDeleteStory('u1', 'u2'), false);
    assert.match(storiesWorker, /status = 'deleted'/);
    assert.match(storiesWorker, /cleanupStoryMedia/);
    assert.match(viewer, /deleteStory/);
  });
});

describe('regresión', () => {
  it('50–60. Feed, Reels, Mux, PetStatus, Alertas, QR, .pet, perfiles, Adoption, Mercado, nav', () => {
    assert.match(feed, /PostCard/);
    assert.match(feed, /db\.feed/);
    assert.match(app, /name="Reels"/);
    assert.match(app, /name="CreateReel"/);
    assert.match(reelsMux, /handleMuxWebhook/);
    assert.match(reelsMux, /runReelCleanup/);
    assert.match(reelsLib, /REEL_MAX_DURATION_SEC = 30/);
    assert.equal(muxCleanupEnabled('1'), true);
    assert.match(petStatus, /petStatusRingColors/);
    assert.match(petProfile, /<PetStatusAvatar/);
    assert.match(myPets, /<PetStatusAvatar/);
    assert.match(app, /name="Alertas"/);
    assert.match(app, /name="QRScanner"/);
    assert.match(app, /name="PetProfile"/);
    assert.match(app, /name="AdoptionDiscovery"/);
    assert.match(app, /name="Mercado"/);
    assert.match(app, /name="Mascotas"/);
    assert.match(types, /CreateStory/);
    assert.match(types, /StoryViewer/);
  });
});

describe('worker / schema / seguridad', () => {
  it('migración 010 local, apply solo con flag', () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS stories/);
    assert.match(migration, /idx_stories_breed/);
    assert.match(migration, /story_views/);
    assert.match(migration, /story_comments/);
    assert.equal(storiesSchemaApplyEnabled('1'), true);
    assert.equal(storiesSchemaApplyEnabled(''), false);
    assert.match(storiesWorker, /STORIES_SCHEMA_APPLY/);
    const migrationNorm = normalizeSql(migration.split('CREATE TABLE IF NOT EXISTS stories')[1].split(';')[0]);
    const codeNorm = normalizeSql(STORIES_SCHEMA_STATEMENTS[0].replace('CREATE TABLE IF NOT EXISTS stories', ''));
    assert.ok(migrationNorm.includes('expires_at INTEGER NOT NULL'));
    assert.ok(codeNorm.includes('expires_at INTEGER NOT NULL'));
  });

  it('acciones del Worker y cliente', () => {
    for (const action of [
      'createStory',
      'createStoryUpload',
      'completeStoryUpload',
      'storyRail',
      'storyGroup',
      'storyBreedFeed',
      'markStoryViewed',
      'storyComments',
      'createStoryComment',
      'deleteStory',
    ]) {
      assert.match(storiesWorker, new RegExp(action));
      assert.match(db, new RegExp(action));
    }
  });

  it('rate limit 10/día y video 15s', () => {
    assert.equal(storyRateLimited(9), false);
    assert.equal(storyRateLimited(10), true);
    assert.equal(STORY_RATE_LIMIT_PER_DAY, 10);
    assert.equal(clientStoryVideoRejects(15000), false);
    assert.equal(clientStoryVideoRejects(15001), true);
    assert.equal(storyMuxDurationRejects(15.15), false);
    assert.equal(storyMuxDurationRejects(15.16), true);
    assert.match(composer, /Video 15s/);
  });

  it('webhook Mux distingue story de reel', () => {
    assert.match(reelsMux, /findStoryRowForMuxEvent/);
    assert.match(reelsMux, /applyStoryMuxWebhookEvent/);
    assert.match(reelsMux, /isStoryId/);
    const ready = applyStoryMuxWebhookEvent(
      { id: 'story-1', status: 'processing' },
      {
        id: 'evt',
        type: 'video.asset.ready',
        data: { id: 'asset', duration: 8, playback_ids: [{ id: 'pb' }] },
      }
    );
    assert.equal(ready.patch.status, 'ready');
    const long = applyStoryMuxWebhookEvent(
      { id: 'story-1', status: 'processing' },
      {
        id: 'evt2',
        type: 'video.asset.ready',
        data: { id: 'asset', duration: 20, playback_ids: [{ id: 'pb' }] },
      }
    );
    assert.equal(long.patch.status, 'failed');
    assert.equal(long.requestMuxDelete, true);
  });

  it('no agrega dependencia nativa nueva', () => {
    assert.match(pkg, /expo-image-picker/);
    assert.match(pkg, /expo-video/);
    assert.match(pkg, /react-native-video-trim/);
    assert.match(pkg, /expo-linear-gradient/);
    assert.doesNotMatch(pkg, /instagram|stories-kit|react-native-story/);
  });

  it('privacidad de raza y disclaimer', () => {
    assert.match(composer, /STORY_PRIVACY_BREED/);
    assert.match(STORY_PRIVACY_BREED, /públicas/);
    assert.match(comments, /STORY_NOT_VET_DISCLAIMER/);
  });

  it('AppState pausa el video', () => {
    assert.match(viewer, /AppState.addEventListener/);
    assert.match(viewer, /setPaused\(true\)/);
  });
});

describe('refresh StoryRail después de publicar', () => {
  it('1. CreateStory invalida StoryRail', () => {
    assert.match(composer, /notifyStoriesChanged\(\)/);
    assert.match(composer, /db\.createStory\(/);
    assert.match(rail, /useStoriesRevision/);
    assert.match(rail, /storiesRevision/);
    assert.match(rail, /useFocusEffect/);
    assert.match(rail, /db\.storyRail/);
  });

  it('2. foto aparece sin logout', () => {
    assert.equal(storyPublishRequiresRelogin(), false);
    const createIdx = composer.indexOf('await db.createStory({');
    const notifyIdx = composer.indexOf('notifyStoriesChanged()');
    const backIdx = composer.indexOf('navigation.goBack()');
    assert.ok(createIdx > 0 && notifyIdx > createIdx && backIdx > notifyIdx);
    assert.doesNotMatch(composer, /signOut|logout|reloadAsync/);
    assert.doesNotMatch(rail, /signOut|logout/);
  });

  it('3. breed channel refresca', () => {
    assert.match(rail, /item\.kind === 'breed'/);
    assert.match(rail, /source: 'breed'/);
    assert.match(rail, /\[load, storiesRevision\]/);
  });

  it('4. both refresca ambos', () => {
    assert.match(composer, /resolvedAudience/);
    assert.match(composer, /notifyStoriesChanged\(\)/);
    const dest = storyDestinations(storyBreedChannel('perro', 'Caniche'));
    assert.deepEqual(
      dest.map((d) => d.id),
      ['normal', 'breed', 'both']
    );
    assert.equal(shouldRefreshStoryRail(0, 1), true);
    assert.equal(shouldRefreshStoryRail(2, 2), false);
  });

  it('5. no duplica rail ni recarga Feed', () => {
    assert.match(rail, /keyExtractor=\{\(item\) => `\$\{item\.kind\}:\$\{item\.id\}`\}/);
    assert.doesNotMatch(rail, /db\.feed/);
    assert.doesNotMatch(rail, /db\.feedSince/);
    assert.equal(storyPublishInvalidatesFeedPosts(), false);
    assert.doesNotMatch(store, /notifyStoriesChanged|storiesRevision|useStoriesRevision/);
    assert.doesNotMatch(feed, /notifyStoriesChanged|useStoriesRevision|storiesRevision/);
    assert.match(feed, /<StoryRail/);
    assert.match(feed, /db\.feed/);
  });

  it('6. logout\/login no es necesario', () => {
    assert.equal(storyPublishRequiresRelogin(), false);
    assert.equal(bumpStoriesRevision(4), 5);
    let seen = 0;
    const unsub = subscribeStoriesRevision((rev) => {
      seen = rev;
    });
    const next = notifyStoriesChanged();
    unsub();
    assert.ok(next >= 1);
    assert.equal(seen, next);
    assert.equal(shouldRefreshStoryRail(0, next), true);
  });
});

describe('safe area StoryViewer', () => {
  it('5–8. insets top en chrome y bottom en stage', () => {
    assert.match(viewer, /useSafeAreaInsets/);
    assert.match(viewer, /storyStageInsets\(insets\)/);
    assert.match(viewer, /storyChromeTopInset\(insets\)/);
    assert.match(viewer, /styles\.stageShell, stage/);
    assert.deepEqual(storyStageInsets({ top: 44, bottom: 28 }), { marginTop: 0, marginBottom: 28 });
    assert.deepEqual(storyStageInsets(null), { marginTop: 0, marginBottom: 0 });
    assert.equal(storyChromeTopInset({ top: 44 }), 44);
    assert.deepEqual(storyChromeInsets({ top: 44, bottom: 28 }), { paddingTop: 44, paddingBottom: 28 });
    const closeIdx = viewer.lastIndexOf('accessibilityLabel="Cerrar"');
    const stageIdx = viewer.indexOf('styles.stageShell, stage');
    const commentIdx = viewer.indexOf('accessibilityLabel="Comentar"');
    assert.ok(stageIdx > 0 && closeIdx > stageIdx && commentIdx > stageIdx);
    assert.doesNotMatch(viewer, /paddingTop:\s*48|paddingBottom:\s*34/);
  });
});

describe('gestos StoryViewer', () => {
  it('9–11. LongPress + Pan Simultaneous; hold en SharedValue', () => {
    assert.equal(storyGestureUsesPressableZones(), false);
    assert.equal(storyGesturePausesOnTouchStart(), true);
    assert.equal(storyGestureUsesDedicatedHoldAndPan(), true);
    assert.equal(storyGestureHoldUsesSharedValue(), true);
    assert.match(viewer, /Gesture\.LongPress\(\)/);
    assert.match(viewer, /Gesture\.Pan\(\)/);
    assert.match(viewer, /Gesture\.Simultaneous\(hold, pan\)/);
    assert.match(viewer, /<GestureDetector gesture=\{storyGestures\}>/);
    assert.match(viewer, /isHolding\.value = 1/);
    assert.match(viewer, /classifyStorySwipe/);
    assert.match(viewer, /paused=\{videoPaused\}/);
    assert.doesNotMatch(viewer, /PanResponder/);
    assert.doesNotMatch(viewer, /onZonePressIn|tapLeft|delayLongPress/);
    assert.equal(shouldIgnoreTapAfterHold(true), true);
  });

  it('12–16. swipe, X y comentarios no disparan next', () => {
    assert.equal(STORY_SWIPE_MIN_DX, 60);
    assert.match(viewer, /classifyStorySwipe/);
    assert.match(viewer, /applyStoryGesture/);
    assert.match(viewer, /stageSurface/);
    assert.match(viewer, /pointerEvents="box-none"/);
    assert.match(viewer, /accessibilityLabel="Cerrar"/);
    assert.match(viewer, /setCommentsOpen\(true\)/);
    assert.equal(prevStoryIndex(0), null);
    assert.equal(nextStoryIndex(0, 1), null);
  });
});

describe('overlay inmersivo', () => {
  it('17–20. author, caption y comentarios sobre la media', () => {
    assert.match(viewer, /StyleSheet\.absoluteFill/);
    assert.match(viewer, /LinearGradient/);
    assert.match(viewer, /rgba\(0,0,0,0\.5\)/);
    assert.match(viewer, /rgba\(0,0,0,0\.45\)/);
    assert.match(viewer, /styles\.name/);
    assert.match(viewer, /styles\.caption/);
    assert.match(viewer, /styles\.commentBtn/);
    assert.match(viewer, /<StoryCommentsSheet/);
    assert.match(comments, /zIndex: 10/);
    assert.doesNotMatch(viewer, /backgroundColor: '#fff'/);
    assert.doesNotMatch(viewer, /backgroundColor: '#ffffff'/);
    assert.match(viewer, /textShadowColor/);
  });
});

describe('progreso fluido', () => {
  it('21–25. foto linear en UI thread, sin interval ni setState por frame', () => {
    assert.equal(storyProgressUsesInterval(), false);
    assert.equal(storyProgressUsesPerFrameState(), false);
    assert.equal(storyProgressDurationMs('image'), STORY_PHOTO_DURATION_MS);
    assert.equal(remainingProgressMs(0.4, 5000), 3000);
    assert.equal(remainingProgressMs(0, 5000), 5000);
    assert.equal(remainingProgressMs(1, 5000), 0);
    assert.equal(clamp01(1.4), 1);
    assert.match(viewer, /withTiming\(1, \{ duration: remaining, easing: Easing\.linear \}/);
    assert.match(viewer, /cancelAnimation\(progress\)/);
    assert.match(viewer, /useSharedValue/);
    assert.doesNotMatch(viewer, /setInterval/);
    assert.doesNotMatch(viewer, /setProgress/);
    assert.doesNotMatch(progressUi, /setInterval/);
    assert.doesNotMatch(progressUi, /setProgress/);
    assert.match(progressUi, /useAnimatedStyle/);
    assert.match(progressUi, /SharedValue/);
  });

  it('26–28. video coherente, comments y background pausan', () => {
    assert.equal(storyProgressDurationMs('video', 8000), 8000);
    assert.equal(storyProgressDurationMs('video', 20000), STORY_VIDEO_MAX_MS);
    assert.match(viewer, /reactFrozen = paused \|\| commentsOpen \|\| !appActive \|\| loading/);
    assert.match(viewer, /setCommentsOpen\(false\)/);
    assert.match(viewer, /AppState.addEventListener/);
    assert.match(viewer, /setAppActive\(state === 'active'\)/);
    assert.match(viewer, /staysActiveInBackground = false/);
    assert.match(viewer, /<StoryVideo uri=\{mediaUri\} paused=\{videoPaused\} \/>/);
  });
});

describe('clasificación de swipe Stories', () => {
  it('1. deltaX -100, deltaY 10 → NEXT', () => {
    assert.equal(classifyStorySwipe({ deltaX: -100, deltaY: 10 }), 'next');
    assert.deepEqual(applyStoryGesture('next', 1, 4), { action: 'next', nextIndex: 2 });
  });

  it('2. deltaX +100, deltaY 10 → PREVIOUS', () => {
    assert.equal(classifyStorySwipe({ deltaX: 100, deltaY: 10 }), 'previous');
    assert.deepEqual(applyStoryGesture('previous', 2, 4), { action: 'previous', nextIndex: 1 });
  });

  it('3. deltaX 20 → no navegación', () => {
    assert.equal(classifyStorySwipe({ deltaX: 20, deltaY: 0 }), 'hold');
    assert.deepEqual(applyStoryGesture('hold', 2, 4), { action: 'resume', nextIndex: 2 });
  });

  it('4. deltaX 60, deltaY 100 → no navegación horizontal', () => {
    assert.equal(classifyStorySwipe({ deltaX: 60, deltaY: 100 }), 'cancel');
    assert.deepEqual(applyStoryGesture('cancel', 2, 4), { action: 'resume', nextIndex: 2 });
  });

  it('5–6. primera + previous permanece; última + next cierra', () => {
    assert.deepEqual(applyStoryGesture('previous', 0, 3), { action: 'stay', nextIndex: 0 });
    assert.deepEqual(applyStoryGesture('next', 2, 3), { action: 'close', nextIndex: 2 });
  });

  it('7–9. touch start pausa; sin swipe resume; con swipe navega', () => {
    assert.equal(storyGesturePausesOnTouchStart(), true);
    assert.match(viewer, /\.onBegin\(/);
    assert.match(viewer, /isHolding\.value = 1/);
    assert.match(viewer, /runOnJS\(onPanEnd\)\(event\.translationX, event\.translationY\)/);
    assert.equal(classifyStorySwipe({ deltaX: 0, deltaY: 0 }), 'hold');
    assert.equal(classifyStorySwipe({ deltaX: -80, deltaY: 5 }), 'next');
    assert.equal(STORY_SWIPE_MIN_DX, 60);
  });

  it('10–11. progreso no usa interval; commentsOpen desactiva swipe', () => {
    assert.equal(storyProgressUsesInterval(), false);
    assert.equal(classifyStorySwipe({ deltaX: -100, deltaY: 0, commentsOpen: true }), 'cancel');
    assert.match(viewer, /reactFrozen = paused \|\| commentsOpen \|\| !appActive \|\| loading/);
    assert.match(viewer, /\.enabled\(!commentsOpen\)/);
    assert.match(viewer, /commentsOpenRef\.current/);
  });
});

describe('GestureDetector StoryViewer A–K', () => {
  it('A. touch begin → paused', () => {
    assert.equal(storyGesturePausesOnTouchStart(), true);
    assert.match(viewer, /\.onBegin\(/);
    assert.match(viewer, /isHolding\.value = 1/);
    assert.match(viewer, /\.minDuration\(STORY_HOLD_MIN_DURATION_MS\)/);
    assert.doesNotMatch(viewer, /activateAfterLongPress|delayLongPress|STORY_HOLD_DELAY_MS/);
  });

  it('B. mantener sin mover → continúa paused', () => {
    assert.equal(classifyStorySwipe({ deltaX: 0, deltaY: 0 }), 'hold');
    assert.match(viewer, /reactFrozen = paused \|\| commentsOpen \|\| !appActive \|\| loading/);
    assert.match(viewer, /<StoryVideo uri=\{mediaUri\} paused=\{videoPaused\} \/>/);
    assert.doesNotMatch(viewer, /onPanResponderGrant|PanResponder\.create/);
  });

  it('C. release sin swipe → resume', () => {
    assert.equal(classifyStorySwipe({ deltaX: 0, deltaY: 0 }), 'hold');
    assert.deepEqual(applyStoryGesture('hold', 1, 3), { action: 'resume', nextIndex: 1 });
    assert.match(viewer, /\.onFinalize\(/);
    assert.match(viewer, /isHolding\.value = 0/);
  });

  it('D. translationX -80 → next', () => {
    assert.equal(classifyStorySwipe({ deltaX: -80, deltaY: 0 }), 'next');
    assert.deepEqual(applyStoryGesture('next', 0, 3), { action: 'next', nextIndex: 1 });
  });

  it('E. translationX +80 → previous', () => {
    assert.equal(classifyStorySwipe({ deltaX: 80, deltaY: 0 }), 'previous');
    assert.deepEqual(applyStoryGesture('previous', 2, 3), { action: 'previous', nextIndex: 1 });
  });

  it('F. translationX 20 → stay/resume', () => {
    assert.equal(classifyStorySwipe({ deltaX: 20, deltaY: 0 }), 'hold');
    assert.deepEqual(applyStoryGesture('hold', 1, 3), { action: 'resume', nextIndex: 1 });
  });

  it('G. movimiento vertical dx=30 dy=100 → no cambiar Story', () => {
    assert.equal(classifyStorySwipe({ deltaX: 30, deltaY: 100 }), 'hold');
    assert.deepEqual(applyStoryGesture('hold', 1, 3), { action: 'resume', nextIndex: 1 });
    assert.equal(classifyStorySwipe({ deltaX: 60, deltaY: 100 }), 'cancel');
    assert.deepEqual(applyStoryGesture('cancel', 1, 3), { action: 'resume', nextIndex: 1 });
  });

  it('H. primera + previous → stay', () => {
    assert.deepEqual(applyStoryGesture('previous', 0, 3), { action: 'stay', nextIndex: 0 });
    assert.equal(prevStoryIndex(0), null);
  });

  it('I. última + next → cierre del grupo', () => {
    assert.deepEqual(applyStoryGesture('next', 2, 3), { action: 'close', nextIndex: 2 });
    assert.equal(nextStoryIndex(2, 3), null);
    assert.match(viewer, /result\.action === 'close'/);
    assert.match(viewer, /go\(null\)/);
  });

  it('J. commentsOpen → Story frozen y Gesture no navega', () => {
    assert.equal(classifyStorySwipe({ deltaX: -80, deltaY: 0, commentsOpen: true }), 'cancel');
    assert.deepEqual(applyStoryGesture('cancel', 1, 3), { action: 'resume', nextIndex: 1 });
    assert.match(viewer, /reactFrozen = paused \|\| commentsOpen \|\| !appActive \|\| loading/);
    assert.match(viewer, /\.enabled\(!commentsOpen\)/);
  });

  it('K. barra conserva progreso después de hold', () => {
    assert.equal(remainingProgressMs(0.4, 5000), 3000);
    assert.equal(clamp01(0.42), 0.42);
    assert.match(viewer, /remainingProgressMs\(progress\.value, duration\)/);
    assert.match(viewer, /cancelAnimation\(progress\)/);
    assert.doesNotMatch(viewer.slice(viewer.indexOf('onFinalize'), viewer.indexOf('onFinalize') + 280), /progress\.value = 0/);
  });

  it('sin HUD ni telemetría visual de gestos', () => {
    assert.equal(existsSync(join(root, 'lib/storyGestureDebug.ts')), false);
    assert.equal(existsSync(join(root, 'components/StoryGestureDebugHud.tsx')), false);
    assert.doesNotMatch(viewer, /StoryGestureDebugHud|GESTURE-V[4-8]|expo-updates|Updates\./);
    assert.doesNotMatch(viewer, /debugDx|debugHold|debugPan|debugOn|debugAction/);
    assert.doesNotMatch(storiesWorker, /GESTURE-V5|storyGestureDebug/);
    assert.doesNotMatch(worker, /GESTURE-V5|storyGestureDebug/);
    assert.doesNotMatch(migration, /GESTURE-V5|storyGestureDebug/);
    assert.match(pkg, /"react-native-gesture-handler": "\^3\.1\.0"/);
  });
});

describe('Stories V8 productivo sin HUD', () => {
  it('no queda telemetría visual ni archivos de diagnóstico', () => {
    assert.equal(existsSync(join(root, 'lib/storyGestureDebug.ts')), false);
    assert.equal(existsSync(join(root, 'components/StoryGestureDebugHud.tsx')), false);
    assert.doesNotMatch(viewer, /StoryGestureDebugHud|GESTURE-V[4-8]|expo-updates|Updates\./);
    assert.doesNotMatch(viewer, /debugDx|debugHold|debugPan|debugOn|debugAction|debugSolid/);
    assert.doesNotMatch(storiesWorker, /GESTURE-V5|storyGestureDebug/);
    assert.doesNotMatch(worker, /GESTURE-V5|storyGestureDebug/);
    assert.doesNotMatch(migration, /GESTURE-V5|storyGestureDebug/);
  });

  it('hijo directo con tamaño explícito del stage; media real', () => {
    assert.equal(storyGestureDetectorChildUsesFlexLayout(), false);
    assert.equal(storyGestureChildUsesExplicitStageSize(), true);
    const detector = viewer.slice(viewer.indexOf('<GestureDetector'), viewer.indexOf('</GestureDetector>'));
    assert.match(detector, /<View/);
    assert.doesNotMatch(detector, /<Animated\.View/);
    assert.match(detector, /styles\.stageSurface, surfaceStyle/);
    assert.match(viewer, /storyExplicitSurfaceStyle\(stageBox\)/);
    assert.match(detector, /<StoryVideo/);
    assert.match(detector, /pointerEvents="none"/);
    assert.doesNotMatch(detector, /gestureSurface/);
    assert.doesNotMatch(viewer, /\[commentsOpen, .*paused\]/);
  });

  it('gestos productivos sin setState por frame', () => {
    assert.match(viewer, /\.onBegin\(/);
    assert.match(viewer, /\.onEnd\(/);
    assert.match(viewer, /\.onFinalize\(/);
    assert.match(viewer, /isHolding\.value = 1/);
    assert.match(viewer, /runOnJS\(onPanEnd\)\(event\.translationX, event\.translationY\)/);
    const endBlock = viewer.slice(viewer.lastIndexOf('.onEnd'), viewer.lastIndexOf('.onFinalize'));
    assert.doesNotMatch(endBlock, /setPaused|setState|setDebugAction/);
    assert.equal(classifyStorySwipe({ deltaX: -80, deltaY: 0 }), 'next');
    assert.deepEqual(applyStoryGesture('next', 0, 3), { action: 'next', nextIndex: 1 });
  });
});

describe('hit target + arquitectura Gemini', () => {
  it('superficie explícita; height 0 queda rechazada', () => {
    assert.deepEqual(storyExplicitSurfaceStyle({ x: 0, y: 0, width: 360, height: 752 }), {
      width: 360,
      height: 752,
      flexGrow: 0,
      flexShrink: 0,
    });
    assert.equal(storyHasExplicitSurface({ x: 0, y: 0, width: 360, height: 752 }), true);
    assert.equal(storyHasExplicitSurface({ x: 0, y: 752, width: 360, height: 0 }), false);
    assert.equal(storyHasExplicitSurface({ x: 0, y: 752, width: 360, height: 38 }), false);
    assert.equal(storyGestureChildUsesExplicitStageSize(), true);
    assert.equal(storyGestureDetectorChildUsesFlexLayout(), false);
    assert.match(viewer, /storyExplicitSurfaceStyle\(stageBox\)/);
    assert.match(viewer, /styles\.stageShell/);
    assert.match(viewer, /styles\.stageSurface/);
    assert.doesNotMatch(viewer, /gestureSurface/);
    const detector = viewer.slice(viewer.indexOf('<GestureDetector'), viewer.indexOf('</GestureDetector>'));
    assert.doesNotMatch(detector, /flex: 1/);
    assert.doesNotMatch(detector, /style=\{styles\.gestureSurface\}/);
  });

  it('stage medido fuera del detector; media normal', () => {
    assert.equal(storyLayoutBoxesEqual({ x: 0, y: 0, width: 360, height: 752 }, { x: 0, y: 0, width: 360, height: 752 }), true);
    assert.equal(storyLayoutBoxesEqual({ x: 0, y: 0, width: 360, height: 752 }, { x: 0, y: 752, width: 360, height: 0 }), false);
    assert.deepEqual(storyLayoutToBox({ x: 0, y: 0, width: 360.4, height: 752.2 }), { x: 0, y: 0, width: 360.4, height: 752.2 });
    assert.match(viewer, /setStageBox\(\(prev\) => \(storyLayoutBoxesEqual\(prev, next\) \? prev : next\)\)/);
    assert.doesNotMatch(viewer, /setTouchBox|StoryGestureDebugHud/);
    assert.match(viewer, /<StoryVideo uri=\{mediaUri\} paused=\{videoPaused\} \/>/);
  });

  it('LongPress + Pan Simultaneous; onEnd navega; onFinalize cleanup', () => {
    assert.equal(STORY_HOLD_MIN_DURATION_MS, 0);
    assert.equal(STORY_PAN_ACTIVE_OFFSET_X, 15);
    assert.equal(STORY_PAN_FAIL_OFFSET_Y, 40);
    assert.match(viewer, /Gesture\.LongPress\(\)/);
    assert.match(viewer, /\.minDuration\(STORY_HOLD_MIN_DURATION_MS\)/);
    assert.match(viewer, /\.maxDistance\(9999\)/);
    assert.match(viewer, /\.activeOffsetX\(\[-STORY_PAN_ACTIVE_OFFSET_X, STORY_PAN_ACTIVE_OFFSET_X\]\)/);
    assert.match(viewer, /\.failOffsetY\(\[-STORY_PAN_FAIL_OFFSET_Y, STORY_PAN_FAIL_OFFSET_Y\]\)/);
    assert.match(viewer, /Gesture\.Simultaneous\(hold, pan\)/);
    assert.match(viewer, /runOnJS\(onPanEnd\)/);
    assert.match(viewer, /suppressResume\.value = 1/);
    const finalizeStart = viewer.lastIndexOf('.onFinalize');
    const finalizeBlock = viewer.slice(finalizeStart, finalizeStart + 90);
    assert.match(finalizeBlock, /isHolding\.value = 0/);
    assert.doesNotMatch(finalizeBlock, /onPanEnd\(|go\(/);
  });

  it('hold no usa setPaused; video via reaction; comments deshabilitan', () => {
    assert.match(viewer, /useAnimatedReaction/);
    assert.match(viewer, /runOnJS\(setHoldingJs\)\(true\)/);
    assert.match(viewer, /paused=\{videoPaused\}/);
    assert.match(viewer, /\.enabled\(!commentsOpen\)/);
  });

  it('chrome box-none; media pointerEvents none', () => {
    assert.match(viewer, /styles\.topChrome, \{ paddingTop: chromeTop \}\]\} pointerEvents="box-none"/);
    assert.match(viewer, /styles\.bottomChrome\} pointerEvents="box-none"/);
    assert.match(viewer, /styles\.media\} pointerEvents="none"/);
    assert.match(viewer, /styles\.topFade\} pointerEvents="none"/);
    assert.match(viewer, /styles\.bottomFade\} pointerEvents="none"/);
    assert.doesNotMatch(app, /name="StoryViewer"[\s\S]*gestureEnabled:\s*true/);
    assert.match(app, /name="StoryViewer"[\s\S]*headerShown: false, animation: 'fade'/);
  });
});

describe('Samsung: media, responder y comentarios', () => {
  it('A. bottom inset en stage; top inset en chrome', () => {
    assert.match(viewer, /storyStageInsets\(insets\)/);
    assert.match(viewer, /storyChromeTopInset\(insets\)/);
    assert.deepEqual(storyStageInsets({ top: 52, bottom: 24 }), { marginTop: 0, marginBottom: 24 });
    assert.equal(storyChromeTopInset({ top: 52 }), 52);
    assert.match(viewerUi, /marginBottom/);
  });

  it('B. media no usa absoluteFill de la raíz; GestureDetector cubre el stage', () => {
    assert.equal(storyMediaUsesRootAbsoluteFill(), false);
    assert.match(viewer, /styles\.stageSurface/);
    assert.match(viewer, /storyExplicitSurfaceStyle\(stageBox\)/);
    assert.match(viewer, /<GestureDetector gesture=\{storyGestures\}>/);
    assert.match(viewer, /pointerEvents="none"/);
    assert.match(viewer, /stageShell: \{ flex: 1/);
    assert.doesNotMatch(viewer, /tapLeft|tapRight|onZonePressIn|PanResponder/);
  });

  it('H–I. X y Comentar no disparan navegación', () => {
    assert.match(viewer, /topChrome/);
    assert.match(viewer, /bottomChrome/);
    const xBlock = viewer.slice(viewer.lastIndexOf('accessibilityLabel="Cerrar"') - 80, viewer.lastIndexOf('accessibilityLabel="Cerrar"') + 40);
    assert.match(xBlock, /onPress=\{close\}/);
    assert.doesNotMatch(xBlock, /onTouchEnd|onTapRight|onTapLeft/);
    const commentBlock = viewer.slice(viewer.indexOf('accessibilityLabel="Comentar"') - 120, viewer.indexOf('accessibilityLabel="Comentar"') + 20);
    assert.match(commentBlock, /setCommentsOpen\(true\)/);
    assert.doesNotMatch(commentBlock, /onTouchEnd|onTapRight|onTapLeft/);
  });

  it('J–K. progreso sigue Reanimated y sin setInterval', () => {
    assert.match(viewer, /withTiming\(1, \{ duration: remaining, easing: Easing\.linear \}/);
    assert.match(progressUi, /useAnimatedStyle/);
    assert.doesNotMatch(viewer, /setInterval/);
    assert.doesNotMatch(progressUi, /setInterval/);
    assert.equal(storyProgressUsesInterval(), false);
  });

  it('L. refresh después de publicar sigue intacto', () => {
    assert.match(composer, /notifyStoriesChanged\(\)/);
    assert.match(rail, /useStoriesRevision/);
    assert.match(rail, /useFocusEffect/);
    assert.match(rail, /\[load, storiesRevision\]/);
    assert.equal(storyPublishInvalidatesFeedPosts(), false);
  });

  it('StatusBar light y comentarios con patrón QR overlay', () => {
    assert.match(viewer, /StatusBar style="light"/);
    assert.match(viewer, /setBarStyle\('light-content'/);
    assert.match(viewer, /setBarStyle\('dark-content'/);
    assert.match(comments, /useSafeAreaInsets/);
    assert.match(comments, /storyCommentsComposerPadding/);
    assert.match(comments, /behavior="padding"/);
    assert.match(comments, /styles\.sheet, \{ paddingBottom: composerPad \}/);
    assert.match(qrScanner, /Math\.max\(insets\.bottom \+ 12, 20\)/);
    assert.match(app, /paddingBottom: bottomInset \+ 6/);
    assert.equal(OVERLAY_SHEET_BOTTOM_EXTRA, 12);
    assert.equal(OVERLAY_SHEET_BOTTOM_MIN, 20);
    assert.equal(storyCommentsComposerPadding({ bottom: 36 }), 48);
    assert.equal(storyCommentsComposerPadding({ bottom: 0 }), 20);
    assert.ok(storyCommentsComposerPadding({ bottom: 0 }) > 0);
    assert.match(comments, /accessibilityLabel="Publicar comentario"|name="send"/);
    assert.doesNotMatch(comments, /paddingBottom:\s*48|Samsung/);
  });
});

describe('identidad visible del autor en Stories', () => {
  const personal = {
    authorUserId: 'u1',
    username: '@lucasfuentes',
    userName: 'Lucas Fuentes',
    userAvatar: 'me.jpg',
  };
  const company = {
    authorUserId: 'u1',
    username: 'lucasfuentes',
    userName: 'Lucas Fuentes',
    userAvatar: 'me.jpg',
    authorProfileId: 'biz1',
    authorProfileType: 'business',
    authorProfileName: 'Tienda Rocky',
    authorProfileUsername: 'tiendarocky',
    authorProfileAvatar: 'shop.jpg',
  };
  const protector = {
    authorUserId: 'u1',
    username: 'lucasfuentes',
    userName: 'Lucas Fuentes',
    userAvatar: 'me.jpg',
    authorProfileId: 'p1',
    authorProfileType: 'protector',
    authorProfileName: 'APAN Salta',
    authorProfileUsername: 'apansalta',
    authorProfileAvatar: 'apan.jpg',
    protagonistPetId: 'good1',
    protagonistName: 'Good',
    protagonistAvatar: 'good.jpg',
    breedLabel: 'Caniche',
  };
  const petAuthor = {
    authorUserId: 'u1',
    username: 'lucasfuentes',
    userName: 'Lucas Fuentes',
    userAvatar: 'me.jpg',
    authorPetId: 'pet1',
    authorPetName: 'Rocky',
    authorPetUsername: 'rockys.pet',
    authorPetAvatar: 'rocky.jpg',
  };

  it('1. Story personal → avatar + username personal', () => {
    const author = resolveStoryAuthorIdentity(personal);
    assert.equal(author.kind, 'personal');
    assert.equal(author.username, 'lucasfuentes');
    assert.equal(author.avatarUrl, 'me.jpg');
    assert.equal(storyAuthorVisibleName(personal), 'lucasfuentes');
    assert.doesNotMatch(storyAuthorVisibleName(personal), /^@/);
  });

  it('2. Story empresa → avatar + username empresa', () => {
    const author = resolveStoryAuthorIdentity(company);
    assert.equal(author.kind, 'profile');
    assert.equal(author.username, 'tiendarocky');
    assert.equal(author.avatarUrl, 'shop.jpg');
    assert.equal(storyAuthorVisibleName(company), 'tiendarocky');
  });

  it('3. Story Bienestar Animal → avatar + username Página', () => {
    const author = resolveStoryAuthorIdentity(protector);
    assert.equal(author.kind, 'profile');
    assert.equal(author.username, 'apansalta');
    assert.equal(author.avatarUrl, 'apan.jpg');
    assert.equal(author.profileType, 'protector');
  });

  it('4. Story mascota → avatar + username .pet', () => {
    const author = resolveStoryAuthorIdentity(petAuthor);
    assert.equal(author.kind, 'pet');
    assert.equal(author.username, 'rockys.pet');
    assert.equal(author.avatarUrl, 'rocky.jpg');
    assert.equal(storyAuthorVisibleName(petAuthor), 'rockys.pet');
  });

  it('5. Página no muestra nombre del owner personal', () => {
    assert.notEqual(storyAuthorVisibleName(protector), 'lucasfuentes');
    assert.notEqual(storyAuthorVisibleName(company), 'Lucas Fuentes');
    assert.equal(resolveStoryAuthorIdentity(protector).username, 'apansalta');
  });

  it('6. avatar y username pertenecen a la misma identidad', () => {
    for (const story of [personal, company, protector, petAuthor]) {
      const author = resolveStoryAuthorIdentity(story);
      if (author.kind === 'personal') {
        assert.equal(author.username, 'lucasfuentes');
        assert.equal(author.avatarUrl, story.userAvatar);
      }
      if (author.kind === 'profile') {
        assert.equal(author.avatarUrl, story.authorProfileAvatar);
        assert.equal(author.username, story.authorProfileUsername);
      }
      if (author.kind === 'pet') {
        assert.equal(author.avatarUrl, story.authorPetAvatar);
        assert.equal(author.username, story.authorPetUsername);
      }
    }
    assert.match(viewer, /resolveStoryAuthorIdentity\(current\)/);
    assert.match(viewer, /author\?\.avatarUrl/);
    assert.doesNotMatch(viewer, /current\.username \|\| current\.authorPetName/);
    assert.doesNotMatch(viewer, /current\.protagonistAvatar/);
  });

  it('7. tap autor personal → perfil personal', () => {
    const calls: Array<{ name: string; params?: Record<string, unknown> }> = [];
    openStoryAuthorProfile({ navigate: (name, params) => calls.push({ name, params }) }, personal);
    assert.deepEqual(calls, [{ name: 'PublicProfile', params: { username: 'lucasfuentes' } }]);
  });

  it('8. tap empresa → PublicProfile', () => {
    const calls: Array<{ name: string; params?: Record<string, unknown> }> = [];
    openStoryAuthorProfile({ navigate: (name, params) => calls.push({ name, params }) }, company);
    assert.deepEqual(calls, [{ name: 'PublicProfile', params: { username: 'tiendarocky' } }]);
  });

  it('9. tap Bienestar Animal → PublicProfile', () => {
    const calls: Array<{ name: string; params?: Record<string, unknown> }> = [];
    openStoryAuthorProfile({ navigate: (name, params) => calls.push({ name, params }) }, protector);
    assert.deepEqual(calls, [{ name: 'PublicProfile', params: { username: 'apansalta' } }]);
  });

  it('10. tap mascota → PetProfile', () => {
    const calls: Array<{ name: string; params?: Record<string, unknown> }> = [];
    openStoryAuthorProfile({ navigate: (name, params) => calls.push({ name, params }) }, petAuthor);
    assert.deepEqual(calls, [{ name: 'PetProfile', params: { petId: 'pet1' } }]);
  });

  it('11. tocar autor no dispara swipe', () => {
    const plan = storyAuthorPressPlan(protector);
    assert.equal(plan.swipe, false);
    assert.equal(plan.advance, false);
    const detector = viewer.slice(viewer.indexOf('<GestureDetector'), viewer.indexOf('</GestureDetector>'));
    assert.doesNotMatch(detector, /Ver perfil del autor/);
    assert.match(viewer, /topChrome[\s\S]*accessibilityLabel="Ver perfil del autor"/);
    assert.match(viewer, /onPress=\{openAuthor\}/);
    assert.doesNotMatch(viewer, /openAuthor[\s\S]{0,80}go\(|openAuthor[\s\S]{0,80}advance\(/);
  });

  it('12. tocar autor pausa Story', () => {
    assert.equal(storyAuthorPressPlan(company).pause, true);
    assert.match(viewer, /const openAuthor = useCallback\(\(\) => \{[\s\S]*setPaused\(true\)/);
    assert.match(viewer, /useFocusEffect/);
  });

  it('13. video no sigue sonando al navegar', () => {
    assert.match(viewer, /staysActiveInBackground = false/);
    assert.match(viewer, /<StoryVideo uri=\{mediaUri\} paused=\{videoPaused\} \/>/);
    assert.match(viewer, /videoPaused = reactFrozen \|\| holdingJs/);
    assert.match(viewer, /openAuthor = useCallback\(\(\) => \{[\s\S]*setPaused\(true\);[\s\S]*openStoryAuthorProfile/);
    assert.match(viewer, /useFocusEffect\(\s*useCallback\(\(\) => \{\s*setPaused\(false\);\s*return \(\) => \{\s*setPaused\(true\);/);
  });

  it('14. protagonista no reemplaza identidad del autor', () => {
    const author = resolveStoryAuthorIdentity(protector);
    assert.equal(author.username, 'apansalta');
    assert.equal(author.avatarUrl, 'apan.jpg');
    assert.notEqual(author.avatarUrl, protector.protagonistAvatar);
    assert.notEqual(author.username, 'Good');
    const calls: Array<{ name: string; params?: Record<string, unknown> }> = [];
    openStoryAuthorProfile({ navigate: (name, params) => calls.push({ name, params }) }, protector);
    assert.equal(calls[0]?.name, 'PublicProfile');
    assert.notEqual(calls[0]?.params?.petId, 'good1');
    calls.length = 0;
    openStoryProtagonistProfile({ navigate: (name, params) => calls.push({ name, params }) }, protector);
    assert.deepEqual(calls, [{ name: 'PetProfile', params: { petId: 'good1' } }]);
    assert.match(viewer, /subline/);
    assert.match(viewer, /Ver perfil del protagonista/);
  });

  it('15. backend\/schema sin migration', () => {
    assert.match(storiesWorker, /authorPetUsername: r\.author_pet_username \|\| null/);
    assert.match(storiesWorker, /pet\.username AS author_pet_username/);
    assert.match(db, /authorPetUsername\?: string \| null/);
    assert.doesNotMatch(storiesWorker, /ALTER TABLE stories/);
    assert.doesNotMatch(migration, /author_visible|CREATE TABLE stories_author/);
    assert.equal(storiesSchemaApplyEnabled(''), false);
    assert.equal(STORIES_SCHEMA_STATEMENTS.some((sql) => /ALTER TABLE/i.test(sql)), false);
    assert.match(viewer, /Gesture\.Simultaneous\(hold, pan\)/);
    assert.match(viewer, /styles\.stageShell/);
  });
});

describe('regresión Stories viewer\/refresh', () => {
  it('29–37. expiración, breed, delete, comments, Feed, Reels, QR, PetStatus', () => {
    assert.equal(STORY_TTL_MS, 24 * 60 * 60 * 1000);
    assert.match(viewer, /STORY_EXPIRED_MESSAGE/);
    assert.equal(storyVisibleInPublicFeed({ status: 'ready', expiresAt: T0 + STORY_TTL_MS }, T0), true);
    assert.match(rail, /kind === 'breed'/);
    assert.match(composer, /STORY_PRIVACY_BREED/);
    assert.match(viewer, /deleteStory/);
    assert.match(viewer, /notifyStoriesChanged/);
    assert.match(comments, /createStoryComment|Escribí un comentario/);
    assert.match(feed, /PostCard/);
    assert.match(app, /name="Reels"/);
    assert.match(app, /name="QRScanner"/);
    assert.match(petStatus, /petStatusRingColors/);
    assert.doesNotMatch(rail, /PetStatusAvatar/);
  });
});
