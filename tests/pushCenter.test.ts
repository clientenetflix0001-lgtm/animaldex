import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PUSH_BATCH_MINUTES,
  PUSH_KIND,
  PUSH_KIND_DEFERRED,
  PUSH_LEVEL,
  PUSH_PREF_CATEGORIES,
  decidePushDelivery,
  extraPeopleCount,
  firstAlertCommentCopy,
  firstPostCommentCopy,
  groupedFollowPetCopy,
  groupedLikeCopy,
  listingInquiryCopy,
  petFollowingCopy,
  pushGroupKey,
  pushLevelForKind,
  pushPrefKey,
  sanitizePushPreview,
  shouldNotifySelf,
  shouldSkipGroupedFlush,
} from '../lib/pushCenter.ts';
import {
  DEFAULT_NOTIFICATION_PREFS,
  PUSH_CHANNEL_PETS_URGENT,
  locationPushMessage,
  mergeNotificationPrefs,
  parsePushNav,
  payloadHasSensitiveLocation,
  prefAllows,
  pushNavDestination,
} from '../lib/pushPolicy.ts';
import { flushDuePushBatches, ingestPushEvent } from '../worker/pushBatches.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function createBatchEnv() {
  const rows = new Map();
  const runSql = async (sql, args) => {
    const s = String(sql).replace(/\s+/g, ' ').trim();
    if (s.startsWith('CREATE TABLE') || s.startsWith('CREATE INDEX')) {
      return { meta: { changes: 0 } };
    }
    if (s.startsWith('DELETE FROM push_batches WHERE group_key')) {
      const [key, now] = args;
      const row = rows.get(key);
      if (row && (row.flushed_at != null || Number(row.window_ends_at) <= Number(now))) {
        rows.delete(key);
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }
    if (s.startsWith('INSERT INTO push_batches')) {
      const [
        group_key,
        kind,
        recipient_user_id,
        target_id,
        first_actor_id,
        first_actor_name,
        actor_ids,
        subject_names,
        extra,
        first_push_sent,
        first_event_at,
        last_event_at,
        window_ends_at,
      ] = args;
      if (rows.has(group_key)) return { meta: { changes: 0 } };
      rows.set(group_key, {
        group_key,
        kind,
        recipient_user_id,
        target_id,
        first_actor_id,
        first_actor_name,
        actor_ids,
        subject_names,
        extra,
        first_push_sent,
        first_event_at,
        last_event_at,
        window_ends_at,
        flushed_at: null,
      });
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('UPDATE push_batches SET actor_ids')) {
      const [actor_ids, subject_names, extra, last_event_at, group_key] = args;
      const row = rows.get(group_key);
      if (!row || row.flushed_at != null) return { meta: { changes: 0 } };
      Object.assign(row, { actor_ids, subject_names, extra, last_event_at });
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('UPDATE push_batches SET flushed_at')) {
      const [flushed_at, group_key] = args;
      const row = rows.get(group_key);
      if (!row || row.flushed_at != null) return { meta: { changes: 0 } };
      row.flushed_at = flushed_at;
      return { meta: { changes: 1 } };
    }
    throw new Error(`unhandled run sql: ${s}`);
  };
  const allSql = async (sql, args) => {
    const s = String(sql).replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT * FROM push_batches WHERE group_key')) {
      const row = rows.get(args[0]);
      return { results: row ? [{ ...row }] : [] };
    }
    if (s.startsWith('SELECT * FROM push_batches WHERE flushed_at IS NULL')) {
      const now = Number(args[0]);
      const limit = Number(args[1] ?? 20);
      const due = [...rows.values()]
        .filter((r) => r.flushed_at == null && Number(r.window_ends_at) <= now)
        .sort((a, b) => Number(a.window_ends_at) - Number(b.window_ends_at))
        .slice(0, limit)
        .map((r) => ({ ...r }));
      return { results: due };
    }
    if (s.startsWith('SELECT name, username FROM users')) {
      return { results: [] };
    }
    throw new Error(`unhandled all sql: ${s}`);
  };
  const stmt = (sql) => {
    const exec = (args) => ({
      run: () => runSql(sql, args),
      all: () => allSql(sql, args),
    });
    return {
      bind: (...args) => exec(args),
      run: () => exec([]).run(),
      all: () => exec([]).all(),
    };
  };
  return {
    env: { DB: { prepare: stmt } },
    rows,
  };
}

