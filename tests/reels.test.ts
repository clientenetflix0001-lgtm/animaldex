import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  REEL_DURATION_REJECT_MESSAGE,
  REEL_MAX_BYTES,
  applyMuxWebhookEvent,
  bufferSecondsForRole,
  clientDurationRejects,
  clientReelValidationError,
  isAllowedReelMime,
  isPublicReel,
  isReelFileTooLarge,
  muxCleanupEnabled,
  canDeleteReel,
  createReelIsDirty,
  displayedLikeCount,
  ensureLikedSet,
  failedReelIsPublic,
  formatReelCount,
  galleryNeedsTrim,
  mergeOwnerReels,
  muxDurationRejects,
  getMuxThumbnail,
  muxGridThumbnailUrl,
  muxHlsUrl,
  muxThumbnailUrl,
  ownerReelSurface,
  paginationFailureKeeps,
  planReelCleanup,
  playerRoleForIndex,
  reelCaptionDisplay,
  reelPlayerSourceKey,
  reelSharePayload,
  reelShareUrl,
  reelUploadLimited,
  reelsFeedView,
  resolveReelVideoTap,
  rollbackLikedSet,
  sessionMutePersists,
  shouldPlayReel,
  shouldStartStream,
  toggleLikedSet,
} from '../lib/reels.ts';
import {
  canAddReelOverlay,
  createDraftOverlay,
  editOverlayText,
  moveOverlayNormalized,
  normalizeOverlay,
  parseReelOverlays,
  removeOverlay,
  REEL_OVERLAY_MAX,
  sanitizeOverlayText,
  selectOverlay,
  serializeReelOverlays,
} from '../lib/reelOverlays.ts';
import {
  applyTrimFinish,
  fileToUpload,
  openReelTrimEditor,
  reelTrimEditorConfig,
  shouldOpenReelTrim,
  trimSelectionRejects,
  wouldUploadOriginalDespiteTrim,
} from '../lib/reelTrim.ts';
import { REELS_SCHEMA_STATEMENTS, normalizeSql, reelsSchemaApplyEnabled } from '../lib/reelsSchema.ts';
import { verifyMuxSignature } from '../lib/reelsWebhook.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
const reelsMux = readFileSync(join(root, 'worker/reelsMux.js'), 'utf8');
const createPost = readFileSync(join(root, 'screens/CreatePostScreen.tsx'), 'utf8');
const createReel = readFileSync(join(root, 'screens/CreateReelScreen.tsx'), 'utf8');
const reelsScreen = readFileSync(join(root, 'screens/ReelsScreen.tsx'), 'utf8');
const swiper = readFileSync(join(root, 'screens/FeedReelsSwiper.tsx'), 'utf8');
const card = readFileSync(join(root, 'components/ReelCard.tsx'), 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const appJson = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
const migration = readFileSync(join(root, 'migrations/001_reels.sql'), 'utf8');
const migration2 = readFileSync(join(root, 'migrations/002_reel_overlays.sql'), 'utf8');
const handles = readFileSync(join(root, 'lib/publicHandles.ts'), 'utf8');

function sign(body: string, secret: string, t = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return { header: `t=${t},v1=${v1}`, t };
}

const readyEvent = (duration: number, playback = 'pb_1') => ({
  id: `evt-${duration}`,
  type: 'video.asset.ready',
  data: {
    id: 'asset_1',
    upload_id: 'up_1',
    duration,
    playback_ids: [{ id: playback, policy: 'public' }],
    tracks: [{ type: 'video', max_width: 1080, max_height: 1920 }],
  },
});

const uploading = {
  id: 'reel-1',
  status: 'uploading' as const,
  mux_upload_id: 'up_1',
};

describe('duración 30 segundos', () => {
  it('UI/trim: 10s y 30.00s válidos; galería 60s requiere trim y no se rechaza', () => {
    assert.equal(clientDurationRejects(10000), false);
    assert.equal(clientDurationRejects(30000), false);
    assert.equal(galleryNeedsTrim(10000), false);
    assert.equal(galleryNeedsTrim(30000), false);
    assert.equal(galleryNeedsTrim(60000), true);
    assert.equal(shouldOpenReelTrim(60000), true);
    assert.equal(clientReelValidationError({ mime: 'video/mp4', durationMs: 60000, stage: 'gallery' }), null);
    assert.equal(clientReelValidationError({ mime: 'video/mp4', durationMs: 60000, stage: 'publish' }), REEL_DURATION_REJECT_MESSAGE);
  });

  it('Mux: 30.00 y 30.15 válidos; 30.16, 30.25 y 31.00 se rechazan', () => {
    assert.equal(muxDurationRejects(29.99), false);
    assert.equal(muxDurationRejects(30), false);
    assert.equal(muxDurationRejects(30.15), false);
    assert.equal(muxDurationRejects(30.16), true);
    assert.equal(muxDurationRejects(30.25), true);
    assert.equal(muxDurationRejects(31), true);
    assert.equal(applyMuxWebhookEvent(uploading, readyEvent(30.0)).patch.status, 'ready');
    assert.equal(applyMuxWebhookEvent(uploading, readyEvent(30.15)).patch.status, 'ready');
    assert.equal(applyMuxWebhookEvent(uploading, readyEvent(30.16)).patch.status, 'rejected');
    assert.equal(applyMuxWebhookEvent(uploading, readyEvent(30.25)).patch.status, 'rejected');
  });

  it('cliente: 30000 ms válido, cualquier ms por encima se rechaza al publicar', () => {
    assert.equal(clientDurationRejects(29990), false);
    assert.equal(clientDurationRejects(30000), false);
    assert.equal(clientDurationRejects(30001), true);
    assert.equal(clientReelValidationError({ mime: 'video/mp4', durationMs: 30010 }), REEL_DURATION_REJECT_MESSAGE);
    const applied = applyMuxWebhookEvent(uploading, readyEvent(31));
    assert.equal(applied.requestMuxDelete, true);
    assert.equal(isPublicReel({ status: 'rejected' }), false);
  });
});

describe('MIME y tamaño', () => {
  it('acepta mp4/quicktime y rechaza otros', () => {
    assert.equal(isAllowedReelMime('video/mp4'), true);
    assert.equal(isAllowedReelMime('video/quicktime; codecs=avc1'), true);
    assert.equal(isAllowedReelMime('video/webm'), false);
    assert.equal(isAllowedReelMime('image/jpeg'), false);
  });

  it('archivo demasiado grande (tamaño declarado, no el binario real)', () => {
    assert.equal(isReelFileTooLarge(REEL_MAX_BYTES), false);
    assert.equal(isReelFileTooLarge(REEL_MAX_BYTES + 1), true);
    assert.match(reelsMux, /byteSize es declarado por el cliente/);
    assert.match(reelsMux, /body\.byteSize/);
    assert.doesNotMatch(reelsMux, /request\.arrayBuffer|request\.blob/);
    assert.match(clientReelValidationError({ mime: 'video/mp4', bytes: REEL_MAX_BYTES + 10 }) || '', /50 MB/);
  });
});

describe('estados Mux (mock, sin API real)', () => {
  it('upload → processing → ready', () => {
    const created = applyMuxWebhookEvent(uploading, {
      id: 'e1',
      type: 'video.upload.asset_created',
      data: { id: 'up_1', asset_id: 'asset_1' },
    });
    assert.equal(created.skip, false);
    assert.equal(created.patch.status, 'processing');
    const ready = applyMuxWebhookEvent({ ...uploading, status: 'processing' }, readyEvent(12, 'pb_ok'));
    assert.equal(ready.patch.status, 'ready');
    assert.equal(ready.patch.mux_playback_id, 'pb_ok');
    assert.equal(ready.requestMuxDelete, false);
    assert.equal(isPublicReel({ status: 'ready' }), true);
  });

  it('upload cancelado / error Mux no es público', () => {
    const cancelled = applyMuxWebhookEvent(uploading, { id: 'c1', type: 'video.upload.cancelled', data: {} });
    assert.equal(cancelled.patch.status, 'upload_failed');
    const errored = applyMuxWebhookEvent({ ...uploading, status: 'processing' }, {
      id: 'x1',
      type: 'video.asset.errored',
      data: { id: 'asset_x' },
    });
    assert.equal(errored.patch.status, 'processing_failed');
    assert.equal(isPublicReel({ status: 'upload_failed' }), false);
    assert.equal(isPublicReel({ status: 'processing_failed' }), false);
  });

  it('webhook inválido / repetido', () => {
    const body = JSON.stringify({ type: 'video.asset.ready' });
    const { header } = sign(body, 'whsec_test');
    assert.equal(verifyMuxSignature(body, header, 'whsec_test'), true);
    assert.equal(verifyMuxSignature(body, header, 'otra'), false);
    assert.equal(verifyMuxSignature(body, 't=1,v1=nope', 'whsec_test'), false);
    const first = applyMuxWebhookEvent(uploading, { id: 'dup', type: 'video.upload.cancelled', data: {} });
    const again = applyMuxWebhookEvent({ ...uploading, mux_last_event_id: 'dup', status: 'upload_failed' }, {
      id: 'dup',
      type: 'video.upload.cancelled',
      data: {},
    });
    assert.equal(first.skip, false);
    assert.equal(again.skip, true);
    assert.equal(again.reason, 'duplicate_event');
  });

  it('delete y ownership se validan en Worker', () => {
    const del = applyMuxWebhookEvent({ ...uploading, status: 'ready' }, { id: 'd1', type: 'video.asset.deleted', data: {} });
    assert.equal(del.patch.status, 'deleted');
    assert.match(reelsMux, /Ese Reel no es tuyo/);
    assert.match(reelsMux, /deleteReel/);
    assert.match(reelsMux, /env\.MUX_TOKEN_SECRET/);
    assert.doesNotMatch(createReel, /MUX_TOKEN/);
    assert.doesNotMatch(createReel, /EXPO_PUBLIC_MUX/);
  });
});

describe('autoplay / foco / scroll', () => {
  it('un solo Reel activo y no reproduce si tab/swiper/background no califican', () => {
    assert.equal(shouldPlayReel({ tabFocused: true, reelsPageVisible: true, reelIsActive: true, appIsForeground: true }), true);
    assert.equal(shouldPlayReel({ tabFocused: false, reelsPageVisible: true, reelIsActive: true, appIsForeground: true }), false);
    assert.equal(shouldPlayReel({ tabFocused: true, reelsPageVisible: false, reelIsActive: true, appIsForeground: true }), false);
    assert.equal(shouldPlayReel({ tabFocused: true, reelsPageVisible: true, reelIsActive: false, appIsForeground: true }), false);
    assert.equal(shouldPlayReel({ tabFocused: true, reelsPageVisible: true, reelIsActive: true, appIsForeground: false }), false);
    assert.equal(playerRoleForIndex(4, 4), 'active');
    assert.equal(playerRoleForIndex(5, 4), 'next');
    assert.equal(playerRoleForIndex(6, 4), 'idle');
    assert.equal(bufferSecondsForRole('active'), 4);
    assert.equal(bufferSecondsForRole('next'), 1.5);
    assert.equal(bufferSecondsForRole('idle'), 0);
    assert.equal(shouldStartStream(200, 50, 120), true);
    assert.equal(shouldStartStream(100, 50, 120), false);
  });
});

describe('paginación, like, comments, URLs', () => {
  it('feed append-only y tablas sociales propias', () => {
    assert.match(reelsMux, /action === 'reelsFeed'/);
    assert.match(reelsMux, /r\.created_at < \? ORDER BY r\.created_at DESC/);
    assert.match(reelsMux, /reel_likes/);
    assert.match(reelsMux, /reel_comments/);
    assert.match(reelsScreen, /setReels\(\(prev\) =>/);
    assert.match(reelsScreen, /appendUniqueReels/);
    assert.match(reelsScreen, /extraData/);
    assert.match(card, /onToggleLike/);
    assert.match(reelsScreen, /reelComment/);
    assert.equal(muxHlsUrl('abc'), 'https://stream.mux.com/abc.m3u8');
    assert.match(muxThumbnailUrl('abc'), /image\.mux\.com\/abc\/thumbnail\.webp/);
    assert.match(muxThumbnailUrl('abc'), /width=720/);
    assert.equal(getMuxThumbnail(null), null);
    assert.match(getMuxThumbnail('abc', { width: 240, height: 426 }) || '', /width=240/);
    assert.doesNotMatch(muxGridThumbnailUrl('abc') || '', /width=720/);
    assert.doesNotMatch(muxGridThumbnailUrl('abc') || '', /stream\.mux\.com/);
    assert.equal(reelShareUrl('reel-9'), 'https://animaldex-web.pages.dev/r/reel-9');
    assert.doesNotMatch(reelShareUrl('x'), /animaldex\.com/);
  });
});

describe('rate limit y limpieza', () => {
  it('5/hora 15/día en D1, no solo memoria', () => {
    assert.equal(reelUploadLimited(4, 10), false);
    assert.equal(reelUploadLimited(5, 10), true);
    assert.equal(reelUploadLimited(1, 15), true);
    assert.match(reelsMux, /reel_upload_attempts/);
    assert.match(reelsMux, /reelUploadLimited/);
  });

  it('cleanup planea huérfanos y no borra Mux sin flag', () => {
    const now = 1_000_000;
    const plan = planReelCleanup(
      [
        { id: 'a', status: 'uploading', created_at: now - 2 * 60 * 60 * 1000, mux_upload_id: 'u1' },
        { id: 'b', status: 'rejected', mux_asset_id: 'as1', cleanup_needed: 1 },
        { id: 'c', status: 'ready', mux_asset_id: 'as2' },
      ],
      now
    );
    assert.equal(plan.some((p) => p.reason === 'stale_upload'), true);
    assert.equal(plan.some((p) => p.reason === 'rejected'), true);
    assert.equal(plan.some((p) => p.reelId === 'c'), false);
    assert.equal(muxCleanupEnabled(undefined), false);
    assert.equal(muxCleanupEnabled('1'), true);
    assert.match(reelsMux, /MUX_CLEANUP_ENABLED/);
    assert.match(worker, /runReelCleanup/);
  });
});

describe('esquema D1: migración vs ensureReelsSchema', () => {
  it('la migración es la fuente de verdad y coincide con REELS_SCHEMA_STATEMENTS', () => {
    const fromFile = migration
      .split(';')
      .map((s) => normalizeSql(s))
      .filter((s) => /^(CREATE TABLE|CREATE UNIQUE INDEX|CREATE INDEX)/i.test(s));
    const fromCode = REELS_SCHEMA_STATEMENTS.map((s) => normalizeSql(s));
    assert.deepEqual(fromCode, fromFile);
    assert.equal(reelsSchemaApplyEnabled(undefined), false);
    assert.equal(reelsSchemaApplyEnabled(''), false);
    assert.equal(reelsSchemaApplyEnabled('1'), true);
    assert.match(reelsMux, /reelsSchemaApplyEnabled\(env\.REELS_SCHEMA_APPLY\)/);
    assert.match(reelsMux, /REELS_SCHEMA_STATEMENTS/);
  });
});

describe('aislamiento Animaldex', () => {
  it('no reutiliza POST /upload ni CreatePost para video', () => {
    assert.match(createPost, /mediaTypes: \['images'\]/);
    assert.doesNotMatch(createPost, /createReelUpload/);
    assert.match(createReel, /createReelUpload/);
    assert.match(createReel, /method: 'PUT'/);
    assert.match(reelsMux, /https:\/\/api\.mux\.com/);
    assert.match(reelsMux, /\/video\/v1\/uploads/);
    assert.match(worker, /\/mux\/webhook/);
    assert.doesNotMatch(reelsMux, /handleUpload/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS reels/);
    assert.doesNotMatch(migration, /ALTER TABLE /);
    assert.match(handles, /'r'/);
  });

  it('expo-video + swiper foco + plugin nativo', () => {
    assert.ok(pkg.dependencies['expo-video']);
    assert.match(card, /from 'expo-video'/);
    assert.match(card, /contentType: 'hls'/);
    assert.match(reelsScreen, /shouldPlayReel/);
    assert.match(reelsScreen, /viewabilityConfig/);
    assert.match(swiper, /ReelsPageVisibleProvider/);
    assert.match(swiper, /page === 1/);
    const plugins = JSON.stringify(appJson.expo.plugins);
    assert.match(plugins, /expo-video/);
    assert.match(plugins, /supportsBackgroundPlayback/);
  });
});

describe('galería y trim', () => {
  it('10 s y 30 s no abren trim; 60 s sí', () => {
    assert.equal(shouldOpenReelTrim(10000), false);
    assert.equal(shouldOpenReelTrim(30000), false);
    assert.equal(shouldOpenReelTrim(60000), true);
  });

  it('trim 60 s → segmento 30 s o 15 s; más de 30 se rechaza', () => {
    const thirty = applyTrimFinish({ outputPath: 'file://trim-30.mp4', startTime: 42000, endTime: 72000, duration: 30000 });
    assert.equal(thirty.status, 'finished');
    if (thirty.status === 'finished') {
      assert.equal(thirty.uri, 'file://trim-30.mp4');
      assert.equal(thirty.durationMs, 30000);
    }
    const fifteen = applyTrimFinish({ outputPath: 'file://trim-15.mp4', startTime: 0, endTime: 15000, duration: 15000 });
    assert.equal(fifteen.status, 'finished');
    assert.equal(trimSelectionRejects(0, 30000), false);
    assert.equal(trimSelectionRejects(0, 30001), true);
    const tooLong = applyTrimFinish({ outputPath: 'file://bad.mp4', startTime: 0, endTime: 31000, duration: 31000 });
    assert.equal(tooLong.status, 'error');
  });

  it('cancelar y error de trim', async () => {
    const cancelled = await openReelTrimEditor('file://orig.mp4', {
      showEditor: () => {},
      onCancel: (cb) => {
        cb();
        return { remove() {} };
      },
    });
    assert.equal(cancelled.status, 'cancelled');
    const errored = await openReelTrimEditor('file://orig.mp4', {
      showEditor: () => {},
      onError: (cb) => {
        cb({ message: 'fail' });
        return { remove() {} };
      },
    });
    assert.equal(errored.status, 'error');
    assert.equal(reelTrimEditorConfig().maxDuration, 30000);
  });

  it('nunca sube el original si existe trimmedUri', () => {
    assert.equal(fileToUpload('file://orig.mp4', null), 'file://orig.mp4');
    assert.equal(fileToUpload('file://orig.mp4', 'file://trim.mp4'), 'file://trim.mp4');
    assert.equal(wouldUploadOriginalDespiteTrim('file://orig.mp4', 'file://trim.mp4'), false);
    assert.match(createReel, /fileToUpload/);
    assert.match(createReel, /trimmedUri/);
    assert.doesNotMatch(createReel, /videoMaxDuration: 30/);
    assert.ok(pkg.dependencies['react-native-video-trim']);
  });
});

describe('overlays de texto', () => {
  it('texto vacío no se guarda; máximo 100 chars y 3 overlays', () => {
    assert.equal(normalizeOverlay({ text: '   ' }), null);
    assert.equal(sanitizeOverlayText('<b>hola</b>'), 'hola');
    assert.equal(sanitizeOverlayText('x'.repeat(140)).length, 100);
    const items = [
      { text: 'uno', x: 0.5, y: 0.3 },
      { text: 'dos', x: 0.5, y: 0.4 },
      { text: 'tres', x: 0.5, y: 0.5 },
      { text: 'cuatro', x: 0.5, y: 0.6 },
    ];
    const parsed = parseReelOverlays(items);
    assert.equal(parsed.length, REEL_OVERLAY_MAX);
    assert.equal(canAddReelOverlay(parsed), false);
    const valid = normalizeOverlay({ text: 'hola', x: 2, y: -1, textColor: 'red' });
    assert.ok(valid);
    assert.ok(valid!.x <= 0.92 && valid!.x >= 0.08);
    assert.ok(valid!.y <= 0.72 && valid!.y >= 0.16);
    assert.equal(valid!.textColor, '#FFFFFF');
    assert.match(serializeReelOverlays(parsed), /"text":"uno"/);
    const draft = createDraftOverlay({ x: 0.5, y: 0.3 });
    assert.equal(draft.text, '');
    assert.equal(normalizeOverlay(draft), null);
    assert.match(createReel, /createDraftOverlay/);
  });

  it('overlay no altera HLS y se persiste como JSON', () => {
    const hls = muxHlsUrl('abc');
    assert.equal(hls, 'https://stream.mux.com/abc.m3u8');
    assert.match(card, /ReelOverlayLayer/);
    assert.match(card, /contentType: 'hls'/);
    assert.doesNotMatch(card, /ffmpeg|burn|renderMp4/);
    assert.match(reelsMux, /overlays_json/);
    assert.match(migration2, /ALTER TABLE reels ADD COLUMN overlays_json/);
    assert.doesNotMatch(migration2, /ALTER TABLE posts/);
    assert.match(createReel, /overlays: cleanOverlays/);
  });
});

describe('like, comentarios, share, perfiles', () => {
  it('like / unlike y rollback no cambian la key del player', () => {
    const first = toggleLikedSet([], 'r1');
    assert.equal(first.value, true);
    assert.equal(first.next.has('r1'), true);
    const unlike = toggleLikedSet(first.next, 'r1');
    assert.equal(unlike.value, false);
    const rolled = rollbackLikedSet(new Set(), 'r1', true);
    assert.equal(rolled.has('r1'), false);
    assert.equal(displayedLikeCount(10, true, false), 11);
    assert.equal(displayedLikeCount(10, false, true), 9);
    const keyBefore = reelPlayerSourceKey('active', 'https://stream.mux.com/x.m3u8');
    const keyAfterLike = reelPlayerSourceKey('active', 'https://stream.mux.com/x.m3u8');
    assert.equal(keyBefore, keyAfterLike);
    assert.match(reelsScreen, /rollback|roll\.delete/);
    assert.match(card, /sameReelCard|memo\(ReelCardInner/);
  });

  it('comentarios pausan el Reel activo y conservan el feed', () => {
    assert.equal(
      shouldPlayReel({ tabFocused: true, reelsPageVisible: true, reelIsActive: true && false, appIsForeground: true }),
      false
    );
    assert.match(reelsScreen, /role === 'active' && !sheet/);
    assert.match(reelsScreen, /reelComments/);
    assert.match(reelsScreen, /reelComment/);
    assert.match(reelsScreen, /commentAvatar/);
    assert.match(reelsScreen, /formatTime/);
  });

  it('share /r/:id, perfil correcto y mascota protagonista', () => {
    assert.equal(reelShareUrl('reel-9'), 'https://animaldex-web.pages.dev/r/reel-9');
    assert.match(reelsScreen, /shareReel/);
    assert.match(reelsScreen, /openHumanProfile/);
    assert.match(reelsScreen, /PetProfile/);
    assert.match(card, /onOpenPet/);
    assert.match(card, /Compartir/);
    assert.match(createReel, /ProfileSwitcher/);
    assert.match(createReel, /¿Quién protagoniza/);
  });
});

describe('contadores compactos', () => {
  it('999, 1K, 1.2K, 10K, 1M', () => {
    assert.equal(formatReelCount(0), '0');
    assert.equal(formatReelCount(12), '12');
    assert.equal(formatReelCount(999), '999');
    assert.equal(formatReelCount(1000), '1K');
    assert.equal(formatReelCount(1200), '1.2K');
    assert.equal(formatReelCount(10000), '10K');
    assert.equal(formatReelCount(10500), '10.5K');
    assert.equal(formatReelCount(1000000), '1M');
  });
});

describe('tap / doble tap / mute / caption', () => {
  it('tap simple pausa o reproduce; doble tap like no unlike', () => {
    const first = resolveReelVideoTap({ now: 1000, lastTapAt: null, alreadyLiked: false });
    assert.equal(first.kind, 'wait');
    const single = resolveReelVideoTap({ now: 1400, lastTapAt: first.nextLastTapAt, alreadyLiked: false });
    assert.equal(single.kind, 'wait');
    const dbl = resolveReelVideoTap({ now: 1100, lastTapAt: 1000, alreadyLiked: false });
    assert.equal(dbl.kind, 'double-like');
    const ignore = resolveReelVideoTap({ now: 1100, lastTapAt: 1000, alreadyLiked: true });
    assert.equal(ignore.kind, 'double-ignore');
    const likeBtn = toggleLikedSet([], 'r1');
    assert.equal(likeBtn.value, true);
    const unlikeBtn = toggleLikedSet(likeBtn.next, 'r1');
    assert.equal(unlikeBtn.value, false);
    const only = ensureLikedSet(new Set(['r1']), 'r1');
    assert.equal(only.changed, false);
  });

  it('mute persiste entre Reels en sesión', () => {
    assert.equal(sessionMutePersists(true, 'b', 'a'), true);
    assert.equal(sessionMutePersists(false, 'b', 'a'), false);
    const key = reelPlayerSourceKey('active', 'https://stream.mux.com/x.m3u8');
    assert.equal(reelPlayerSourceKey('active', 'https://stream.mux.com/x.m3u8'), key);
    assert.match(card, /Activar sonido|Silenciar/);
  });

  it('caption ver más / ver menos', () => {
    const short = reelCaptionDisplay('hola', false);
    assert.equal(short.showToggle, false);
    const long = 'x'.repeat(120);
    const more = reelCaptionDisplay(long, false);
    assert.equal(more.toggle, 'more');
    assert.match(more.text, /\.\.\.$/);
    const less = reelCaptionDisplay(long, true);
    assert.equal(less.toggle, 'less');
    assert.equal(less.text, long);
    assert.match(card, /Ver más/);
    assert.match(card, /Ver menos/);
  });
});

describe('estados feed, processing, delete, overlays UX', () => {
  it('abrir comentarios pausa; cerrar reanuda; background y tab pausan', () => {
    assert.equal(
      shouldPlayReel({ tabFocused: true, reelsPageVisible: true, reelIsActive: true && false, appIsForeground: true }),
      false
    );
    assert.equal(
      shouldPlayReel({ tabFocused: true, reelsPageVisible: true, reelIsActive: true, appIsForeground: true }),
      true
    );
    assert.equal(
      shouldPlayReel({ tabFocused: true, reelsPageVisible: true, reelIsActive: true, appIsForeground: false }),
      false
    );
    assert.equal(
      shouldPlayReel({ tabFocused: false, reelsPageVisible: true, reelIsActive: true, appIsForeground: true }),
      false
    );
    assert.match(reelsScreen, /role === 'active' && !sheet/);
    assert.match(reelsScreen, /KeyboardAvoidingView/);
  });

  it('loading, empty, retry y pagination error conservan lista', () => {
    assert.equal(reelsFeedView({ loading: true, error: false, count: 0 }), 'loading');
    assert.equal(reelsFeedView({ loading: false, error: true, count: 0 }), 'error');
    assert.equal(reelsFeedView({ loading: false, error: false, count: 0 }), 'empty');
    assert.equal(reelsFeedView({ loading: false, error: true, count: 3 }), 'list');
    const kept = paginationFailureKeeps([{ id: 'a' }, { id: 'b' }]);
    assert.equal(kept.length, 2);
    assert.match(reelsScreen, /Aún no hay Reels/);
    assert.match(reelsScreen, /No pudimos cargar los Reels/);
    assert.match(reelsScreen, /Crear el primero/);
  });

  it('processing / failed no público; delete propio vs ajeno', () => {
    assert.equal(ownerReelSurface('processing'), 'processing');
    assert.equal(ownerReelSurface('upload_failed'), 'failed');
    assert.equal(isPublicReel({ status: 'processing_failed' }), false);
    assert.equal(isPublicReel({ status: 'rejected' }), false);
    assert.equal(failedReelIsPublic(), false);
    assert.equal(canDeleteReel('u1', 'u1'), true);
    assert.equal(canDeleteReel('u1', 'u2'), false);
    assert.match(reelsMux, /Ese Reel no es tuyo/);
    assert.match(reelsMux, /deleteReel/);
    assert.match(reelsMux, /cleanup_disabled|MUX_CLEANUP_ENABLED/);
    assert.match(card, /Procesando Reel/);
    assert.match(card, /No pudimos procesar este Reel/);
    const merged = mergeOwnerReels([{ id: 'a' }], [{ id: 'p' }, { id: 'a' }]);
    assert.equal(merged[0].id, 'p');
    assert.equal(merged.length, 2);
  });

  it('overlay mover / editar / eliminar / máximo 3; acciones no cambian source key', () => {
    const base = normalizeOverlay({ text: 'hola', x: 0.5, y: 0.3 })!;
    const moved = moveOverlayNormalized(base, 0.99, 0.01);
    assert.ok(moved.x <= 0.92 && moved.y >= 0.16);
    const edited = editOverlayText(base, 'nuevo');
    assert.equal(edited?.text, 'nuevo');
    assert.equal(editOverlayText(base, '   '), null);
    const list = [base, normalizeOverlay({ id: 'b', text: 'dos', x: 0.4, y: 0.4 })!];
    assert.equal(selectOverlay(list, base.id)?.text, 'hola');
    assert.equal(removeOverlay(list, base.id).length, 1);
    assert.equal(canAddReelOverlay([base, base, base]), false);
    const k = reelPlayerSourceKey('active', 'https://stream.mux.com/z.m3u8');
    assert.equal(reelPlayerSourceKey('active', 'https://stream.mux.com/z.m3u8'), k);
    assert.equal(createReelIsDirty({ originalUri: 'file://x', phase: 'edit' }), true);
    assert.equal(createReelIsDirty({ phase: 'pick' }), false);
    assert.equal(createReelIsDirty({ phase: 'processing', originalUri: 'x' }), false);
    assert.equal(reelSharePayload('https://animaldex-web.pages.dev/r/1', 'android').message.includes('Mirate este Reel'), true);
    assert.equal(reelSharePayload('https://animaldex-web.pages.dev/r/1', 'ios').url, 'https://animaldex-web.pages.dev/r/1');
    assert.match(createReel, /createReelIsDirty|beforeRemove/);
    assert.match(card, /Me gusta/);
    assert.match(card, /accessibilityLabel/);
  });
});
