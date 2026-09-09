import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PUSH_CHANNEL_PETS,
  mergeNotificationPrefs,
  parsePushNav,
  prefAllows,
  pushNavDestination,
  reelCommentPushCopy,
  reelCommentPushMessage,
  reelLikePushCopy,
  reelLikePushMessage,
} from '../lib/pushPolicy.ts';
import {
  REEL_UNAVAILABLE_COPY,
  planReelCommentPush,
  planReelLikePush,
  reelCommentPushIdempotencyKey,
  reelIsViewableFromLink,
  reelLikePushIdempotencyKey,
  reelPushRecipient,
  reelViewerSurface,
  sanitizeReelCommentPreview,
  shouldCreateReelActivity,
} from '../lib/reelActivity.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';

describe('like: actividad y push', () => {
  it('A like B → actividad y push permitido', () => {
    assert.equal(shouldCreateReelActivity('owner-b', 'actor-a'), true);
    const plan = planReelLikePush({
      ownerId: 'owner-b',
      actorId: 'actor-a',
      reelId: 'reel-1',
      reelPublic: true,
      likeValue: true,
      likeInserted: true,
    });
    assert.equal(plan.notify, true);
    if (plan.notify) {
      assert.equal(plan.type, 'reel_like');
      assert.equal(plan.ownerId, 'owner-b');
    }
    assert.equal(prefAllows(mergeNotificationPrefs({ like: 1 }), 'reel_like'), true);
    const copy = reelLikePushCopy('gabriela');
    assert.equal(copy.title, 'Animaldex');
    assert.equal(copy.body, 'gabriela le dio me gusta a tu Reel');
  });

  it('A like A → no actividad ni push', () => {
    assert.equal(shouldCreateReelActivity('owner', 'owner'), false);
    assert.deepEqual(
      planReelLikePush({
        ownerId: 'owner',
        actorId: 'owner',
        reelId: 'reel-1',
        reelPublic: true,
        likeValue: true,
        likeInserted: true,
      }),
      { notify: false, reason: 'self' }
    );
  });

  it('unlike / like inválido / inexistente / deleted → no push', () => {
    assert.equal(
      planReelLikePush({
        ownerId: 'b',
        actorId: 'a',
        reelId: 'r',
        reelPublic: true,
        likeValue: false,
        likeInserted: false,
      }).notify,
      false
    );
    assert.equal(
      planReelLikePush({
        ownerId: 'b',
        actorId: 'a',
        reelId: 'r',
        reelPublic: true,
        likeValue: true,
        likeInserted: false,
      }).reason,
      'not_inserted'
    );
    assert.equal(
      planReelLikePush({
        ownerId: 'b',
        actorId: 'a',
        reelId: 'r',
        reelPublic: false,
        likeValue: true,
        likeInserted: true,
      }).reason,
      'invalid_reel'
    );
    assert.equal(
      planReelLikePush({
        ownerId: null,
        actorId: 'a',
        reelId: 'r',
        reelPublic: true,
        likeValue: true,
        likeInserted: true,
      }).reason,
      'missing'
    );
  });
});

describe('comment: actividad y push', () => {
  it('A comenta B → push; self-comment no; fallido no', () => {
    assert.equal(
      planReelCommentPush({
        ownerId: 'b',
        actorId: 'a',
        reelId: 'r',
        reelPublic: true,
        commentInserted: true,
      }).notify,
      true
    );
    assert.equal(
      planReelCommentPush({
        ownerId: 'b',
        actorId: 'b',
        reelId: 'r',
        reelPublic: true,
        commentInserted: true,
      }).reason,
      'self'
    );
    assert.equal(
      planReelCommentPush({
        ownerId: 'b',
        actorId: 'a',
        reelId: 'r',
        reelPublic: true,
        commentInserted: false,
      }).reason,
      'comment_failed'
    );
  });

  it('preview 80 chars y HTML sanitizado', () => {
    assert.equal(sanitizeReelCommentPreview('<b>hola</b>\n\nmundo'), 'hola mundo');
    const long = 'x'.repeat(90);
    assert.equal(sanitizeReelCommentPreview(long).length, 80);
    const copy = reelCommentPushCopy('Ana', '<b>lindo</b>\n\nreel');
    assert.equal(copy.title, 'Animaldex');
    assert.equal(copy.body, 'Ana comentó tu Reel: "lindo reel"');
    assert.doesNotMatch(copy.body, /<b>/);
  });
});