function createPushRecorder() {
  const sent = [];
  async function notifyUserPush(_env, input) {
    const message = input.buildMessage('ExponentPushToken[test]');
    sent.push({
      userId: input.userId,
      type: input.type,
      idempotencyKey: input.idempotencyKey,
      message,
    });
    return { sent: 1 };
  }
  return { notifyUserPush, sent };
}

describe('1. ubicación perdida: inmediata y nunca agrupada', () => {
  it('decide immediate y no abre ventana', () => {
    const d = decidePushDelivery({
      kind: PUSH_KIND.LOCATION,
      actorId: 'visitor',
      recipientId: 'owner',
      now: 1,
    });
    assert.equal(d.action, 'immediate');
    assert.equal(d.reason, 'critical_never_grouped');
    assert.equal(d.windowMs, 0);
    assert.equal(pushLevelForKind(PUSH_KIND.LOCATION), PUSH_LEVEL.CRITICAL);
  });

  it('el Worker sigue enviando locationPushMessage urgente, sin ingest', () => {
    const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
    const start = worker.indexOf("action === 'shareLocation'");
    const end = worker.indexOf('handleAuthReelAction', start);
    const block = worker.slice(start, end);
    assert.match(block, /locationPushMessage/);
    assert.match(block, /notifyUserPush/);
    assert.match(block, /locationPushIdempotencyKey/);
    assert.doesNotMatch(block, /ingestPushEvent/);
    assert.doesNotMatch(block, /push_batches/);
    const msg = locationPushMessage({
      token: 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]',
      petName: 'Luna.pet',
      petId: 'pet-luna',
      shareId: 'loc-1',
      actorName: 'María',
    });
    assert.equal(msg.channelId, PUSH_CHANNEL_PETS_URGENT);
    assert.equal(msg.priority, 'high');
    assert.equal(payloadHasSensitiveLocation(msg), false);
  });
});

describe('2–3. comentarios de alerta: primero inmediato, luego agrupados', () => {
  it('primer comentario abre ventana y empuja ya', async () => {
    const { env, rows } = createBatchEnv();
    const { notifyUserPush, sent } = createPushRecorder();
    const now = 1_000_000;
    const first = await ingestPushEvent(env, notifyUserPush, {
      kind: PUSH_KIND.ALERT_COMMENT,
      actorId: 'maria',
      actorName: 'María',
      recipientId: 'owner',
      targetId: 'alert-luna',
      petName: 'Luna.pet',
      preview: 'Creo que la vi cerca de la plaza.',
      idempotencyKey: 'push:alert_comment:ac-1',
      now,
    });
    assert.equal(first.action, 'immediate_open');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].message.title, 'María comentó en tu alerta de Luna.pet');
    assert.equal(sent[0].message.body, 'Creo que la vi cerca de la plaza.');
    assert.equal(sent[0].message.data.alertId, 'alert-luna');
    assert.equal(rows.size, 1);
  });

  it('comentarios posteriores se agrupan y no pisan la ubicación', async () => {
    const { env } = createBatchEnv();
    const { notifyUserPush, sent } = createPushRecorder();
    const now = 2_000_000;
    await ingestPushEvent(env, notifyUserPush, {
      kind: PUSH_KIND.ALERT_COMMENT,
      actorId: 'maria',
      actorName: 'María',
      recipientId: 'owner',
      targetId: 'alert-luna',
      petName: 'Luna.pet',
      preview: 'La vi.',
      now,
    });
    await ingestPushEvent(env, notifyUserPush, {
      kind: PUSH_KIND.ALERT_COMMENT,
      actorId: 'lucas',
      actorName: 'Lucas',
      recipientId: 'owner',
      targetId: 'alert-luna',
      petName: 'Luna.pet',
      now: now + 60_000,
    });
    await ingestPushEvent(env, notifyUserPush, {
      kind: PUSH_KIND.ALERT_COMMENT,
      actorId: 'juan',
      actorName: 'Juan',
      recipientId: 'owner',
      targetId: 'alert-luna',
      petName: 'Luna.pet',
      now: now + 120_000,
    });
    assert.equal(sent.length, 1);
    await flushDuePushBatches(env, notifyUserPush, now + 14 * 60_000);
    assert.equal(sent.length, 1);
    await flushDuePushBatches(env, notifyUserPush, now + PUSH_BATCH_MINUTES.ALERT_COMMENT * 60_000);
    assert.equal(sent.length, 2);
    assert.equal(sent[1].message.title, 'María y 2 personas más comentaron en tu alerta de Luna.pet');
    const loc = decidePushDelivery({
      kind: PUSH_KIND.LOCATION,
      actorId: 'x',
      recipientId: 'owner',
      now: now + 30_000,
      openBatch: { firstPushSent: true, windowEndsAt: now + 15 * 60_000, flushedAt: null },
    });
    assert.equal(loc.action, 'immediate');
  });

  it('si nadie más comentó, el flush no repite el primer push', async () => {
    const { env } = createBatchEnv();
    const { notifyUserPush, sent } = createPushRecorder();
    const now = 3_000_000;
    await ingestPushEvent(env, notifyUserPush, {
      kind: PUSH_KIND.ALERT_COMMENT,
      actorId: 'maria',
      actorName: 'María',
      recipientId: 'owner',
      targetId: 'alert-luna',
      petName: 'Luna.pet',
      now,
    });
    await flushDuePushBatches(env, notifyUserPush, now + PUSH_BATCH_MINUTES.ALERT_COMMENT * 60_000);
    assert.equal(sent.length, 1);
    assert.equal(shouldSkipGroupedFlush({ firstPushSent: true, uniqueActorCount: 1 }), true);
  });
});

