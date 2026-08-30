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
  muxDurationRejects,
  muxHlsUrl,
  muxThumbnailUrl,
  planReelCleanup,
  playerRoleForIndex,
  reelShareUrl,
  reelUploadLimited,
  shouldPlayReel,
  shouldStartStream,
} from '../lib/reels.ts';
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
  it('29.99 y 30.00 son válidos; 30.01, 30.25 y 31.00 se rechazan', () => {
    assert.equal(muxDurationRejects(29.99), false);
    assert.equal(muxDurationRejects(30), false);
    assert.equal(muxDurationRejects(30.0), false);
    assert.equal(muxDurationRejects(30.01), true);
    assert.equal(muxDurationRejects(30.25), true);
    assert.equal(muxDurationRejects(31), true);
    assert.equal(applyMuxWebhookEvent(uploading, readyEvent(29.99)).patch.status, 'ready');
    assert.equal(applyMuxWebhookEvent(uploading, readyEvent(30.0)).patch.status, 'ready');
    assert.equal(applyMuxWebhookEvent(uploading, readyEvent(30.01)).patch.status, 'rejected');
    assert.equal(applyMuxWebhookEvent(uploading, readyEvent(30.25)).patch.status, 'rejected');
    assert.equal(applyMuxWebhookEvent(uploading, readyEvent(31)).patch.status, 'rejected');
  });

  it('cliente: 30000 ms válido, cualquier ms por encima se rechaza', () => {
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
    assert.match(reelsScreen, /\[\.\.\.prev, \.\.\.page/);
    assert.match(reelsScreen, /extraData/);
    assert.match(card, /onToggleLike/);
    assert.match(reelsScreen, /reelComment/);
    assert.equal(muxHlsUrl('abc'), 'https://stream.mux.com/abc.m3u8');
    assert.match(muxThumbnailUrl('abc'), /image\.mux\.com\/abc\/thumbnail\.webp/);
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
