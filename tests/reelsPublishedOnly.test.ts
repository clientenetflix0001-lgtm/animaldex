import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  REEL_PUBLISH_FALLBACK,
  REEL_RATE_LIMIT_MESSAGE,
  applyOwnerPollToFeed,
  canDeleteReel,
  decideOwnerReelPoll,
  filterReelsForFeed,
  getReelErrorMessage,
  planReelPublishFailure,
  reelBelongsInReelsFeed,
  reelPublishErrorMessage,
} from '../lib/reels.ts';
import { localReelMayAppearInFeed, shouldForgetLocalReelStatus } from '../lib/reelSession.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const createReel = readFileSync(join(root, 'screens/CreateReelScreen.tsx'), 'utf8');
const reelsScreen = readFileSync(join(root, 'screens/ReelsScreen.tsx'), 'utf8');
const card = readFileSync(join(root, 'components/ReelCard.tsx'), 'utf8');
const swiper = readFileSync(join(root, 'screens/FeedReelsSwiper.tsx'), 'utf8');
const app = readFileSync(join(root, 'App.tsx'), 'utf8');

describe('errores de publicación', () => {
  it('normaliza Error, string, message, error; jamás [object Object]', () => {
    assert.equal(getReelErrorMessage(new Error('x')), 'x');
    assert.equal(getReelErrorMessage('x'), 'x');
    assert.equal(getReelErrorMessage({ message: 'x' }), 'x');
    assert.equal(getReelErrorMessage({ error: 'x' }), 'x');
    assert.equal(getReelErrorMessage({ error: { message: 'x' } }), 'x');
    assert.equal(getReelErrorMessage({}), REEL_PUBLISH_FALLBACK);
    assert.equal(getReelErrorMessage({ foo: 1 }), REEL_PUBLISH_FALLBACK);
    assert.equal(getReelErrorMessage(new Error('[object Object]')), REEL_PUBLISH_FALLBACK);
    assert.equal(getReelErrorMessage({ message: { nested: true } }), REEL_PUBLISH_FALLBACK);
    for (const sample of [{}, { a: 1 }, new Error('[object Object]'), { message: {} }]) {
      const text = getReelErrorMessage(sample);
      assert.notEqual(text, '[object Object]');
      assert.equal(typeof text, 'string');
    }
    assert.doesNotMatch(createReel, /String\(e\)|`\$\{e\}`|setError\(e\)/);
    assert.match(createReel, /reelPublishErrorMessage/);
  });

  it('429 → copy específico; no pending local ni ReelCard', () => {
    const limited = Object.assign(new Error('Límite de subidas: 5/hora o 15/día'), { status: 429 });
    assert.equal(reelPublishErrorMessage(limited), REEL_RATE_LIMIT_MESSAGE);
    assert.equal(reelPublishErrorMessage({ status: 429, error: 'Límite de subidas: 5/hora o 15/día' }), REEL_RATE_LIMIT_MESSAGE);
    assert.deepEqual(planReelPublishFailure({ createdId: null, putSucceeded: false }), {
      cancel: false,
      rememberForPoll: false,
      forget: false,
    });
    assert.match(createReel, /planReelPublishFailure/);
    assert.doesNotMatch(createReel, /rememberLocalReel\(\{[\s\S]*status: 'upload_failed'/);
    assert.doesNotMatch(card, /Alcanzaste temporalmente/);
  });
});

describe('visibilidad sección Reels', () => {
  it('solo ready + playbackId; el resto no entra', () => {
    assert.equal(reelBelongsInReelsFeed({ status: 'ready', playbackId: 'pb1' }), true);
    assert.equal(reelBelongsInReelsFeed({ status: 'ready', playbackId: '' }), false);
    assert.equal(reelBelongsInReelsFeed({ status: 'ready', playbackId: null }), false);
    assert.equal(reelBelongsInReelsFeed({ status: 'uploading', playbackId: 'pb1' }), false);
    assert.equal(reelBelongsInReelsFeed({ status: 'processing', playbackId: 'pb1' }), false);
    assert.equal(reelBelongsInReelsFeed({ status: 'upload_failed', playbackId: null }), false);
    assert.equal(reelBelongsInReelsFeed({ status: 'failed', playbackId: 'pb1' }), false);
    assert.equal(reelBelongsInReelsFeed({ status: 'deleted', playbackId: 'pb1' }), false);
    assert.equal(localReelMayAppearInFeed({ id: 'x', status: 'processing', caption: '', thumbnailUri: null, createdAt: 1 }), false);
    const filtered = filterReelsForFeed([
      { id: 'ok', status: 'ready', playbackId: 'pb' },
      { id: 'up', status: 'uploading', playbackId: null },
      { id: 'pr', status: 'processing', playbackId: 'pb' },
      { id: 'fail', status: 'upload_failed', playbackId: null },
    ]);
    assert.deepEqual(filtered.map((r) => r.id), ['ok']);
    assert.match(reelsScreen, /filterReelsForFeed/);
    assert.doesNotMatch(reelsScreen, /mergeOwnerReels/);
    assert.doesNotMatch(card, /Procesando Reel/);
    assert.doesNotMatch(card, /No se pudo subir este Reel/);
  });

  it('processing no card; ready posterior sí; failed se olvida', () => {
    const feed = [{ id: 'a', status: 'ready', playbackId: 'pb' }];
    const processing = { id: 'b', status: 'processing', playbackId: null };
    assert.equal(decideOwnerReelPoll(processing), 'wait');
    assert.deepEqual(applyOwnerPollToFeed(feed, processing).map((r) => r.id), ['a']);
    const ready = { id: 'b', status: 'ready', playbackId: 'pb-new' };
    assert.equal(decideOwnerReelPoll(ready), 'show');
    assert.equal(applyOwnerPollToFeed(feed, ready)[0].id, 'b');
    assert.equal(decideOwnerReelPoll({ id: 'b', status: 'upload_failed', playbackId: null }), 'forget');
    assert.equal(shouldForgetLocalReelStatus('upload_failed'), true);
    assert.equal(shouldForgetLocalReelStatus('processing'), false);
  });
});

describe('fallos de upload y delete', () => {
  it('create OK + lectura local / PUT falla → cancel + limpiar session + no card', () => {
    assert.deepEqual(planReelPublishFailure({ createdId: 'reel-1', putSucceeded: false }), {
      cancel: true,
      rememberForPoll: false,
      forget: true,
    });
    assert.match(createReel, /forgetLocalReel/);
    assert.match(createReel, /cancelReelUpload/);
  });

  it('PUT ok y complete falla → no cancel; poll invisible; no card', () => {
    assert.deepEqual(planReelPublishFailure({ createdId: 'reel-1', putSucceeded: true }), {
      cancel: false,
      rememberForPoll: true,
      forget: false,
    });
    assert.equal(localReelMayAppearInFeed(), false);
  });

  it('ready propio elimina por menú …; failed no tiene botón en feed', () => {
    assert.equal(canDeleteReel('u1', 'u1'), true);
    assert.equal(canDeleteReel('u1', 'u2'), false);
    assert.match(card, /Más opciones/);
    assert.match(card, /Eliminar Reel/);
    assert.doesNotMatch(card, /accessibilityLabel="Eliminar Reel"/);
    assert.match(reelsScreen, /deleteReel/);
  });
});

describe('regresión navegación Inicio ↔ Reels', () => {
  it('swiper y tabs siguen compartiendo página', () => {
    assert.match(app, /planMainTabPress/);
    assert.match(app, /ReelsTabBridge/);
    assert.match(swiper, /shouldPlayFeedReels/);
  });
});