describe('4. primer comentario de Feed inmediato', () => {
  it('abre ventana y usa copy de publicación', async () => {
    const { env } = createBatchEnv();
    const { notifyUserPush, sent } = createPushRecorder();
    const r = await ingestPushEvent(env, notifyUserPush, {
      kind: PUSH_KIND.POST_COMMENT,
      actorId: 'maria',
      actorName: 'María',
      recipientId: 'owner',
      targetId: 'post-1',
      preview: 'Qué lindo!',
      now: 4_000_000,
    });
    assert.equal(r.action, 'immediate_open');
    assert.equal(sent[0].message.title, 'María comentó tu publicación');
    assert.equal(sent[0].message.data.postId, 'post-1');
    assert.equal(decidePushDelivery({
      kind: PUSH_KIND.POST_COMMENT,
      actorId: 'lucas',
      recipientId: 'owner',
      now: 4_000_001,
      openBatch: { firstPushSent: true, windowEndsAt: 4_000_000 + 20 * 60_000, flushedAt: null },
    }).action, 'enqueue');
  });
});

describe('5. likes múltiples → un push agrupado', () => {
  it('no interrumpe uno por uno y al flush manda un solo agrupado', async () => {
    const { env } = createBatchEnv();
    const { notifyUserPush, sent } = createPushRecorder();
    const now = 5_000_000;
    for (const [id, name] of [
      ['maria', 'María'],
      ['lucas', 'Lucas'],
      ['juan', 'Juan'],
    ]) {
      const r = await ingestPushEvent(env, notifyUserPush, {
        kind: PUSH_KIND.LIKE,
        actorId: id,
        actorName: name,
        recipientId: 'owner',
        targetId: 'post-1',
        now,
      });
      assert.equal(r.action, 'enqueue');
    }
    assert.equal(sent.length, 0);
    await flushDuePushBatches(env, notifyUserPush, now + PUSH_BATCH_MINUTES.SOCIAL * 60_000);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].message.title, 'A María y 2 personas más les gustó tu publicación.');
    assert.equal(sent[0].message.data.postId, 'post-1');
  });
});

