// Reels + Mux (Direct Upload, webhook, feed, social, cleanup).
// El archivo de video NUNCA atraviesa este Worker.
// Secrets: MUX_TOKEN_ID, MUX_TOKEN_SECRET, MUX_WEBHOOK_SECRET (no loguear).
// DELETE real a Mux solo si MUX_CLEANUP_ENABLED === '1'.

import {
  REEL_CAPTION_MAX,
  REEL_FEED_PAGE,
  REEL_STALE_UPLOAD_MS,
  REEL_UPLOAD_TIMEOUT_SEC,
  REEL_UPLOADS_PER_DAY,
  REEL_UPLOADS_PER_HOUR,
  applyMuxWebhookEvent,
  clientDurationRejects,
  isAllowedReelMime,
  isPublicReel,
  isReelFileTooLarge,
  muxCleanupEnabled,
  muxHlsUrl,
  muxThumbnailUrl,
  normalizeReelMime,
  planReelCleanup,
  reelUploadLimited,
} from '../lib/reels.ts';
import { REELS_SCHEMA_STATEMENTS, reelsSchemaApplyEnabled } from '../lib/reelsSchema.ts';
import { verifyMuxSignature } from '../lib/reelsWebhook.ts';
import { parseReelOverlays, serializeReelOverlays } from '../lib/reelOverlays.ts';
import { authorizeOwnedPetId, authorizeOwnedProfileId } from '../lib/reelAuth.ts';
import {
  POST_PET_IDENTITY_ERROR,
  POST_PET_NOT_OWNED_ERROR,
  petAllowedForAuthorIdentity,
} from '../lib/petOwnership.ts';
import { clampReelGridLimit, profileReelsOwnerStatuses } from '../lib/reelGrid.ts';
import {
  planReelCommentPush,
  planReelLikePush,
  reelCommentPushIdempotencyKey,
  reelLikePushIdempotencyKey,
  reelPushRecipient,
  sanitizeReelCommentPreview,
} from '../lib/reelActivity.ts';
import { displayPersonName, reelCommentPushMessage, reelLikePushMessage } from '../lib/pushPolicy.ts';
import { applyStoryMuxWebhookEvent, isStoryId } from '../lib/stories.ts';

async function d1(env, sql, params = []) {
  const res = await env.DB.prepare(sql).bind(...params).all();
  return res.results || [];
}

export async function ensureReelsSchema(env) {
  if (env._reelsReady) return;
  // Por defecto no toca D1: la migración consciente es la fuente de verdad.
  // Solo aplica SQL si REELS_SCHEMA_APPLY=1 (mismos statements que 001_reels.sql).
  if (!reelsSchemaApplyEnabled(env.REELS_SCHEMA_APPLY)) {
    env._reelsReady = true;
    return;
  }
  for (const sql of REELS_SCHEMA_STATEMENTS) {
    await d1(env, sql);
  }
  env._reelsReady = true;
}

const REEL_SELECT = `
  SELECT r.*,
    (SELECT COUNT(*) FROM reel_likes l WHERE l.reel_id = r.id) AS like_count,
    (SELECT COUNT(*) FROM reel_comments c WHERE c.reel_id = r.id) AS comment_count,
    pet.name AS pet_name, pet.emoji AS pet_emoji, pet.avatar_url AS pet_avatar,
    pet.species AS pet_species, pet.username AS pet_username,
    u.username AS username, u.name AS user_name,
    ap.id AS author_profile_id, ap.type AS author_profile_type, ap.name AS author_profile_name,
    ap.username AS author_profile_username, ap.avatar_url AS author_profile_avatar
  FROM reels r
  LEFT JOIN pets pet ON pet.id = r.pet_id
  LEFT JOIN users u ON u.id = r.user_id
  LEFT JOIN profiles ap ON ap.id = r.author_profile_id
`;

