import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const app = readFileSync(join(root, 'App.tsx'), 'utf8');
const db = readFileSync(join(root, 'lib/db.ts'), 'utf8');
const types = readFileSync(join(root, 'lib/types.ts'), 'utf8');
const pkg = readFileSync(join(root, 'package.json'), 'utf8');
const petStatus = readFileSync(join(root, 'components/PetStatusAvatar.tsx'), 'utf8');
const petProfile = readFileSync(join(root, 'screens/PetProfileScreen.tsx'), 'utf8');
const myPets = readFileSync(join(root, 'screens/MyPetsScreen.tsx'), 'utf8');
const reelsLib = readFileSync(join(root, 'lib/reels.ts'), 'utf8');

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
    assert.match(viewer, /tapLeft/);
    assert.match(viewer, /tapRight/);
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