describe('6. varios seguidores de Luna.pet', () => {
  it('agrupa por pet + dueño y usa “X y N personas más”', async () => {
    const { env } = createBatchEnv();
    const { notifyUserPush, sent } = createPushRecorder();
    const now = 6_000_000;
    await ingestPushEvent(env, notifyUserPush, {
      kind: PUSH_KIND.FOLLOW_PET,
      actorId: 'lucas',
      actorName: 'lucasfuentes',
      recipientId: 'owner',
      targetId: 'pet-luna',
      petName: 'Luna.pet',
      petId: 'pet-luna',
      now,
    });
    await ingestPushEvent(env, notifyUserPush, {
      kind: PUSH_KIND.FOLLOW_PET,
      actorId: 'maria',
      actorName: 'María',
      recipientId: 'owner',
      targetId: 'pet-luna',
      petName: 'Luna.pet',
      petId: 'pet-luna',
      now: now + 10_000,
    });
    await ingestPushEvent(env, notifyUserPush, {
      kind: PUSH_KIND.FOLLOW_PET,
      actorId: 'juan',
      actorName: 'Juan',
      recipientId: 'owner',
      targetId: 'pet-luna',
      petName: 'Luna.pet',
      petId: 'pet-luna',
      now: now + 20_000,
    });
    assert.equal(sent.length, 0);
    await flushDuePushBatches(env, notifyUserPush, now + PUSH_BATCH_MINUTES.SOCIAL * 60_000);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].message.title, 'lucasfuentes y 2 personas más empezaron a seguir a Luna.pet 🐾');
    assert.equal(
      groupedFollowPetCopy('lucasfuentes', 5, 'Luna.pet').title,
      'lucasfuentes y 5 personas más empezaron a seguir a Luna.pet 🐾'
    );
  });
});

describe('7. publicaciones de varias mascotas seguidas', () => {
  it('un solo grupo por recipient, aunque Luna publique dos veces', async () => {
    const { env, rows } = createBatchEnv();
    const { notifyUserPush, sent } = createPushRecorder();
    const now = 7_000_000;
    const recipient = 'follower-1';
    await ingestPushEvent(env, notifyUserPush, {
      kind: PUSH_KIND.PET_FOLLOWING,
      actorId: 'owner-luna',
      recipientId: recipient,
      targetId: 'pet-luna',
      petName: 'Luna.pet',
      subjectName: 'Luna.pet',
      now,
    });
    await ingestPushEvent(env, notifyUserPush, {
      kind: PUSH_KIND.PET_FOLLOWING,
      actorId: 'owner-luna',
      recipientId: recipient,
      targetId: 'pet-luna',
      petName: 'Luna.pet',
      subjectName: 'Luna.pet',
      now: now + 5_000,
    });
    await ingestPushEvent(env, notifyUserPush, {
      kind: PUSH_KIND.PET_FOLLOWING,
      actorId: 'owner-max',
      recipientId: recipient,
      targetId: 'pet-max',
      petName: 'Max.pet',
      subjectName: 'Max.pet',
      now: now + 8_000,
    });
    await ingestPushEvent(env, notifyUserPush, {
      kind: PUSH_KIND.PET_FOLLOWING,
      actorId: 'owner-nala',
      recipientId: recipient,
      targetId: 'pet-nala',
      petName: 'Nala.pet',
      subjectName: 'Nala.pet',
      now: now + 9_000,
    });
    assert.equal(rows.size, 1);
    assert.equal(pushGroupKey(PUSH_KIND.PET_FOLLOWING, recipient, 'pet-luna'), `pet_following:${recipient}`);
    await flushDuePushBatches(env, notifyUserPush, now + PUSH_BATCH_MINUTES.SOCIAL * 60_000);
    assert.equal(sent.length, 1);
    assert.equal(
      sent[0].message.title,
      'Luna.pet y otras 2 mascotas que seguís publicaron nuevas actualizaciones.'
    );
    assert.equal(petFollowingCopy(['Luna.pet']).title, 'Luna.pet publicó una actualización 🐾');
  });
});

describe('8. actor === recipient → no push', () => {
  it('skip en decide e ingest', async () => {
    assert.equal(shouldNotifySelf('me', 'me'), false);
    const d = decidePushDelivery({
      kind: PUSH_KIND.LIKE,
      actorId: 'me',
      recipientId: 'me',
      now: 1,
    });
    assert.equal(d.action, 'skip');
    const { env } = createBatchEnv();
    const { notifyUserPush, sent } = createPushRecorder();
    const r = await ingestPushEvent(env, notifyUserPush, {
      kind: PUSH_KIND.LIKE,
      actorId: 'me',
      actorName: 'Yo',
      recipientId: 'me',
      targetId: 'post-1',
      now: 8_000_000,
    });
    assert.equal(r.action, 'skip');
    assert.equal(sent.length, 0);
  });
});