function reelRow(r, viewerLiked) {
  const playbackId = r.mux_playback_id || null;
  return {
    id: r.id,
    userId: r.user_id,
    petId: r.pet_id,
    caption: r.caption || '',
    status: r.status,
    moderation: r.moderation || 'none',
    durationMs: r.duration_ms ?? null,
    width: r.width ?? null,
    height: r.height ?? null,
    createdAt: r.created_at,
    readyAt: r.ready_at || null,
    likeCount: r.like_count || 0,
    commentCount: r.comment_count || 0,
    isLiked: !!viewerLiked,
    petName: r.pet_name || null,
    petEmoji: r.pet_emoji || null,
    petAvatar: r.pet_avatar || null,
    petSpecies: r.pet_species || null,
    petUsername: r.pet_username || null,
    username: r.username || null,
    userName: r.user_name || null,
    authorProfileId: r.author_profile_id || null,
    authorProfileType: r.author_profile_type || null,
    authorProfileName: r.author_profile_name || null,
    authorProfileUsername: r.author_profile_username || null,
    authorProfileAvatar: r.author_profile_avatar || null,
    playbackId,
    hlsUrl: playbackId ? muxHlsUrl(playbackId) : null,
    thumbnailUrl: playbackId ? muxThumbnailUrl(playbackId) : null,
    overlays: parseReelOverlays(r.overlays_json),
  };
}

async function attachReelLikes(env, rows, viewerId) {
  if (!viewerId || rows.length === 0) return rows.map((r) => reelRow(r, false));
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => '?').join(',');
  const liked = await d1(env, `SELECT reel_id FROM reel_likes WHERE user_id = ? AND reel_id IN (${ph})`, [viewerId, ...ids]);
  const set = new Set(liked.map((l) => l.reel_id));
  return rows.map((r) => reelRow(r, set.has(r.id)));
}

export function muxConfigured(env) {
  return !!(env.MUX_TOKEN_ID && env.MUX_TOKEN_SECRET);
}

