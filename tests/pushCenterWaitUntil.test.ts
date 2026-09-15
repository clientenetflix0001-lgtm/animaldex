import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PUSH_BATCH_MINUTES,
  PUSH_KIND,
  decidePushDelivery,
  listingCommentActivityItem,
  listingInquiryCopy,
  schedulePushCenterWork,
} from '../lib/pushCenter.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
const activity = readFileSync(join(root, 'screens/ActivityScreen.tsx'), 'utf8');

function actionBlock(startNeedle: string, endNeedle: string) {
  const start = worker.indexOf(startNeedle);
  assert.ok(start >= 0, startNeedle);
  const end = worker.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, endNeedle);
  return worker.slice(start, end);
}

describe('waitUntil Push Center', () => {
  it('1–6. comment/alert/listing/like/follow/createPost encolan ingest en waitUntil', () => {
    assert.match(worker, /async fetch\(request, env, ctx\)/);
    assert.match(worker, /handleDb\(request, env, ctx\)/);
    const blocks = {
      comment: actionBlock("action === 'comment'", "action === 'createAlert'"),
      alertComment: actionBlock("action === 'alertComment'", "action === 'createListing'"),
      listingComment: actionBlock("action === 'listingComment'", "action === 'sellerReview'"),
      like: actionBlock("action === 'like'", "action === 'save'"),
      follow: actionBlock("action === 'follow'", "action === 'comment'"),
      createPost: actionBlock("action === 'createPost'", "action === 'listProfiles'"),
    };
    for (const [name, block] of Object.entries(blocks)) {
      assert.match(block, /schedulePushCenterWork\(ctx, ingestPushEvent/, name);
      assert.doesNotMatch(block, /ingestPushEvent\([\s\S]*\)\.catch\(\(\) => \{\}\)/, name);
    }
    assert.match(blocks.createPost, /PUSH_KIND\.PET_FOLLOWING/);
    assert.match(blocks.createPost, /PUSH_KIND\.PAGE_FOLLOWING/);
  });

  it('7. schedulePushCenterWork no espera el trabajo y 8. captura el error', async () => {
    const queued: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => queued.push(p) };
    let finished = false;
    const slow = new Promise((resolve) => setTimeout(() => { finished = true; resolve('ok'); }, 40));
    const started = Date.now();
    const mode = schedulePushCenterWork(ctx, slow);
    assert.equal(mode, 'waitUntil');
    assert.ok(Date.now() - started < 20);
    assert.equal(finished, false);
    assert.equal(queued.length, 1);
    await queued[0];
    assert.equal(finished, true);

    const errs: Promise<unknown>[] = [];
    const ctx2 = { waitUntil: (p: Promise<unknown>) => errs.push(p) };
    const logs: unknown[][] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => { logs.push(args); };
    try {
      assert.equal(schedulePushCenterWork(ctx2, Promise.reject(new Error('boom ExponentPushToken[abc]'))), 'waitUntil');
      await errs[0];
    } finally {
      console.log = orig;
    }
    assert.deepEqual(logs[0], ['push-center', 'boom [token]']);
    assert.equal(schedulePushCenterWork(null, Promise.resolve()), 'missing_ctx');
  });

  it('9. shareLocation conserva await notifyUserPush y no usa waitUntil', () => {
    const start = worker.indexOf("action === 'shareLocation'");
    const block = worker.slice(start, worker.indexOf('handleAuthReelAction', start));
    assert.match(block, /await notifyUserPush\(env,/);
    assert.match(block, /locationPushMessage/);
    assert.doesNotMatch(block, /schedulePushCenterWork/);
    assert.doesNotMatch(block, /waitUntil/);
    assert.doesNotMatch(block, /ingestPushEvent/);
  });
});

describe('política intacta', () => {
  it('10–12. Feed/Alerta primer comentario y Mercado siguen immediate', () => {
    const now = 1;
    assert.equal(decidePushDelivery({ kind: PUSH_KIND.POST_COMMENT, actorId: 'a', recipientId: 'b', now }).action, 'immediate_open');
    assert.equal(decidePushDelivery({ kind: PUSH_KIND.ALERT_COMMENT, actorId: 'a', recipientId: 'b', now }).action, 'immediate_open');
    assert.equal(decidePushDelivery({ kind: PUSH_KIND.LISTING_COMMENT, actorId: 'a', recipientId: 'b', now }).action, 'immediate');
    assert.equal(listingInquiryCopy('lucasfuentes', 'Correa para perro').title, 'Nueva consulta por tu producto');
    assert.equal(listingInquiryCopy('lucasfuentes', 'Correa para perro').body, 'lucasfuentes comentó en Correa para perro.');
  });

  it('13. social sigue batch 60 min y 14. self queda bloqueado', () => {
    const social = decidePushDelivery({ kind: PUSH_KIND.LIKE, actorId: 'a', recipientId: 'b', now: 1 });
    assert.equal(social.action, 'enqueue');
    assert.equal(social.windowMs, PUSH_BATCH_MINUTES.SOCIAL * 60_000);
    assert.equal(decidePushDelivery({ kind: PUSH_KIND.FOLLOW_USER, actorId: 'me', recipientId: 'me', now: 1 }).action, 'skip');
    assert.equal(decidePushDelivery({ kind: PUSH_KIND.POST_COMMENT, actorId: 'me', recipientId: 'me', now: 1 }).action, 'skip');
  });
});

describe('Activity Mercado', () => {
  it('15. listingComment de otro usuario aparece con listingId', () => {
    const item = listingCommentActivityItem({
      actor_id: 'u-lucas',
      actor_name: 'lucasfuentes',
      username: 'lucasfuentes',
      avatar_url: 'https://img.example/a.png',
      listing_id: 'list-1',
      listing_title: 'Correa para perro',
      listing_images: '["https://img.example/p.png"]',
      text: 'Sigue disponible?',
      created_at: 50,
    });
    assert.equal(item.type, 'listing_comment');
    assert.equal(item.listingId, 'list-1');
    assert.equal(item.actorId, 'u-lucas');
    assert.equal(item.listingTitle, 'Correa para perro');
    assert.equal(item.postImage, 'https://img.example/p.png');
    assert.match(worker, /FROM listing_comments c JOIN listings l/);
    assert.match(worker, /l\.user_id = \? AND c\.user_id != \?/);
    assert.match(worker, /listingCommentActivityItem/);
  });

  it('16. listingComment propio no entra al UNION de Activity', () => {
    const notif = actionBlock("action === 'notifications'", "action === 'setPhone'");
    assert.match(notif, /FROM listing_comments c JOIN listings l ON l\.id = c\.listing_id/);
    assert.match(notif, /WHERE l\.user_id = \? AND c\.user_id != \?/);
  });

  it('17. Activity Mercado navega con listingId a ListingDetail', () => {
    assert.match(activity, /n\.type === 'listing_comment' && n\.listingId/);
    assert.match(activity, /navigate\('ListingDetail', \{ listingId: n\.listingId \}\)/);
    assert.match(activity, /comentó tu producto/);
  });
});