describe('9. dos objetos distintos no se mezclan', () => {
  it('likes de posts distintos y alertas distintas quedan en grupos separados', async () => {
    assert.notEqual(
      pushGroupKey(PUSH_KIND.LIKE, 'owner', 'post-a'),
      pushGroupKey(PUSH_KIND.LIKE, 'owner', 'post-b')
    );
    assert.notEqual(
      pushGroupKey(PUSH_KIND.ALERT_COMMENT, 'owner', 'alert-luna'),
      pushGroupKey(PUSH_KIND.ALERT_COMMENT, 'owner', 'alert-max')
    );
    const { env, rows } = createBatchEnv();
    const { notifyUserPush, sent } = createPushRecorder();
    const now = 9_000_000;
    await ingestPushEvent(env, notifyUserPush, {
      kind: PUSH_KIND.LIKE,
      actorId: 'maria',
      actorName: 'María',
      recipientId: 'owner',
      targetId: 'post-a',
      now,
    });
    await ingestPushEvent(env, notifyUserPush, {
      kind: PUSH_KIND.LIKE,
      actorId: 'lucas',
      actorName: 'Lucas',
      recipientId: 'owner',
      targetId: 'post-b',
      now,
    });
    assert.equal(rows.size, 2);
    await flushDuePushBatches(env, notifyUserPush, now + PUSH_BATCH_MINUTES.SOCIAL * 60_000);
    assert.equal(sent.length, 2);
    const posts = sent.map((s) => s.message.data.postId).sort();
    assert.deepEqual(posts, ['post-a', 'post-b']);
  });
});

describe('10. Actividad interna no desaparece por agrupar push', () => {
  it('el Worker escribe el evento fuente antes del ingest y el flush no borra Activity', () => {
    const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
    const batches = readFileSync(join(root, 'worker/pushBatches.js'), 'utf8');
    const comment = worker.slice(worker.indexOf("action === 'comment'"), worker.indexOf("action === 'createAlert'"));
    assert.match(comment, /INSERT INTO comments/);
    assert.ok(comment.indexOf('INSERT INTO comments') < comment.indexOf('ingestPushEvent'));
    const like = worker.slice(worker.indexOf("action === 'like'"), worker.indexOf("action === 'save'"));
    assert.match(like, /INSERT OR IGNORE INTO likes/);
    assert.ok(like.indexOf('INSERT OR IGNORE INTO likes') < like.indexOf('ingestPushEvent'));
    assert.doesNotMatch(batches, /DELETE FROM comments/);
    assert.doesNotMatch(batches, /DELETE FROM likes/);
    assert.doesNotMatch(batches, /DELETE FROM follows/);
    assert.doesNotMatch(batches, /DELETE FROM alert_comments/);
    assert.doesNotMatch(batches, /DELETE FROM activity_events/);
    assert.match(worker, /action === 'notifications'/);
  });
});

describe('11. preferencias / categorías no rompen el sistema existente', () => {
  it('defaults previos se conservan y las nuevas claves solo se suman', () => {
    const merged = mergeNotificationPrefs(null);
    assert.equal(merged.location, true);
    assert.equal(merged.birthday, true);
    assert.equal(merged.lost_pet, true);
    assert.equal(merged.adoption, true);
    assert.equal(merged.comment, true);
    assert.equal(merged.like, false);
    assert.equal(merged.follow, true);
    assert.equal(merged.following_activity, true);
    assert.equal(prefAllows(merged, 'location'), true);
    assert.equal(prefAllows(merged, 'reel_like'), false);
    assert.equal(prefAllows(merged, 'reel_comment'), true);
    assert.equal(prefAllows(merged, 'follow'), true);
    assert.equal(prefAllows(mergeNotificationPrefs({ comment: 0 }), 'alert_comment'), false);
    assert.equal(pushPrefKey(PUSH_KIND.LOCATION), 'location');
    assert.equal(pushPrefKey(PUSH_KIND.LIKE), 'like');
    assert.equal(DEFAULT_NOTIFICATION_PREFS.like, false);
    assert.ok(PUSH_PREF_CATEGORIES.some((c) => c.key === 'comment'));
  });
});