export async function muxApi(env, path, method, body) {
  if (!muxConfigured(env)) return { ok: false, status: 503, json: { error: 'Mux no configurado' } };
  const auth = btoa(`${env.MUX_TOKEN_ID}:${env.MUX_TOKEN_SECRET}`);
  const resp = await fetch(`https://api.mux.com${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, json };
}

export async function muxDeleteAsset(env, assetId) {
  if (!assetId) return { skipped: true, reason: 'no_asset' };
  if (!muxCleanupEnabled(env.MUX_CLEANUP_ENABLED)) {
    return { skipped: true, reason: 'cleanup_disabled' };
  }
  if (!muxConfigured(env)) return { skipped: true, reason: 'mux_unconfigured' };
  const res = await muxApi(env, `/video/v1/assets/${assetId}`, 'DELETE');
  return { skipped: false, ok: res.ok, status: res.status };
}

async function findReelForMuxEvent(env, data) {
  const passthrough = data && (data.passthrough || (data.new_asset_settings && data.new_asset_settings.passthrough));
  if (passthrough) {
    const rows = await d1(env, 'SELECT * FROM reels WHERE id = ?', [String(passthrough)]);
    if (rows[0]) return rows[0];
  }
  const uploadId = data && (data.upload_id || data.id);
  if (uploadId) {
    const rows = await d1(env, 'SELECT * FROM reels WHERE mux_upload_id = ?', [String(uploadId)]);
    if (rows[0]) return rows[0];
  }
  const assetId = data && data.asset_id;
  if (assetId) {
    const rows = await d1(env, 'SELECT * FROM reels WHERE mux_asset_id = ?', [String(assetId)]);
    if (rows[0]) return rows[0];
  }
  if (data && data.id) {
    const rows = await d1(env, 'SELECT * FROM reels WHERE mux_asset_id = ?', [String(data.id)]);
    if (rows[0]) return rows[0];
  }
  return null;
}

function applyPatchSql(patch) {
  const map = {
    status: 'status',
    mux_upload_id: 'mux_upload_id',
    mux_asset_id: 'mux_asset_id',
    mux_playback_id: 'mux_playback_id',
    mux_last_event_id: 'mux_last_event_id',
    duration_ms: 'duration_ms',
    width: 'width',
    height: 'height',
    error: 'error',
    cleanup_needed: 'cleanup_needed',
    ready_at: 'ready_at',
    deleted_at: 'deleted_at',
  };
  const sets = [];
  const vals = [];
  for (const [k, col] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) {
      sets.push(`${col} = ?`);
      vals.push(patch[k]);
    }
  }
  return { sets, vals };
}

export async function handleMuxWebhook(request, env, json) {
  await ensureReelsSchema(env);
  const raw = await request.text();
  const header = request.headers.get('mux-signature') || request.headers.get('Mux-Signature') || '';
  const secret = env.MUX_WEBHOOK_SECRET;
  if (!secret) return json({ error: 'Webhook no configurado' }, 503);
  if (!verifyMuxSignature(raw, header, secret, Date.now())) {
    return json({ error: 'Firma inválida' }, 401);
  }
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }
  const eventId = String(event.id || '');
  const type = String(event.type || '');
  const now = Date.now();
  if (eventId) {
    const seen = await d1(env, 'SELECT id FROM mux_webhook_events WHERE id = ?', [eventId]);
    if (seen[0]) return json({ ok: true, duplicate: true });
  }
  const reel = await findReelForMuxEvent(env, event.data || {});
  if (!reel) {
    const story = await findStoryRowForMuxEvent(env, event.data || {});
    if (story) {
      if (eventId) {
        await d1(
          env,
          'INSERT OR IGNORE INTO mux_webhook_events (id, type, reel_id, created_at) VALUES (?, ?, ?, ?)',
          [eventId, type, null, now]
        );
      }
      const appliedStory = applyStoryMuxWebhookEvent(story, event);
      if (appliedStory.skip) return json({ ok: true, skipped: appliedStory.reason || 'story_skip' });
      const storyPatch = { ...appliedStory.patch };
      const mapped = applyStoryWebhookPatchSql(storyPatch);
      if (mapped.sets.length) {
        await d1(env, `UPDATE stories SET ${mapped.sets.join(', ')} WHERE id = ?`, [...mapped.vals, story.id]);
      }
      if (appliedStory.requestMuxDelete && (storyPatch.mux_asset_id || story.mux_asset_id)) {
        const del = await muxDeleteAsset(env, storyPatch.mux_asset_id || story.mux_asset_id);
        if (!del.skipped && del.ok) {
          await d1(env, 'UPDATE stories SET media_deleted_at = ?, cleanup_needed = 0 WHERE id = ?', [now, story.id]);
        }
      }
      return json({ ok: true, story: true });
    }
  }
  const applied = applyMuxWebhookEvent(reel, event);
  if (eventId) {
    await d1(
      env,
      'INSERT OR IGNORE INTO mux_webhook_events (id, type, reel_id, created_at) VALUES (?, ?, ?, ?)',
      [eventId, type, reel ? reel.id : null, now]
    );
  }
  if (!reel || applied.skip) return json({ ok: true, skipped: applied.reason || 'no_reel' });

  const patch = { ...applied.patch };
  if (patch.status === 'ready') patch.ready_at = now;
  if (patch.status === 'deleted') patch.deleted_at = reel.deleted_at || now;
  const { sets, vals } = applyPatchSql(patch);
  if (sets.length) {
    await d1(env, `UPDATE reels SET ${sets.join(', ')} WHERE id = ?`, [...vals, reel.id]);
  }
  if (applied.requestMuxDelete && (patch.mux_asset_id || reel.mux_asset_id)) {
    const del = await muxDeleteAsset(env, patch.mux_asset_id || reel.mux_asset_id);
    if (!del.skipped && del.ok) {
      await d1(env, 'UPDATE reels SET cleanup_needed = 0 WHERE id = ?', [reel.id]);
    }
  }
  return json({ ok: true });
}

async function findStoryRowForMuxEvent(env, data) {
  const passthrough = data && (data.passthrough || (data.new_asset_settings && data.new_asset_settings.passthrough));
  if (passthrough && isStoryId(String(passthrough))) {
    const rows = await d1(env, 'SELECT * FROM stories WHERE id = ?', [String(passthrough)]);
    if (rows[0]) return rows[0];
  }
  if (passthrough && !isStoryId(String(passthrough))) return null;
  const uploadId = data && (data.upload_id || data.id);
  if (uploadId) {
    const rows = await d1(env, 'SELECT * FROM stories WHERE mux_upload_id = ?', [String(uploadId)]);
    if (rows[0]) return rows[0];
  }
  const assetId = data && (data.asset_id || data.id);
  if (assetId) {
    const rows = await d1(env, 'SELECT * FROM stories WHERE mux_asset_id = ?', [String(assetId)]);
    if (rows[0]) return rows[0];
  }
  return null;
}

function applyStoryWebhookPatchSql(patch) {
  const map = {
    status: 'status',
    mux_upload_id: 'mux_upload_id',
    mux_asset_id: 'mux_asset_id',
    mux_playback_id: 'mux_playback_id',
    mux_last_event_id: 'mux_last_event_id',
    duration_ms: 'duration_ms',
    error: 'error',
    cleanup_needed: 'cleanup_needed',
  };
  const sets = [];
  const vals = [];
  for (const [k, col] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) {
      sets.push(`${col} = ?`);
      vals.push(patch[k]);
    }
  }
  return { sets, vals };
}

export async function runReelCleanup(env, nowMs) {
  await ensureReelsSchema(env);
  const rows = await d1(
    env,
    `SELECT * FROM reels WHERE
      (status = 'uploading' AND created_at <= ?)
      OR cleanup_needed = 1
      OR (status IN ('rejected', 'upload_failed', 'processing_failed', 'deleted') AND mux_asset_id IS NOT NULL)
     LIMIT 40`,
    [nowMs - REEL_STALE_UPLOAD_MS]
  );
  const plan = planReelCleanup(rows, nowMs);
  let scanned = plan.length;
  let muxDeletes = 0;
  for (const action of plan) {
    if (action.markDeleted) {
      await d1(
        env,
        "UPDATE reels SET status = 'upload_failed', error = 'stale_upload', cleanup_needed = 1, deleted_at = COALESCE(deleted_at, ?) WHERE id = ?",
        [nowMs, action.reelId]
      );
    }
    if (action.muxAssetId) {
      const del = await muxDeleteAsset(env, action.muxAssetId);
      if (!del.skipped && del.ok) {
        muxDeletes += 1;
        await d1(env, 'UPDATE reels SET cleanup_needed = 0, mux_asset_id = mux_asset_id WHERE id = ?', [action.reelId]);
        await d1(env, 'UPDATE reels SET cleanup_needed = 0 WHERE id = ?', [action.reelId]);
      }
    }
  }
  return { scanned, muxDeletes, executeMux: muxCleanupEnabled(env.MUX_CLEANUP_ENABLED) };
}

export async function handlePublicReelAction(env, body, json, clean, request, authUser) {
  const action = clean(body.action, 40);
  const now = Date.now();

  if (action === 'reelsFeed') {
    const before = Number(body.before) || now + 1000;
    const limit = Math.min(Number(body.limit) || REEL_FEED_PAGE, 20);
    const rows = await d1(
      env,
      `${REEL_SELECT} WHERE r.status = 'ready' AND r.deleted_at IS NULL AND r.moderation = 'none' AND r.created_at < ? ORDER BY r.created_at DESC LIMIT ?`,
      [before, limit]
    );
    const viewerId = await authUser(request, env, body);
    return json({ ok: true, reels: await attachReelLikes(env, rows, viewerId), hasMore: rows.length === limit });
  }

  if (action === 'reelDetail') {
    const reelId = clean(body.reelId, 80);
    const rows = await d1(env, `${REEL_SELECT} WHERE r.id = ?`, [reelId]);
    if (!rows[0] || !isPublicReel({ status: rows[0].status, deletedAt: rows[0].deleted_at, moderation: rows[0].moderation })) {
      return json({ error: 'Reel no encontrado' }, 404);
    }
    const comments = await d1(
      env,
      `SELECT c.*, u.username, u.name AS user_name, u.avatar_url
       FROM reel_comments c LEFT JOIN users u ON u.id = c.user_id
       WHERE c.reel_id = ? ORDER BY c.created_at ASC LIMIT 200`,
      [reelId]
    );
    const viewerId = await authUser(request, env, body);
    const [mapped] = await attachReelLikes(env, rows, viewerId);
    return json({
      ok: true,
      reel: mapped,
      comments: comments.map((c) => ({
        id: c.id,
        userId: c.user_id,
        username: c.username || 'usuario',
        userName: c.user_name || 'Usuario',
        avatarUrl: c.avatar_url || null,
        text: c.text,
        createdAt: c.created_at,
      })),
    });
  }

  if (action === 'profileReels' || action === 'petReels' || action === 'userReels') {
    const before = Number(body.before) || now + 1000;
    const limit = clampReelGridLimit(body.limit);
    const viewerId = await authUser(request, env, body);

    if (action === 'profileReels') {
      const profileId = clean(body.profileId, 80);
      const profiles = await d1(env, 'SELECT id, account_id FROM profiles WHERE id = ?', [profileId]);
      if (!profiles[0]) return json({ error: 'Perfil no encontrado' }, 404);
      const isOwner = !!(viewerId && profiles[0].account_id === viewerId);
      const statuses = profileReelsOwnerStatuses(isOwner);
      const ph = statuses.map(() => '?').join(',');
      const extra = isOwner ? '' : " AND r.moderation = 'none'";
      const rows = await d1(
        env,
        `${REEL_SELECT} WHERE r.author_profile_id = ? AND r.deleted_at IS NULL AND r.status IN (${ph})${extra} AND r.created_at < ? ORDER BY r.created_at DESC LIMIT ?`,
        [profileId, ...statuses, before, limit]
      );
      return json({ ok: true, reels: await attachReelLikes(env, rows, viewerId), hasMore: rows.length === limit });
    }

    if (action === 'petReels') {
      const petId = clean(body.petId, 80);
      const pets = await d1(env, 'SELECT id FROM pets WHERE id = ?', [petId]);
      if (!pets[0]) return json({ error: 'Mascota no encontrada' }, 404);
      const rows = await d1(
        env,
        `${REEL_SELECT} WHERE r.pet_id = ? AND r.status = 'ready' AND r.deleted_at IS NULL AND r.moderation = 'none' AND r.created_at < ? ORDER BY r.created_at DESC LIMIT ?`,
        [petId, before, limit]
      );
      return json({ ok: true, reels: await attachReelLikes(env, rows, viewerId), hasMore: rows.length === limit });
    }

    const targetUserId = clean(body.userId, 80);
    if (!targetUserId) return json({ error: 'Usuario requerido' }, 400);
    const isOwner = !!(viewerId && viewerId === targetUserId);
    const statuses = profileReelsOwnerStatuses(isOwner);
    const ph = statuses.map(() => '?').join(',');
    const extra = isOwner ? '' : " AND r.moderation = 'none'";
    const rows = await d1(
      env,
      `${REEL_SELECT} WHERE r.user_id = ? AND r.deleted_at IS NULL AND r.status IN (${ph})${extra}
        AND (r.author_profile_id IS NULL OR EXISTS (
          SELECT 1 FROM profiles p WHERE p.id = r.author_profile_id AND p.account_id = r.user_id AND p.type = 'personal'
        ))
        AND r.created_at < ? ORDER BY r.created_at DESC LIMIT ?`,
      [targetUserId, ...statuses, before, limit]
    );
    return json({ ok: true, reels: await attachReelLikes(env, rows, viewerId), hasMore: rows.length === limit });
  }

  if (action === 'reelComments') {
    const reelId = clean(body.reelId, 80);
    const rows = await d1(
      env,
      `SELECT c.*, u.username, u.name AS user_name, u.avatar_url
       FROM reel_comments c LEFT JOIN users u ON u.id = c.user_id
       WHERE c.reel_id = ? ORDER BY c.created_at ASC LIMIT 200`,
      [reelId]
    );
    return json({
      ok: true,
      comments: rows.map((c) => ({
        id: c.id,
        userId: c.user_id,
        username: c.username || 'usuario',
        userName: c.user_name || 'Usuario',
        avatarUrl: c.avatar_url || null,
        text: c.text,
        createdAt: c.created_at,
      })),
    });
  }

  return null;
}

export async function handleAuthReelAction(env, body, json, clean, userId, notifyUserPush) {
  const action = clean(body.action, 40);
  const now = Date.now();

  if (action === 'createReelUpload') {
    const mime = normalizeReelMime(body.mime);
    const bytes = Number(body.byteSize);
    const durationMs = body.durationMs == null ? null : Number(body.durationMs);
    const caption = clean(body.caption, REEL_CAPTION_MAX);
    const overlaysJson = serializeReelOverlays(body.overlays);
    if (!mime) return json({ error: 'Formato no soportado. Usá MP4 o MOV.' }, 400);
    // byteSize es declarado por el cliente. El archivo va directo a Mux.
    if (Number.isFinite(bytes) && isReelFileTooLarge(bytes)) return json({ error: 'El video puede pesar hasta 50 MB.' }, 413);
    if (clientDurationRejects(durationMs)) return json({ error: 'Los Reels pueden durar hasta 30 segundos.' }, 400);

    let authorProfileId = clean(body.authorProfileId, 80) || null;
    const ownedProfiles = await d1(env, 'SELECT id, type, account_id FROM profiles WHERE account_id = ?', [userId]);
    const personalId = (ownedProfiles.find((p) => p.type === 'personal') || {}).id || null;
    const profileAuth = authorizeOwnedProfileId(authorProfileId, ownedProfiles.map((p) => p.id), personalId);
    if (!profileAuth.ok) return json({ error: profileAuth.error }, profileAuth.status);
    authorProfileId = profileAuth.profileId;
    const authorRow = authorProfileId
      ? ownedProfiles.find((p) => p.id === authorProfileId) || null
      : null;

    const petRequested = clean(body.petId, 80) || null;
    const ownedPets = petRequested
      ? await d1(env, 'SELECT id, user_id, profile_id FROM pets WHERE id = ? AND user_id = ?', [petRequested, userId])
      : [];
    const petAuth = authorizeOwnedPetId(petRequested, ownedPets.map((p) => p.id));
    if (!petAuth.ok) return json({ error: POST_PET_NOT_OWNED_ERROR }, petAuth.status);
    const petId = petAuth.petId;
    const ownedPet = ownedPets[0] || null;
    if (ownedPet) {
      let petProfile = null;
      if (ownedPet.profile_id) {
        const prs = await d1(env, 'SELECT id, type, account_id FROM profiles WHERE id = ?', [ownedPet.profile_id]);
        petProfile = prs[0] || null;
      }
      const gate = petAllowedForAuthorIdentity({
        accountId: userId,
        pet: { userId: ownedPet.user_id, profileId: ownedPet.profile_id },
        author: authorRow
          ? { id: authorRow.id, type: authorRow.type, accountId: authorRow.account_id }
          : null,
        petProfile: petProfile
          ? { id: petProfile.id, type: petProfile.type, accountId: petProfile.account_id }
          : null,
      });
      if (!gate.ok) {
        if (gate.code === 'pet_not_owned') return json({ error: POST_PET_NOT_OWNED_ERROR }, 403);
        return json({ error: POST_PET_IDENTITY_ERROR }, 403);
      }
    }

    if (!muxConfigured(env)) return json({ error: 'Mux no configurado' }, 503);

    const hourAgo = now - 60 * 60 * 1000;
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const hourRows = await d1(env, 'SELECT COUNT(*) AS n FROM reel_upload_attempts WHERE user_id = ? AND created_at > ?', [userId, hourAgo]);
    const dayRows = await d1(env, 'SELECT COUNT(*) AS n FROM reel_upload_attempts WHERE user_id = ? AND created_at > ?', [userId, dayAgo]);
    if (reelUploadLimited(hourRows[0]?.n || 0, dayRows[0]?.n || 0)) {
      return json({ error: `Límite de subidas: ${REEL_UPLOADS_PER_HOUR}/hora o ${REEL_UPLOADS_PER_DAY}/día` }, 429);
    }

    const attemptId = `rua-${now}-${Math.random().toString(36).slice(2, 8)}`;
    await d1(env, 'INSERT INTO reel_upload_attempts (id, user_id, created_at) VALUES (?, ?, ?)', [attemptId, userId, now]);

    const id = `reel-${now}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      await d1(
        env,
        `INSERT INTO reels (id, user_id, author_profile_id, pet_id, caption, overlays_json, status, moderation, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'uploading', 'none', ?)`,
        [id, userId, authorProfileId, petId, caption, overlaysJson, now]
      );
    } catch {
      await d1(
        env,
        `INSERT INTO reels (id, user_id, author_profile_id, pet_id, caption, status, moderation, created_at)
         VALUES (?, ?, ?, ?, ?, 'uploading', 'none', ?)`,
        [id, userId, authorProfileId, petId, caption, now]
      );
    }

    const mux = await muxApi(env, '/video/v1/uploads', 'POST', {
      cors_origin: '*',
      timeout: REEL_UPLOAD_TIMEOUT_SEC,
      new_asset_settings: {
        playback_policies: ['public'],
        video_quality: 'basic',
        max_resolution_tier: '1080p',
        passthrough: id,
      },
    });
    const upload = mux.json && mux.json.data;
    if (!mux.ok || !upload || !upload.url || !upload.id) {
      await d1(env, "UPDATE reels SET status = 'upload_failed', error = 'mux_create_failed' WHERE id = ?", [id]);
      return json({ error: 'No se pudo autorizar la subida' }, 502);
    }
    await d1(env, 'UPDATE reels SET mux_upload_id = ? WHERE id = ?', [upload.id, id]);
    return json({
      ok: true,
      reelId: id,
      uploadUrl: upload.url,
      timeoutSec: REEL_UPLOAD_TIMEOUT_SEC,
    });
  }

  if (action === 'completeReelUpload') {
    const reelId = clean(body.reelId, 80);
    const rows = await d1(env, 'SELECT * FROM reels WHERE id = ? AND user_id = ?', [reelId, userId]);
    if (!rows[0]) return json({ error: 'Ese Reel no es tuyo' }, 403);
    if (rows[0].status === 'uploading') {
      await d1(env, "UPDATE reels SET status = 'processing' WHERE id = ?", [reelId]);
    }
    return json({ ok: true, status: rows[0].status === 'uploading' ? 'processing' : rows[0].status });
  }

  if (action === 'cancelReelUpload') {
    const reelId = clean(body.reelId, 80);
    const rows = await d1(env, 'SELECT * FROM reels WHERE id = ? AND user_id = ?', [reelId, userId]);
    if (!rows[0]) return json({ error: 'Ese Reel no es tuyo' }, 403);
    if (rows[0].status === 'ready') return json({ error: 'Ya está publicado' }, 400);
    await d1(
      env,
      "UPDATE reels SET status = 'upload_failed', error = 'cancelled', cleanup_needed = 1 WHERE id = ?",
      [reelId]
    );
    return json({ ok: true });
  }

  if (action === 'myReel') {
    const reelId = clean(body.reelId, 80);
    const rows = await d1(env, `${REEL_SELECT} WHERE r.id = ? AND r.user_id = ?`, [reelId, userId]);
    if (!rows[0]) return json({ error: 'Reel no encontrado' }, 404);
    return json({ ok: true, reel: reelRow(rows[0], false) });
  }

  if (action === 'myReelState') {
    const likes = await d1(env, 'SELECT reel_id FROM reel_likes WHERE user_id = ?', [userId]);
    let pendingReels = [];
    let failedReels = [];
    try {
      const pending = await d1(
        env,
        `${REEL_SELECT} WHERE r.user_id = ? AND r.status IN ('uploading', 'processing') AND r.deleted_at IS NULL ORDER BY r.created_at DESC LIMIT 5`,
        [userId]
      );
      const failed = await d1(
        env,
        `${REEL_SELECT} WHERE r.user_id = ? AND r.status IN ('upload_failed', 'processing_failed', 'rejected') AND r.deleted_at IS NULL ORDER BY r.created_at DESC LIMIT 5`,
        [userId]
      );
      pendingReels = pending.map((r) => reelRow(r, false));
      failedReels = failed.map((r) => reelRow(r, false));
    } catch {
      // overlays_json u otras columnas nuevas pueden faltar hasta migration 002.
    }
    return json({
      ok: true,
      state: { likedReels: likes.map((r) => r.reel_id), pendingReels, failedReels },
    });
  }

  // Like/comment: user_id de la CUENTA autenticada (igual que posts).
  // No se usa el perfil empresa/protector activo.
  if (action === 'reelLike') {
    const reelId = clean(body.reelId, 80);
    const pub = await d1(env, 'SELECT id, user_id, status, deleted_at, moderation FROM reels WHERE id = ?', [reelId]);
    const reelPublic = !!(pub[0] && isPublicReel({ status: pub[0].status, deletedAt: pub[0].deleted_at, moderation: pub[0].moderation }));
    if (!reelPublic) return json({ error: 'Reel no encontrado' }, 404);
    let likeInserted = false;
    if (body.value) {
      const ins = await env.DB.prepare(
        'INSERT OR IGNORE INTO reel_likes (user_id, reel_id, created_at) VALUES (?, ?, ?)'
      )
        .bind(userId, reelId, now)
        .run();
      likeInserted = !!(ins && ins.meta && ins.meta.changes > 0);
    } else {
      await d1(env, 'DELETE FROM reel_likes WHERE user_id = ? AND reel_id = ?', [userId, reelId]);
    }
    const count = await d1(env, 'SELECT COUNT(*) AS n FROM reel_likes WHERE reel_id = ?', [reelId]);
    const plan = planReelLikePush({
      ownerId: pub[0].user_id,
      actorId: userId,
      reelId,
      reelPublic,
      likeValue: !!body.value,
      likeInserted,
    });
    if (plan.notify && typeof notifyUserPush === 'function') {
      try {
        const actors = await d1(env, 'SELECT name, username FROM users WHERE id = ?', [userId]);
        const actorName = displayPersonName(actors[0] || null) || 'Alguien';
        await notifyUserPush(env, {
          userId: reelPushRecipient(plan.ownerId, body),
          type: 'reel_like',
          idempotencyKey: reelLikePushIdempotencyKey(plan.reelId, plan.actorId),
          nowMs: now,
          buildMessage: (token) => reelLikePushMessage({ token, reelId: plan.reelId, actorName }),
        });
      } catch (_) {}
    }
    return json({ ok: true, likeCount: count[0].n });
  }

  if (action === 'reelComment') {
    const reelId = clean(body.reelId, 80);
    const text = clean(body.text, 500);
    if (!text) return json({ error: 'Comentario vacío' }, 400);
    const pub = await d1(env, 'SELECT id, user_id, status, deleted_at, moderation FROM reels WHERE id = ?', [reelId]);
    const reelPublic = !!(pub[0] && isPublicReel({ status: pub[0].status, deletedAt: pub[0].deleted_at, moderation: pub[0].moderation }));
    if (!reelPublic) return json({ error: 'Reel no encontrado' }, 404);
    const id = `rc-${now}-${Math.random().toString(36).slice(2, 8)}`;
    await d1(env, 'INSERT INTO reel_comments (id, reel_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)', [id, reelId, userId, text, now]);
    const plan = planReelCommentPush({
      ownerId: pub[0].user_id,
      actorId: userId,
      reelId,
      reelPublic,
      commentInserted: true,
    });
    if (plan.notify && typeof notifyUserPush === 'function') {
      try {
        const actors = await d1(env, 'SELECT name, username FROM users WHERE id = ?', [userId]);
        const actorName = displayPersonName(actors[0] || null) || 'Alguien';
        await notifyUserPush(env, {
          userId: reelPushRecipient(plan.ownerId, body),
          type: 'reel_comment',
          idempotencyKey: reelCommentPushIdempotencyKey(id),
          nowMs: now,
          buildMessage: (token) =>
            reelCommentPushMessage({
              token,
              reelId: plan.reelId,
              actorName,
              commentPreview: sanitizeReelCommentPreview(text),
            }),
        });
      } catch (_) {}
    }
    return json({ ok: true, id, createdAt: now });
  }

  if (action === 'deleteReel') {
    const reelId = clean(body.reelId, 80);
    const rows = await d1(env, 'SELECT * FROM reels WHERE id = ? AND user_id = ?', [reelId, userId]);
    if (!rows[0]) return json({ error: 'Ese Reel no es tuyo' }, 403);
    await d1(
      env,
      "UPDATE reels SET status = 'deleted', deleted_at = ?, cleanup_needed = 1 WHERE id = ?",
      [now, reelId]
    );
    const del = await muxDeleteAsset(env, rows[0].mux_asset_id);
    if (!del.skipped && del.ok) {
      await d1(env, 'UPDATE reels SET cleanup_needed = 0 WHERE id = ?', [reelId]);
    }
    return json({ ok: true, muxDeleted: !!(del && !del.skipped && del.ok) });
  }

  return null;
}
