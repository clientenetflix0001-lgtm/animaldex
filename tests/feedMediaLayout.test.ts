import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FEED_FALLBACK_MEDIA_HEIGHT,
  FEED_MAX_LANDSCAPE_ASPECT,
  FEED_MIN_PORTRAIT_ASPECT,
  FEED_TEXT_BACKGROUND_ASPECT,
  clampFeedMediaAspect,
  feedBoxHeightForWidth,
  feedCarouselBox,
  feedMediaBox,
  feedMediaBoxStyle,
  feedTextBackgroundBoxStyle,
  rawMediaAspect,
} from '../lib/feedMediaLayout.ts';
import { POST_BACKGROUND_CARD_HEIGHT } from '../lib/postBackgrounds.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('cálculo de caja de media del Feed', () => {
  it('1. imagen 1:1 reserva cuadrado', () => {
    const box = feedMediaBox(400, 400);
    assert.deepEqual(box, { kind: 'aspect', aspectRatio: 1 });
    assert.equal(feedBoxHeightForWidth(400, 1), 400);
  });

  it('2. imagen 4:5 usa todo el alto permitido', () => {
    const box = feedMediaBox(400, 500);
    assert.equal(box.kind, 'aspect');
    if (box.kind === 'aspect') {
      assert.equal(box.aspectRatio, FEED_MIN_PORTRAIT_ASPECT);
    }
    assert.equal(feedBoxHeightForWidth(400, FEED_MIN_PORTRAIT_ASPECT), 500);
  });

  it('3. imagen vertical extrema se recorta visualmente a 4:5', () => {
    const raw = rawMediaAspect(400, 1200);
    assert.equal(raw, 400 / 1200);
    const clamped = clampFeedMediaAspect(raw!);
    assert.equal(clamped, FEED_MIN_PORTRAIT_ASPECT);
    const box = feedMediaBox(400, 1200);
    assert.deepEqual(box, { kind: 'aspect', aspectRatio: 4 / 5 });
    assert.equal(feedBoxHeightForWidth(400, box.kind === 'aspect' ? box.aspectRatio : 1), 500);
  });

  it('4. imagen horizontal se limita a ~1.91:1', () => {
    const box = feedMediaBox(1910, 1000);
    assert.deepEqual(box, { kind: 'aspect', aspectRatio: FEED_MAX_LANDSCAPE_ASPECT });
    const ultraWide = feedMediaBox(3000, 1000);
    assert.deepEqual(ultraWide, { kind: 'aspect', aspectRatio: FEED_MAX_LANDSCAPE_ASPECT });
    const mild = feedMediaBox(1600, 1000);
    assert.deepEqual(mild, { kind: 'aspect', aspectRatio: 1.6 });
  });

  it('5. post antiguo sin width/height usa fallback 350', () => {
    assert.deepEqual(feedMediaBox(null, null), {
      kind: 'fallback',
      height: FEED_FALLBACK_MEDIA_HEIGHT,
    });
    assert.deepEqual(feedMediaBox(undefined, 400), {
      kind: 'fallback',
      height: FEED_FALLBACK_MEDIA_HEIGHT,
    });
    assert.deepEqual(feedMediaBox(0, 0), {
      kind: 'fallback',
      height: FEED_FALLBACK_MEDIA_HEIGHT,
    });
    const style = feedMediaBoxStyle(null, null);
    assert.deepEqual(style, { width: '100%', height: 350 });
  });

  it('6. publicación de texto con fondo 4:5', () => {
    const style = feedTextBackgroundBoxStyle();
    assert.equal(style.aspectRatio, FEED_TEXT_BACKGROUND_ASPECT);
    assert.equal(feedBoxHeightForWidth(400, FEED_TEXT_BACKGROUND_ASPECT), 500);
    assert.ok(POST_BACKGROUND_CARD_HEIGHT === 350);
    assert.ok(500 > POST_BACKGROUND_CARD_HEIGHT);
  });

  it('7. múltiples imágenes: caja estable según la primera', () => {
    const box = feedCarouselBox([
      { width: 400, height: 500 },
      { width: 1910, height: 1000 },
      { width: 400, height: 400 },
    ]);
    assert.deepEqual(box, { kind: 'aspect', aspectRatio: 4 / 5 });
    const empty = feedCarouselBox([]);
    assert.deepEqual(empty, { kind: 'fallback', height: 350 });
  });

  it('8. el alto es determinista para el mismo width+aspect', () => {
    const a = feedBoxHeightForWidth(400, 1);
    const b = feedBoxHeightForWidth(400, 1);
    assert.equal(a, b);
    const s1 = feedMediaBoxStyle(800, 800);
    const s2 = feedMediaBoxStyle(800, 800);
    assert.deepEqual(s1, s2);
  });
});

describe('aislamiento: solo Feed cambia presentación', () => {
  it('PostCard usa layout feed y fondo 4:5', () => {
    const postCard = readFileSync(join(root, 'components/PostCard.tsx'), 'utf8');
    assert.match(postCard, /layout="feed"/);
    assert.match(postCard, /FEED_TEXT_BACKGROUND_ASPECT/);
    assert.match(postCard, /recyclingKey=\{post\.id\}/);
  });

  it('PostDetail sigue con altura fija, no layout feed', () => {
    const detail = readFileSync(join(root, 'screens/PostDetailScreen.tsx'), 'utf8');
    assert.match(detail, /containerHeight=\{cardH\}/);
    assert.match(detail, /containerHeight=\{380\}/);
    assert.doesNotMatch(detail, /layout="feed"/);
    assert.doesNotMatch(detail, /aspectRatio=\{FEED_TEXT_BACKGROUND_ASPECT\}/);
  });

  it('AdaptivePostImage no usa Image.getSize', () => {
    const src = readFileSync(join(root, 'components/AdaptivePostImage.tsx'), 'utf8');
    assert.doesNotMatch(src, /getSize/);
    assert.match(src, /feedMediaBoxStyle/);
    assert.match(src, /cachePolicy/);
  });

  it('Feed conserva FlatList append-only y memo de PostCard', () => {
    const feed = readFileSync(join(root, 'screens/FeedScreen.tsx'), 'utf8');
    assert.match(feed, /onEndReached=\{loadMore\}/);
    assert.match(feed, /keyExtractor/);
    assert.match(feed, /extraData/);
    assert.match(feed, /setRealPosts\(\(prev\) =>/);
    const postCard = readFileSync(join(root, 'components/PostCard.tsx'), 'utf8');
    assert.match(postCard, /export const PostCard = memo\(PostCardInner\)/);
  });

  it('no introduce schema/API nueva: image_w / image_h ya existían', () => {
    const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
    assert.match(worker, /image_w/);
    assert.match(worker, /imageWidth: r\.image_w/);
    const db = readFileSync(join(root, 'lib/db.ts'), 'utf8');
    assert.match(db, /imageWidth\?: number \| null/);
  });
});