describe('12. deep-link conserva el target', () => {
  it('ubicación sigue yendo a Actividad; el resto usa rutas existentes', () => {
    assert.deepEqual(parsePushNav({ type: 'location', petId: 'pet-luna', shareId: 'loc-1', url: '/actividad' }), {
      kind: 'activity',
      petId: 'pet-luna',
      shareId: 'loc-1',
    });
    assert.deepEqual(pushNavDestination({ type: 'location', url: '/actividad', petId: 'pet-luna' }), {
      name: 'Tabs',
      params: { screen: 'Actividad' },
    });
    assert.deepEqual(parsePushNav({ type: 'alert_comment', alertId: 'alert-1', url: '/a/alert-1' }), {
      kind: 'alert',
      alertId: 'alert-1',
    });
    assert.deepEqual(pushNavDestination({ type: 'post_comment', postId: 'post-1', url: '/p/post-1' }), {
      name: 'PostDetail',
      params: { postId: 'post-1' },
    });
    assert.deepEqual(pushNavDestination({ type: 'listing_comment', listingId: 'list-1', url: '/m/list-1' }), {
      name: 'ListingDetail',
      params: { listingId: 'list-1' },
    });
    assert.deepEqual(pushNavDestination({ type: 'follow_pet', petId: 'pet-luna', url: '/actividad' }), {
      name: 'PetProfile',
      params: { petId: 'pet-luna' },
    });
    assert.deepEqual(pushNavDestination({ type: 'follow_user', userId: 'u-1', url: '/actividad' }), {
      name: 'UserProfile',
      params: { userId: 'u-1' },
    });
    assert.deepEqual(pushNavDestination({ type: 'follow_page', profileId: 'page-1', url: '/actividad' }), {
      name: 'PublicProfile',
      params: { profileId: 'page-1' },
    });
  });
});

describe('mercado, digest y sanitizado', () => {
  it('consulta de listing es inmediata y no agrupa', async () => {
    const { env, rows } = createBatchEnv();
    const { notifyUserPush, sent } = createPushRecorder();
    const r = await ingestPushEvent(env, notifyUserPush, {
      kind: PUSH_KIND.LISTING_COMMENT,
      actorId: 'lucas',
      actorName: 'Lucas',
      recipientId: 'seller',
      targetId: 'list-1',
      listingTitle: 'Correa para perro',
      now: 10_000_000,
    });
    assert.equal(r.action, 'immediate');
    assert.equal(rows.size, 0);
    assert.equal(sent[0].message.title, 'Nueva consulta por tu publicación');
    assert.equal(sent[0].message.body, 'Lucas preguntó por Correa para perro.');
    assert.equal(listingInquiryCopy('Lucas', 'Correa para perro').body, 'Lucas preguntó por Correa para perro.');
  });

  it('digest y respuestas quedan clasificados pero diferidos', () => {
    assert.equal(PUSH_KIND_DEFERRED.ADOPTION_NEARBY, 'adoption_nearby');
    assert.equal(PUSH_KIND_DEFERRED.PET_MARKED_ADOPTED, 'pet_marked_adopted');
    assert.equal(PUSH_KIND_DEFERRED.COMMENT_REPLY, 'comment_reply');
    assert.equal(PUSH_BATCH_MINUTES.ALERT_COMMENT, 15);
    assert.equal(PUSH_BATCH_MINUTES.POST_COMMENT, 20);
    assert.equal(PUSH_BATCH_MINUTES.SOCIAL, 60);
    assert.equal(sanitizePushPreview('Creo que la vi\nen -34.603  lat 123'), 'Creo que la vi en -34.603 lat 123');
    assert.equal(extraPeopleCount(6), 5);
    assert.equal(firstAlertCommentCopy('María', 'Luna.pet').title, 'María comentó en tu alerta de Luna.pet');
    assert.equal(firstPostCommentCopy('María').title, 'María comentó tu publicación');
    assert.equal(groupedLikeCopy('María', 8).title, 'A María y 8 personas más les gustó tu publicación.');
  });
});
