import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeLocalFileUri } from '../lib/reelUri.ts';
import {
  applyTrimFinish,
  fileToUpload,
  wouldUploadOriginalDespiteTrim,
} from '../lib/reelTrim.ts';
import {
  ownerReelFailedCopy,
  ownerReelSurface,
  reelPublishErrorMessage,
  REEL_RATE_LIMIT_MESSAGE,
  reelUploadSource,
  shouldCancelReelAfterPublishError,
} from '../lib/reels.ts';
import {
  planMainTabPress,
  resolvedMainTab,
  shouldHighlightTab,
  shouldPlayFeedReels,
} from '../lib/feedReelsNav.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const createReel = readFileSync(join(root, 'screens/CreateReelScreen.tsx'), 'utf8');
const app = readFileSync(join(root, 'App.tsx'), 'utf8');
const swiper = readFileSync(join(root, 'screens/FeedReelsSwiper.tsx'), 'utf8');

describe('BUG 1: URI del trim Android', () => {
  it('path crudo Android → file:// válido; no duplica file://', () => {
    const raw = '/data/user/0/com.lucasap123.animaldex/files/trimmedVideo_1788063348.mp4';
    assert.equal(normalizeLocalFileUri(raw), `file://${raw}`);
    assert.equal(
      normalizeLocalFileUri('file:///data/user/0/com.lucasap123.animaldex/files/trimmedVideo.mp4'),
      'file:///data/user/0/com.lucasap123.animaldex/files/trimmedVideo.mp4'
    );
    assert.equal(
      normalizeLocalFileUri('content://media/external/video/media/44'),
      'content://media/external/video/media/44'
    );
    assert.equal(normalizeLocalFileUri('https://example.com/a.mp4'), 'https://example.com/a.mp4');
    assert.equal(normalizeLocalFileUri('http://example.com/a.mp4'), 'http://example.com/a.mp4');
    assert.equal(normalizeLocalFileUri('file:/data/user/0/x.mp4'), 'file:///data/user/0/x.mp4');
  });

  it('trimmedUri gana y se normaliza; video normal no se altera', () => {
    const raw = '/data/user/0/app/files/trimmedVideo.mp4';
    assert.equal(fileToUpload('file:///orig.mp4', raw), `file://${raw}`);
    assert.equal(reelUploadSource({ originalUri: 'file:///orig.mp4', trimmedUri: raw }), `file://${raw}`);
    assert.equal(wouldUploadOriginalDespiteTrim('file:///orig.mp4', raw), false);
    assert.equal(fileToUpload('file:///sdcard/normal.mp4', null), 'file:///sdcard/normal.mp4');
    const finished = applyTrimFinish({ outputPath: raw, startTime: 0, endTime: 15000, duration: 15000 });
    assert.equal(finished.status, 'finished');
    if (finished.status === 'finished') assert.equal(finished.uri, `file://${raw}`);
    assert.match(createReel, /fileToUpload/);
    assert.doesNotMatch(createReel, /base64|FileReader/);
    assert.match(createReel, /texto no se quema en el video/);
  });
});

describe('BUG 2: rate limit, error real, uploading no es processing', () => {
  it('429 / mensaje Worker de límite → UX específica, no genérico', () => {
    const limited = Object.assign(new Error('Límite de subidas: 5/hora o 15/día'), { status: 429 });
    assert.equal(reelPublishErrorMessage(limited), REEL_RATE_LIMIT_MESSAGE);
    assert.equal(reelPublishErrorMessage(new Error('Mux no configurado')), 'Mux no configurado');
    assert.equal(reelPublishErrorMessage(new Error('')), 'No se pudo publicar el Reel');
    assert.match(createReel, /reelPublishErrorMessage/);
    assert.match(createReel, /shouldCancelReelAfterPublishError/);
    assert.match(createReel, /cancelReelUpload/);
    assert.equal(shouldCancelReelAfterPublishError(false), true);
    assert.equal(shouldCancelReelAfterPublishError(true), false);
  });

  it('upload fallido no queda processing; processing real sigue; failed solo owner', () => {
    assert.equal(ownerReelSurface('uploading'), 'failed');
    assert.equal(ownerReelSurface('upload_failed'), 'failed');
    assert.equal(ownerReelSurface('processing'), 'processing');
    assert.equal(ownerReelSurface('ready'), 'ready');
    assert.equal(ownerReelFailedCopy('uploading'), 'No se pudo subir este Reel');
    assert.equal(ownerReelFailedCopy('upload_failed'), 'No se pudo subir este Reel');
    assert.equal(ownerReelFailedCopy('processing_failed'), 'No pudimos procesar este Reel.');
    const card = readFileSync(join(root, 'components/ReelCard.tsx'), 'utf8');
    assert.match(card, /surface === 'failed' && isOwner/);
  });
});

describe('BUG 3: swipe y tabs comparten página', () => {
  it('index 0 Inicio activo; swipe 1 Reels activo; swipe atrás Inicio', () => {
    assert.equal(resolvedMainTab('Inicio', 0), 'Inicio');
    assert.equal(resolvedMainTab('Inicio', 1), 'Reels');
    assert.equal(shouldHighlightTab('Inicio', 'Inicio', 0), true);
    assert.equal(shouldHighlightTab('Reels', 'Inicio', 0), false);
    assert.equal(shouldHighlightTab('Reels', 'Inicio', 1), true);
    assert.equal(shouldHighlightTab('Inicio', 'Inicio', 1), false);
    assert.equal(shouldHighlightTab('Inicio', 'Inicio', 0), true);
  });

  it('tap Reels = mismo estado que swipe; tap Inicio = mismo; no duplica', () => {
    assert.deepEqual(planMainTabPress({ pressed: 'Reels', navFocused: 'Inicio', feedPage: 0 }), {
      kind: 'setPage',
      page: 1,
    });
    assert.deepEqual(planMainTabPress({ pressed: 'Inicio', navFocused: 'Inicio', feedPage: 1 }), {
      kind: 'setPage',
      page: 0,
    });
    assert.deepEqual(planMainTabPress({ pressed: 'Reels', navFocused: 'Inicio', feedPage: 1 }), { kind: 'noop' });
    assert.deepEqual(planMainTabPress({ pressed: 'Reels', navFocused: 'Alertas', feedPage: 0 }), {
      kind: 'navigate',
      tab: 'Inicio',
      page: 1,
    });
    assert.match(app, /planMainTabPress/);
    assert.match(app, /shouldHighlightTab/);
    assert.match(app, /ReelsTabBridge/);
    const sidebar = readFileSync(join(root, 'components/Sidebar.tsx'), 'utf8');
    assert.match(sidebar, /planMainTabPress/);
    assert.doesNotMatch(swiper, /initialPage/);
  });

  it('playback false al volver a Home', () => {
    assert.equal(shouldPlayFeedReels({ page: 1, tabFocused: true }), true);
    assert.equal(shouldPlayFeedReels({ page: 0, tabFocused: true }), false);
    assert.equal(shouldPlayFeedReels({ page: 1, tabFocused: false }), false);
    assert.match(swiper, /shouldPlayFeedReels/);
  });
});