describe('preferencias like/comment reutilizadas', () => {
  it('like off bloquea reel_like; comment on permite reel_comment', () => {
    const def = mergeNotificationPrefs(null);
    assert.equal(def.like, false);
    assert.equal(def.comment, true);
    assert.equal(prefAllows(def, 'reel_like'), false);
    assert.equal(prefAllows(def, 'reel_comment'), true);
    assert.equal(prefAllows(mergeNotificationPrefs({ like: 1 }), 'reel_like'), true);
    assert.equal(prefAllows(mergeNotificationPrefs({ comment: 0 }), 'reel_comment'), false);
  });
});

describe('seguridad recipient y actor', () => {
  it('cliente no decide recipient; actor es auth', () => {
    assert.equal(reelPushRecipient('owner-db', { recipientUserId: 'otro', actorName: 'Fake' }), 'owner-db');
    const mux = read('worker/reelsMux.js');
    assert.match(mux, /reelPushRecipient\(plan\.ownerId, body\)/);
    assert.match(mux, /SELECT name, username FROM users WHERE id = \?/);
    assert.doesNotMatch(mux, /body\.recipientUserId|body\.actorName/);
  });
});

describe('navegación y Reel unavailable', () => {
  it('reel_like y reel_comment → /r/:id y ReelViewer', () => {
    const like = reelLikePushMessage({ token: TOKEN, reelId: 'reel-1', actorName: 'Ana' });
    assert.equal(like.channelId, PUSH_CHANNEL_PETS);
    assert.deepEqual(like.data, { type: 'reel_like', reelId: 'reel-1', url: '/r/reel-1' });
    assert.deepEqual(parsePushNav(like.data), { kind: 'reel', reelId: 'reel-1' });
    assert.deepEqual(pushNavDestination(like.data), { name: 'ReelViewer', params: { reelId: 'reel-1' } });
    const comment = reelCommentPushMessage({
      token: TOKEN,
      reelId: 'reel-2',
      actorName: 'Ana',
      commentPreview: 'hola',
    });
    assert.deepEqual(pushNavDestination(comment.data), { name: 'ReelViewer', params: { reelId: 'reel-2' } });
    assert.match(read('lib/push.ts'), /dest\.name === 'ReelViewer'/);
  });

  it('Reel deleted / inexistente → unavailable, sin feed', () => {
    assert.equal(reelIsViewableFromLink(null), false);
    assert.equal(reelIsViewableFromLink({ status: 'deleted' }), false);
    assert.equal(reelIsViewableFromLink({ status: 'ready', deletedAt: 1 }), false);
    assert.equal(reelIsViewableFromLink({ status: 'ready' }), true);
    assert.equal(reelViewerSurface(null, false), 'loading');
    assert.equal(reelViewerSurface(null, true), 'unavailable');
    assert.equal(reelViewerSurface({ status: 'deleted' }, true), 'unavailable');
    assert.equal(reelViewerSurface({ status: 'processing' }, true), 'unavailable');
    assert.equal(reelViewerSurface({ status: 'processing' }, true, { fromSeededList: true }), 'player');
    const viewer = read('screens/ReelViewerScreen.tsx');
    assert.match(viewer, /REEL_UNAVAILABLE_COPY/);
    assert.equal(REEL_UNAVAILABLE_COPY, 'Este Reel ya no está disponible');
    assert.doesNotMatch(viewer, /loadPage\(true\)/);
  });
});

describe('dedupe, wiring y resiliencia', () => {
  it('1 like actor+reel y 1 comment id; notify after insert; fallo no revierte', () => {
    assert.equal(reelLikePushIdempotencyKey('r1', 'u1'), 'push:reel_like:r1:u1');
    assert.equal(reelCommentPushIdempotencyKey('rc-1'), 'push:reel_comment:rc-1');
    const mux = read('worker/reelsMux.js');
    const index = read('worker/index.js');
    assert.match(mux, /INSERT OR IGNORE INTO reel_likes/);
    assert.match(mux, /likeInserted/);
    assert.match(mux, /planReelLikePush/);
    assert.match(mux, /planReelCommentPush/);
    assert.match(mux, /try \{/);
    assert.match(mux, /notifyUserPush/);
    assert.match(index, /handleAuthReelAction\(env, body, json, clean, userId, notifyUserPush\)/);
    assert.match(index, /INSERT OR IGNORE INTO push_sends/);
    assert.doesNotMatch(read('screens/ReelsScreen.tsx'), /notifyUserPush|sendExpoPush|exp\.host/);
  });
});
