// Agrupación persistente de push. Workers es stateless: la ventana vive en D1.
import { displayPersonName, payloadHasSensitiveLocation } from '../lib/pushPolicy.ts';
import {
  PUSH_BATCH_LIMITS,
  PUSH_KIND,
  batchFlushIdempotencyKey,
  decidePushDelivery,
  extraPeopleCount,
  firstAlertCommentCopy,
  shouldSkipGroupedFlush,
  firstPostCommentCopy,
  flushCopyForKind,
  listingInquiryCopy,
  pushGroupKey,
  pushPrefKey,
  uniqueAppend,
} from '../lib/pushCenter.ts';
import { lostBreedMatchNavData } from '../lib/lostBreedMatch.ts';

function parseJsonArray(raw) {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseExtra(raw) {
  try {
    const v = JSON.parse(raw || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

async function loadOpenBatch(env, groupKey, now) {
  const res = await env.DB.prepare('SELECT * FROM push_batches WHERE group_key = ?').bind(groupKey).all();
  const row = res?.results?.[0];
  if (!row) return null;
  if (row.flushed_at || Number(row.window_ends_at) <= now) return null;
  return {
    row,
    firstPushSent: Number(row.first_push_sent) === 1,
    windowEndsAt: Number(row.window_ends_at),
    flushedAt: row.flushed_at ? Number(row.flushed_at) : null,
  };
}

async function upsertBatch(env, input) {
  const actorIds = uniqueAppend([], input.actorId, PUSH_BATCH_LIMITS.MAX_UNIQUE_ACTORS);
  const subjectNames = input.subjectName
    ? uniqueAppend([], input.subjectName, PUSH_BATCH_LIMITS.MAX_SUBJECTS)
    : [];
  await env.DB.prepare(
    'DELETE FROM push_batches WHERE group_key = ? AND (flushed_at IS NOT NULL OR window_ends_at <= ?)'
  )
    .bind(input.groupKey, input.now)
    .run();
  await env.DB.prepare(
    `INSERT INTO push_batches (
      group_key, kind, recipient_user_id, target_id, first_actor_id, first_actor_name,
      actor_ids, subject_names, extra, first_push_sent, first_event_at, last_event_at, window_ends_at, flushed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(group_key) DO NOTHING`
  )
    .bind(
      input.groupKey,
      input.kind,
      input.recipientId,
      input.targetId || null,
      input.actorId || null,
      input.actorName || null,
      JSON.stringify(actorIds),
      JSON.stringify(subjectNames),
      JSON.stringify(input.extra || {}),
      input.firstPushSent ? 1 : 0,
      input.now,
      input.now,
      input.windowEndsAt
    )
    .run();
}

async function mergeIntoBatch(env, open, input) {
  const actorIds = uniqueAppend(parseJsonArray(open.row.actor_ids), input.actorId, PUSH_BATCH_LIMITS.MAX_UNIQUE_ACTORS);
  const subjectNames = uniqueAppend(
    parseJsonArray(open.row.subject_names),
    input.subjectName || '',
    PUSH_BATCH_LIMITS.MAX_SUBJECTS
  );
  const prev = parseExtra(open.row.extra);
  const incoming = input.extra || {};
  const foundAlertIds = uniqueAppend(
    Array.isArray(prev.foundAlertIds) ? prev.foundAlertIds.map(String) : [],
    incoming.foundAlertId || incoming.targetId || '',
    PUSH_BATCH_LIMITS.MAX_SUBJECTS
  );
  const extra = { ...prev, ...incoming, foundAlertIds };
  await env.DB.prepare(
    `UPDATE push_batches SET actor_ids = ?, subject_names = ?, extra = ?, last_event_at = ?
     WHERE group_key = ? AND flushed_at IS NULL`
  )
    .bind(JSON.stringify(actorIds), JSON.stringify(subjectNames), JSON.stringify(extra), input.now, input.groupKey)
    .run();
}

function navData(kind, extra, targetId) {
  if (kind === PUSH_KIND.LOST_BREED_MATCH) {
    const foundIds = Array.isArray(extra.foundAlertIds) && extra.foundAlertIds.length
      ? extra.foundAlertIds
      : extra.foundAlertId
        ? [extra.foundAlertId]
        : targetId
          ? [targetId]
          : [];
    return lostBreedMatchNavData({
      foundAlertIds: foundIds.map(String),
      lostAlertId: extra.lostAlertId || targetId,
      breedId: extra.breedId || '',
      placeId: extra.placeId || null,
      locality: extra.locality || null,
    });
  }
  if (kind === PUSH_KIND.ALERT_COMMENT) {
    return { type: 'alert_comment', alertId: targetId, url: `/a/${encodeURIComponent(targetId)}` };
  }
  if (kind === PUSH_KIND.POST_COMMENT || kind === PUSH_KIND.LIKE) {
    return { type: kind === PUSH_KIND.LIKE ? 'like' : 'post_comment', postId: targetId, url: `/p/${encodeURIComponent(targetId)}` };
  }
  if (kind === PUSH_KIND.LISTING_COMMENT) {
    return { type: 'listing_comment', listingId: targetId, url: `/m/${encodeURIComponent(targetId)}` };
  }
  if (kind === PUSH_KIND.FOLLOW_PET || kind === PUSH_KIND.PET_FOLLOWING) {
    return { type: kind, petId: extra.petId || targetId, url: '/actividad' };
  }
  if (kind === PUSH_KIND.FOLLOW_USER) {
    return { type: 'follow_user', userId: extra.actorId || targetId, url: '/actividad' };
  }
  if (kind === PUSH_KIND.FOLLOW_PAGE || kind === PUSH_KIND.PAGE_FOLLOWING) {
    return { type: kind, profileId: extra.profileId || targetId, url: '/actividad' };
  }
  return { type: kind, url: '/actividad' };
}

function safeCopy(copy) {
  if (payloadHasSensitiveLocation(copy)) {
    return { title: copy.title, body: 'Tenés actividad nueva en Animaldex.' };
  }
  return copy;
}

export async function ingestPushEvent(env, notifyUserPush, input) {
  const now = input.now || Date.now();
  const groupKey = input.groupKey || pushGroupKey(input.kind, input.recipientId, input.targetId);
  const open = await loadOpenBatch(env, groupKey, now);
  const decision = decidePushDelivery({
    kind: input.kind,
    actorId: input.actorId,
    recipientId: input.recipientId,
    now,
    openBatch: open,
  });

  if (decision.action === 'skip') return { action: 'skip', reason: decision.reason };

  const extra = {
    petName: input.petName || null,
    pageName: input.pageName || null,
    listingTitle: input.listingTitle || null,
    petId: input.petId || input.targetId || null,
    profileId: input.profileId || null,
    actorId: input.actorId || null,
    breedId: input.breedId || null,
    lostAlertId: input.lostAlertId || null,
    foundAlertId: input.foundAlertId || input.targetId || null,
    foundAlertIds: input.foundAlertId || input.targetId ? [input.foundAlertId || input.targetId] : [],
    placeId: input.placeId || null,
    locality: input.locality || null,
  };

  if (decision.action === 'immediate') {
    let copy =
      input.kind === PUSH_KIND.LISTING_COMMENT
        ? listingInquiryCopy(input.actorName, input.listingTitle)
        : input.kind === PUSH_KIND.ALERT_COMMENT
          ? firstAlertCommentCopy(input.actorName, input.petName, input.preview)
          : firstPostCommentCopy(input.actorName, input.preview);
    copy = safeCopy(copy);
    await notifyUserPush(env, {
      userId: input.recipientId,
      type: pushPrefKey(input.kind),
      idempotencyKey: input.idempotencyKey,
      nowMs: now,
      buildMessage: (token) => ({
        to: token,
        title: copy.title,
        body: copy.body,
        sound: 'default',
        priority: 'high',
        channelId: 'mascotas',
        data: navData(input.kind, extra, input.targetId),
      }),
    });
    return { action: 'immediate', reason: decision.reason };
  }

  if (decision.action === 'immediate_open') {
    let copy =
      input.kind === PUSH_KIND.ALERT_COMMENT
        ? firstAlertCommentCopy(input.actorName, input.petName, input.preview)
        : firstPostCommentCopy(input.actorName, input.preview);
    copy = safeCopy(copy);
    await notifyUserPush(env, {
      userId: input.recipientId,
      type: pushPrefKey(input.kind),
      idempotencyKey: input.idempotencyKey,
      nowMs: now,
      buildMessage: (token) => ({
        to: token,
        title: copy.title,
        body: copy.body,
        sound: 'default',
        priority: 'high',
        channelId: 'mascotas',
        data: navData(input.kind, extra, input.targetId),
      }),
    });
    await upsertBatch(env, {
      groupKey,
      kind: input.kind,
      recipientId: input.recipientId,
      targetId: input.targetId,
      actorId: input.actorId,
      actorName: input.actorName,
      subjectName: input.subjectName,
      extra,
      firstPushSent: true,
      now,
      windowEndsAt: now + decision.windowMs,
    });
    return { action: 'immediate_open', reason: decision.reason };
  }

  if (open) {
    await mergeIntoBatch(env, open, {
      groupKey,
      actorId: input.actorId,
      subjectName: input.subjectName,
      extra,
      now,
    });
  } else {
    await upsertBatch(env, {
      groupKey,
      kind: input.kind,
      recipientId: input.recipientId,
      targetId: input.targetId,
      actorId: input.actorId,
      actorName: input.actorName,
      subjectName: input.subjectName,
      extra,
      firstPushSent: false,
      now,
      windowEndsAt: now + decision.windowMs,
    });
  }
  return { action: 'enqueue', reason: decision.reason };
}

export async function flushDuePushBatches(env, notifyUserPush, nowMs = Date.now()) {
  const due = await env.DB.prepare(
    `SELECT * FROM push_batches
     WHERE flushed_at IS NULL AND window_ends_at <= ?
     ORDER BY window_ends_at ASC LIMIT ?`
  )
    .bind(nowMs, PUSH_BATCH_LIMITS.FLUSH_PAGE)
    .all();
  const rows = due?.results || [];
  let flushed = 0;
  for (const row of rows) {
    const mark = await env.DB.prepare(
      'UPDATE push_batches SET flushed_at = ? WHERE group_key = ? AND flushed_at IS NULL'
    )
      .bind(nowMs, row.group_key)
      .run();
    if (!mark || !mark.meta || mark.meta.changes < 1) continue;

    const actorIds = parseJsonArray(row.actor_ids);
    const extraCount = extraPeopleCount(actorIds.length);
    const extra = parseExtra(row.extra);
    extra.subjectNames = parseJsonArray(row.subject_names);
    extra.petName = extra.petName || null;
    extra.pageName = extra.pageName || null;
    const copy = safeCopy(
      flushCopyForKind(row.kind, row.first_actor_name || 'Alguien', extraCount, extra)
    );
    if (shouldSkipGroupedFlush({ firstPushSent: Number(row.first_push_sent) === 1, uniqueActorCount: actorIds.length })) {
      flushed += 1;
      continue;
    }
    await notifyUserPush(env, {
      userId: row.recipient_user_id,
      type: pushPrefKey(row.kind),
      idempotencyKey: batchFlushIdempotencyKey(row.group_key, row.window_ends_at),
      nowMs,
      buildMessage: (token) => ({
        to: token,
        title: copy.title,
        body: copy.body,
        sound: 'default',
        priority: 'default',
        channelId: 'mascotas',
        data: navData(row.kind, extra, row.target_id),
      }),
    }).catch(() => {});
    flushed += 1;
  }
  return { flushed };
}

export async function actorDisplayName(env, userId) {
  if (!userId) return 'Alguien';
  const rows = await env.DB.prepare('SELECT name, username FROM users WHERE id = ?').bind(userId).all();
  return displayPersonName(rows?.results?.[0] || null) || 'Alguien';
}
