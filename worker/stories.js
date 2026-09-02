// Stories MVP (D1 + Cloudflare Images + Mux).
// Schema: migrations/010_stories.sql. Solo se aplica si STORIES_SCHEMA_APPLY=1.
// Cleanup físico SOLO de assets de stories. Nunca toca reels/avatars/posts/alerts.

import {
  STORY_CAPTION_MAX,
  STORY_COMMENT_MAX,
  STORY_EXPIRED_MESSAGE,
  STORY_IMAGE_KIND,
  STORY_METADATA_RETENTION_MS,
  STORY_RATE_LIMIT_MESSAGE,
  STORY_VIDEO_MAX_BYTES,
  applyStoryMuxWebhookEvent,
  canDeleteStory,
  cfIdFromImageUrl,
  clientStoryVideoRejects,
  isStoryId,
  planStoryCleanup,
  resolveStoryAudience,
  resolveStoryBreedFromPet,
  storyCommentAllowed,
  storyExpiresAt,
  storyIdentityKey,
  storyImageThumbUrl,
  storyMediaSafeToDelete,
  storyRateLimited,
  storyVisibleInPublicFeed,
  uniqueBreedChannelsFromPets,
} from '../lib/stories.ts';
import { STORIES_SCHEMA_STATEMENTS, storiesSchemaApplyEnabled } from '../lib/storiesSchema.ts';
import { authorizeOwnedPetId, authorizeOwnedProfileId } from '../lib/reelAuth.ts';
import {
  POST_PET_IDENTITY_ERROR,
  POST_PET_NOT_OWNED_ERROR,
  isPersonalPet,
  petAllowedForAuthorIdentity,
} from '../lib/petOwnership.ts';
import { muxHlsUrl, muxThumbnailUrl, muxCleanupEnabled } from '../lib/reels.ts';
import { displayPersonName, storyCommentPushMessage } from '../lib/pushPolicy.ts';
import { muxApi, muxConfigured, muxDeleteAsset } from './reelsMux.js';

async function d1(env, sql, params = []) {
  const res = await env.DB.prepare(sql).bind(...params).all();
  return res.results || [];
}

export async function ensureStoriesSchema(env) {
  if (env._storiesReady) return;
  if (!storiesSchemaApplyEnabled(env.STORIES_SCHEMA_APPLY)) {
    env._storiesReady = true;
    return;
  }
  for (const sql of STORIES_SCHEMA_STATEMENTS) {
    await d1(env, sql);
  }
  env._storiesReady = true;
}

const STORY_SELECT = `
  SELECT s.*,
    u.username AS username, u.name AS user_name, u.avatar_url AS user_avatar,
    ap.id AS author_profile_id, ap.type AS author_profile_type, ap.name AS author_profile_name,
    ap.username AS author_profile_username, ap.avatar_url AS author_profile_avatar,
    pet.name AS author_pet_name, pet.emoji AS author_pet_emoji, pet.avatar_url AS author_pet_avatar,
    pet.username AS author_pet_username,
    pp.name AS protagonist_name, pp.emoji AS protagonist_emoji, pp.avatar_url AS protagonist_avatar,
    pp.species AS protagonist_species, pp.breed AS protagonist_breed
  FROM stories s
  LEFT JOIN users u ON u.id = s.author_user_id
  LEFT JOIN profiles ap ON ap.id = s.author_profile_id
  LEFT JOIN pets pet ON pet.id = s.author_pet_id
  LEFT JOIN pets pp ON pp.id = s.protagonist_pet_id
`;

function activeStorySql(alias = 's') {
  return `${alias}.status = 'ready' AND ${alias}.deleted_at IS NULL AND ${alias}.expires_at > ?`;
}

function storyThumb(row) {
  if (row.media_type === 'image') return storyImageThumbUrl(row.image_url);
  if (row.mux_playback_id) return muxThumbnailUrl(row.mux_playback_id);
  return row.protagonist_avatar || row.author_pet_avatar || row.author_profile_avatar || row.user_avatar || null;
}

function storyRow(r, extras = {}) {
  const playbackId = r.mux_playback_id || null;
  return {
    id: r.id,
    authorUserId: r.author_user_id,
    authorProfileId: r.author_profile_id || null,
    authorProfileType: r.author_profile_type || null,
    authorPetId: r.author_pet_id || null,
    protagonistPetId: r.protagonist_pet_id || null,
    mediaType: r.media_type,
    imageUrl: r.image_url || null,
    imageCfId: r.image_cf_id || null,
    muxPlaybackId: playbackId,
    hlsUrl: playbackId ? muxHlsUrl(playbackId) : null,
    thumbnailUrl: storyThumb(r),
    durationMs: r.duration_ms || null,
    caption: r.caption || '',
    status: r.status,
    audience: r.audience,
    breedSpecies: r.breed_species || null,
    breedKey: r.breed_key || null,
    breedLabel: r.breed_label || null,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    username: r.username || null,
    userName: r.user_name || null,
    userAvatar: r.user_avatar || null,
    authorProfileName: r.author_profile_name || null,
    authorProfileUsername: r.author_profile_username || null,
    authorProfileAvatar: r.author_profile_avatar || null,
    authorPetName: r.author_pet_name || null,
    authorPetAvatar: r.author_pet_avatar || null,
    protagonistName: r.protagonist_name || null,
    protagonistAvatar: r.protagonist_avatar || null,
    ...extras,
  };
}

function identityWhere(alias, identity) {
  if (identity.authorPetId) return `${alias}.author_pet_id = ?`;
  if (identity.authorProfileId && identity.authorProfileType && identity.authorProfileType !== 'personal') {
    return `${alias}.author_profile_id = ?`;
  }
  return `${alias}.author_user_id = ? AND (${alias}.author_pet_id IS NULL) AND (${alias}.author_profile_id IS NULL OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = ${alias}.author_profile_id AND p.type = 'personal'))`;
}

function identityParams(identity) {
  if (identity.authorPetId) return [identity.authorPetId];
  if (identity.authorProfileId && identity.authorProfileType && identity.authorProfileType !== 'personal') {
    return [identity.authorProfileId];
  }
  return [identity.authorUserId];
}

async function authorizeStoryIdentity(env, userId, body, clean) {
  let authorProfileId = clean(body.authorProfileId, 80) || null;
  const authorPetIdRequested = clean(body.authorPetId, 80) || null;
  const ownedProfiles = await d1(env, 'SELECT id, type, account_id FROM profiles WHERE account_id = ?', [userId]);
  const personalId = (ownedProfiles.find((p) => p.type === 'personal') || {}).id || null;
  const profileAuth = authorizeOwnedProfileId(authorProfileId, ownedProfiles.map((p) => p.id), personalId);
  if (!profileAuth.ok) return { ok: false, status: profileAuth.status, error: profileAuth.error };
  authorProfileId = profileAuth.profileId;
  const authorRow = authorProfileId ? ownedProfiles.find((p) => p.id === authorProfileId) || null : null;

  let authorPetId = null;
  if (authorPetIdRequested) {
    const ownedPets = await d1(env, 'SELECT id FROM pets WHERE id = ? AND user_id = ?', [authorPetIdRequested, userId]);
    const petAuth = authorizeOwnedPetId(authorPetIdRequested, ownedPets.map((p) => p.id));
    if (!petAuth.ok) return { ok: false, status: 403, error: POST_PET_NOT_OWNED_ERROR };
    authorPetId = petAuth.petId;
  }

  const protagonistRequested = clean(body.protagonistPetId, 80) || clean(body.petId, 80) || null;
  let protagonist = null;
  if (protagonistRequested) {
    const ownedPets = await d1(
      env,
      'SELECT id, user_id, profile_id, species, breed FROM pets WHERE id = ? AND user_id = ?',
      [protagonistRequested, userId]
    );
    const petAuth = authorizeOwnedPetId(protagonistRequested, ownedPets.map((p) => p.id));
    if (!petAuth.ok) return { ok: false, status: 403, error: POST_PET_NOT_OWNED_ERROR };
    protagonist = ownedPets[0] || null;
    if (protagonist) {
      let petProfile = null;
      if (protagonist.profile_id) {
        const prs = await d1(env, 'SELECT id, type, account_id FROM profiles WHERE id = ?', [protagonist.profile_id]);
        petProfile = prs[0] || null;
      }
      const gate = petAllowedForAuthorIdentity({
        accountId: userId,
        pet: { userId: protagonist.user_id, profileId: protagonist.profile_id },
        author: authorRow
          ? { id: authorRow.id, type: authorRow.type, accountId: authorRow.account_id }
          : null,
        petProfile: petProfile
          ? { id: petProfile.id, type: petProfile.type, accountId: petProfile.account_id }
          : null,
      });
      if (!gate.ok) {
        if (gate.code === 'pet_not_owned') return { ok: false, status: 403, error: POST_PET_NOT_OWNED_ERROR };
        return { ok: false, status: 403, error: POST_PET_IDENTITY_ERROR };
      }
    }
  }

  const breed = resolveStoryBreedFromPet(protagonist, body.breed || body.breedKey);
  const audience = resolveStoryAudience(body.audience, breed);
  return {
    ok: true,
    authorProfileId,
    authorProfileType: authorRow ? authorRow.type : 'personal',
    authorPetId,
    protagonist,
    breed: audience === 'normal' ? null : breed,
    audience,
  };
}

async function assertStoryRateLimit(env, userId, now) {
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const rows = await d1(
    env,
    "SELECT COUNT(*) AS n FROM stories WHERE author_user_id = ? AND created_at > ? AND status != 'failed'",
    [userId, dayAgo]
  );
  if (storyRateLimited(rows[0]?.n || 0)) {
    return { ok: false, error: STORY_RATE_LIMIT_MESSAGE, status: 429 };
  }
  return { ok: true };
}

function applyStoryPatchSql(patch) {
  const map = {
    status: 'status',
    mux_upload_id: 'mux_upload_id',
    mux_asset_id: 'mux_asset_id',
    mux_playback_id: 'mux_playback_id',
    mux_last_event_id: 'mux_last_event_id',
    duration_ms: 'duration_ms',
    error: 'error',
    cleanup_needed: 'cleanup_needed',
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

export async function findStoryForMuxEvent(env, data) {
  const passthrough = data && (data.passthrough || (data.new_asset_settings && data.new_asset_settings.passthrough));
  if (passthrough && isStoryId(String(passthrough))) {
    const rows = await d1(env, 'SELECT * FROM stories WHERE id = ?', [String(passthrough)]);
    if (rows[0]) return rows[0];
  }
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

export async function applyStoryMuxWebhook(env, story, event, now) {
  const applied = applyStoryMuxWebhookEvent(story, event);
  if (applied.skip) return { ok: true, skipped: applied.reason || 'skip' };
  const patch = { ...applied.patch };
  const { sets, vals } = applyStoryPatchSql(patch);
  if (sets.length) {
    await d1(env, `UPDATE stories SET ${sets.join(', ')} WHERE id = ?`, [...vals, story.id]);
  }
  if (applied.requestMuxDelete && (patch.mux_asset_id || story.mux_asset_id)) {
    const del = await muxDeleteAsset(env, patch.mux_asset_id || story.mux_asset_id);
    if (!del.skipped && del.ok) {
      await d1(
        env,
        'UPDATE stories SET media_deleted_at = ?, cleanup_needed = 0 WHERE id = ?',
        [now, story.id]
      );
    }
  }
  return { ok: true };
}

async function deleteCloudflareStoryImage(env, cfId) {
  if (!cfId) return { skipped: true, reason: 'no_cf_id' };
  const kinds = await d1(env, 'SELECT kind FROM images WHERE cf_id = ?', [cfId]);
  const otherKinds = kinds.map((r) => r.kind);
  const posts = await d1(env, "SELECT id FROM posts WHERE image LIKE ? LIMIT 1", [`%/${cfId}/%`]).catch(() => []);
  const users = await d1(env, "SELECT id FROM users WHERE avatar_url LIKE ? LIMIT 1", [`%/${cfId}/%`]).catch(() => []);
  const pets = await d1(env, "SELECT id FROM pets WHERE avatar_url LIKE ? LIMIT 1", [`%/${cfId}/%`]).catch(() => []);
  const alerts = await d1(env, "SELECT id FROM alerts WHERE image LIKE ? LIMIT 1", [`%/${cfId}/%`]).catch(() => []);
  const otherTables = [];
  if (posts[0]) otherTables.push('posts');
  if (users[0]) otherTables.push('users');
  if (pets[0]) otherTables.push('pets');
  if (alerts[0]) otherTables.push('alerts');
  const gate = storyMediaSafeToDelete({
    table: 'stories',
    imageKind: otherKinds[0] || STORY_IMAGE_KIND,
    imageCfId: cfId,
    otherImageKinds: otherKinds,
    otherTablesUsingAsset: otherTables,
  });
  if (!gate.ok) return { skipped: true, reason: gate.reason };
  if (!env.CF_ACCOUNT_ID || !env.CF_IMAGES_TOKEN) return { skipped: true, reason: 'cf_unconfigured' };
  try {
    const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1/${cfId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${env.CF_IMAGES_TOKEN}` },
    });
    if (!resp.ok) return { skipped: false, ok: false, status: resp.status };
    await d1(env, 'DELETE FROM images WHERE cf_id = ? AND kind = ?', [cfId, STORY_IMAGE_KIND]).catch(() => {});
    return { skipped: false, ok: true };
  } catch (e) {
    return { skipped: false, ok: false, error: e && e.message };
  }
}

async function cleanupStoryMedia(env, story, now) {
  let mediaOk = true;
  let lastError = null;
  if (story.image_cf_id && !story.media_deleted_at) {
    const del = await deleteCloudflareStoryImage(env, story.image_cf_id);
    if (del.skipped && del.reason !== 'cf_unconfigured' && del.reason !== 'no_cf_id') {
      lastError = del.reason;
      mediaOk = false;
    } else if (!del.skipped && !del.ok) {
      lastError = `cf_${del.status || del.error || 'fail'}`;
      mediaOk = false;
    }
  }
  if (story.mux_asset_id && !story.media_deleted_at) {
    const del = await muxDeleteAsset(env, story.mux_asset_id);
    if (del.skipped && del.reason === 'cleanup_disabled') {
      // Flag off: do not mark cleaned; retry later when enabled.
      lastError = 'mux_cleanup_disabled';
      mediaOk = false;
    } else if (del.skipped && del.reason !== 'no_asset') {
      lastError = del.reason;
      mediaOk = false;
    } else if (!del.skipped && !del.ok) {
      lastError = `mux_${del.status || 'fail'}`;
      mediaOk = false;
    }
  }
  if (mediaOk) {
    await d1(
      env,
      'UPDATE stories SET media_deleted_at = ?, cleanup_needed = 0, last_cleanup_error = NULL WHERE id = ?',
      [now, story.id]
    );
    return { ok: true };
  }
  await d1(
    env,
    'UPDATE stories SET cleanup_needed = 1, cleanup_attempts = cleanup_attempts + 1, last_cleanup_error = ? WHERE id = ?',
    [lastError || 'cleanup_failed', story.id]
  );
  return { ok: false, error: lastError };
}

export async function runStoryCleanup(env, nowMs) {
  await ensureStoriesSchema(env);
  const rows = await d1(
    env,
    `SELECT * FROM stories WHERE
      media_deleted_at IS NULL AND (
        expires_at <= ?
        OR deleted_at IS NOT NULL
        OR status IN ('failed', 'deleted')
        OR cleanup_needed = 1
      )
      LIMIT 40`,
    [nowMs]
  );
  const mapped = rows.map((r) => ({
    id: r.id,
    status: r.status,
    expiresAt: r.expires_at,
    deletedAt: r.deleted_at,
    mediaDeletedAt: r.media_deleted_at,
    cleanupNeeded: r.cleanup_needed,
    imageCfId: r.image_cf_id,
    muxAssetId: r.mux_asset_id,
  }));
  const plan = planStoryCleanup(mapped, nowMs);
  let mediaDeletes = 0;
  let retries = 0;
  for (const action of plan) {
    if (action.type !== 'delete_media') continue;
    const story = rows.find((r) => r.id === action.storyId);
    if (!story) continue;
    const res = await cleanupStoryMedia(env, story, nowMs);
    if (res.ok) mediaDeletes += 1;
    else retries += 1;
  }

  const stale = await d1(
    env,
    `SELECT id FROM stories
      WHERE media_deleted_at IS NOT NULL AND media_deleted_at <= ?
      LIMIT 40`,
    [nowMs - STORY_METADATA_RETENTION_MS]
  );
  let purged = 0;
  for (const row of stale) {
    await d1(env, 'DELETE FROM story_views WHERE story_id = ?', [row.id]);
    await d1(env, 'DELETE FROM story_comments WHERE story_id = ?', [row.id]);
    await d1(env, 'DELETE FROM stories WHERE id = ?', [row.id]);
    purged += 1;
  }
  return {
    scanned: rows.length,
    mediaDeletes,
    retries,
    purged,
    executeMux: muxCleanupEnabled(env.MUX_CLEANUP_ENABLED),
  };
}

async function unseenSet(env, userId, storyIds) {
  if (!userId || !storyIds.length) return new Set();
  const ph = storyIds.map(() => '?').join(',');
  const rows = await d1(
    env,
    `SELECT story_id FROM story_views WHERE user_id = ? AND story_id IN (${ph})`,
    [userId, ...storyIds]
  );
  return new Set(rows.map((r) => r.story_id));
}

async function currentIdentity(env, userId, body, clean) {
  const authorProfileId = clean(body.authorProfileId || body.activeProfileId, 80) || null;
  const authorPetId = clean(body.authorPetId, 80) || null;
  let authorProfileType = 'personal';
  if (authorProfileId) {
    const prs = await d1(env, 'SELECT id, type FROM profiles WHERE id = ? AND account_id = ?', [authorProfileId, userId]);
    if (prs[0]) authorProfileType = prs[0].type || 'personal';
  }
  return { authorUserId: userId, authorProfileId, authorProfileType, authorPetId };
}

async function loadStoryRail(env, viewerId, identity, now) {
  const items = [];

  const selfRows = viewerId
    ? await d1(
        env,
        `${STORY_SELECT} WHERE ${identityWhere('s', identity)} AND ${activeStorySql('s')} ORDER BY s.created_at ASC`,
        [...identityParams(identity), now]
      )
    : [];
  const selfIds = selfRows.map((r) => r.id);
  const selfSeen = await unseenSet(env, viewerId, selfIds);
  const selfUnseen = selfRows.some((r) => !selfSeen.has(r.id));
  items.push({
    kind: 'self',
    id: 'self',
    label: 'Tu historia',
    thumbUrl: selfRows[0] ? storyThumb(selfRows[0]) : null,
    hasStory: selfRows.length > 0,
    hasUnseen: selfUnseen,
    count: selfRows.length,
    identity,
  });

  if (viewerId) {
    const followed = await d1(
      env,
      `${STORY_SELECT}
       WHERE ${activeStorySql('s')}
         AND s.audience IN ('normal', 'both')
         AND (
           (s.author_pet_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM follows f WHERE f.user_id = ? AND f.target_type = 'pet' AND f.target_id = s.author_pet_id
           ))
           OR (s.author_profile_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM follows f WHERE f.user_id = ? AND f.target_type = 'profile' AND f.target_id = s.author_profile_id
           ))
           OR (
             s.author_pet_id IS NULL
             AND (s.author_profile_id IS NULL OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = s.author_profile_id AND p.type = 'personal'))
             AND EXISTS (SELECT 1 FROM follows f WHERE f.user_id = ? AND f.target_type = 'user' AND f.target_id = s.author_user_id)
           )
         )
       ORDER BY s.created_at DESC
       LIMIT 120`,
      [now, viewerId, viewerId, viewerId]
    );
    const groups = new Map();
    for (const row of followed) {
      const key = storyIdentityKey({
        authorUserId: row.author_user_id,
        authorProfileId: row.author_profile_id,
        authorProfileType: row.author_profile_type,
        authorPetId: row.author_pet_id,
      });
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    const followedItems = [];
    for (const [key, rows] of groups) {
      const ids = rows.map((r) => r.id);
      const seen = await unseenSet(env, viewerId, ids);
      const hasUnseen = rows.some((r) => !seen.has(r.id));
      const latest = rows[0];
      const label = latest.author_pet_name || latest.author_profile_name || latest.user_name || latest.username || 'Historia';
      followedItems.push({
        kind: 'identity',
        id: key,
        label,
        thumbUrl: storyThumb(latest),
        hasStory: true,
        hasUnseen,
        count: rows.length,
        latestAt: latest.created_at,
        authorUserId: latest.author_user_id,
        authorProfileId: latest.author_profile_id,
        authorProfileType: latest.author_profile_type,
        authorPetId: latest.author_pet_id,
      });
    }
    followedItems.sort((a, b) => {
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      return b.latestAt - a.latestAt;
    });
    items.push(...followedItems);
  }

  let myChannels = [];
  if (viewerId) {
    const pets = await d1(
      env,
      `SELECT p.id, p.species, p.breed, p.profile_id, pr.type AS profile_type
       FROM pets p
       LEFT JOIN profiles pr ON pr.id = p.profile_id
       WHERE p.user_id = ? AND p.archived_at IS NULL`,
      [viewerId]
    );
    const personal = pets.filter((p) => isPersonalPet({ id: p.id, profileId: p.profile_id }, [{ id: p.profile_id, type: p.profile_type }]));
    myChannels = uniqueBreedChannelsFromPets(personal);
    for (const ch of myChannels) {
      const rows = await d1(
        env,
        `${STORY_SELECT} WHERE ${activeStorySql('s')} AND s.audience IN ('breed', 'both') AND s.breed_species = ? AND s.breed_key = ? ORDER BY s.created_at DESC LIMIT 40`,
        [now, ch.species, ch.breedKey]
      );
      if (!rows[0]) continue;
      const seen = await unseenSet(env, viewerId, rows.map((r) => r.id));
      items.push({
        kind: 'breed',
        id: ch.channelKey,
        label: ch.breedLabel,
        emoji: ch.species === 'gato' ? '🐱' : ch.species === 'perro' ? '🐕' : '🐾',
        thumbUrl: storyThumb(rows[0]),
        hasStory: true,
        hasUnseen: rows.some((r) => !seen.has(r.id)),
        count: rows.length,
        breedSpecies: ch.species,
        breedKey: ch.breedKey,
        breedLabel: ch.breedLabel,
      });
    }
  }

  const myKeys = new Set(myChannels.map((c) => c.channelKey));
  const extras = await d1(
    env,
    `SELECT breed_species, breed_key, breed_label, COUNT(*) AS n
     FROM stories
     WHERE ${activeStorySql('stories')} AND audience IN ('breed', 'both') AND breed_key IS NOT NULL
     GROUP BY breed_species, breed_key, breed_label
     LIMIT 40`,
    [now]
  );
  const extraCount = extras.filter((r) => !myKeys.has(`${r.breed_species}:${r.breed_key}`)).length;
  if (extraCount > 0) {
    items.push({ kind: 'more', id: 'more', label: 'Más', hasStory: false, hasUnseen: false, count: extraCount });
  }

  return items;
}

export async function handlePublicStoryAction(env, body, json, clean, request, authUser) {
  const action = clean(body.action, 40);
  const now = Date.now();
  const publicActions = new Set(['storyRail', 'storyGroup', 'storyBreedFeed', 'storyComments', 'storyMoreBreeds']);
  if (!publicActions.has(action)) return null;
  await ensureStoriesSchema(env);

  const viewerId = await authUser(request, env, body);

  if (action === 'storyRail') {
    const identity = viewerId
      ? await currentIdentity(env, viewerId, body, clean)
      : { authorUserId: null, authorProfileId: null, authorProfileType: 'personal', authorPetId: null };
    const items = await loadStoryRail(env, viewerId, identity, now);
    return json({ ok: true, items });
  }

  if (action === 'storyGroup') {
    const identity = {
      authorUserId: clean(body.authorUserId, 80) || null,
      authorProfileId: clean(body.authorProfileId, 80) || null,
      authorProfileType: clean(body.authorProfileType, 20) || 'personal',
      authorPetId: clean(body.authorPetId, 80) || null,
    };
    if (body.source === 'self') {
      if (!viewerId) return json({ error: 'Inicia sesión para continuar' }, 401);
      Object.assign(identity, await currentIdentity(env, viewerId, body, clean));
    }
    if (!identity.authorUserId && !identity.authorProfileId && !identity.authorPetId) {
      return json({ error: 'Identidad requerida' }, 400);
    }
    const rows = await d1(
      env,
      `${STORY_SELECT} WHERE ${identityWhere('s', identity)} AND ${activeStorySql('s')} AND s.audience IN ('normal', 'both') ORDER BY s.created_at ASC`,
      [...identityParams(identity), now]
    );
    const seen = await unseenSet(env, viewerId, rows.map((r) => r.id));
    return json({
      ok: true,
      stories: rows.map((r) => storyRow(r, { viewed: seen.has(r.id) })),
    });
  }

  if (action === 'storyBreedFeed') {
    const species = clean(body.breedSpecies || body.species, 20).toLowerCase();
    const breedKey = clean(body.breedKey, 80).toLowerCase();
    if (!species || !breedKey) return json({ error: 'Canal de raza requerido' }, 400);
    const rows = await d1(
      env,
      `${STORY_SELECT} WHERE ${activeStorySql('s')} AND s.audience IN ('breed', 'both') AND s.breed_species = ? AND s.breed_key = ? ORDER BY s.created_at DESC LIMIT 80`,
      [now, species, breedKey]
    );
    const seen = await unseenSet(env, viewerId, rows.map((r) => r.id));
    const unseen = [];
    const viewed = [];
    for (const r of rows) {
      const mapped = storyRow(r, { viewed: seen.has(r.id) });
      if (seen.has(r.id)) viewed.push(mapped);
      else unseen.push(mapped);
    }
    return json({ ok: true, stories: [...unseen, ...viewed] });
  }

  if (action === 'storyMoreBreeds') {
    const rows = await d1(
      env,
      `SELECT breed_species, breed_key, breed_label, MAX(created_at) AS latest, COUNT(*) AS n
       FROM stories
       WHERE ${activeStorySql('stories')} AND audience IN ('breed', 'both') AND breed_key IS NOT NULL
       GROUP BY breed_species, breed_key, breed_label
       ORDER BY latest DESC
       LIMIT 60`,
      [now]
    );
    return json({
      ok: true,
      channels: rows.map((r) => ({
        species: r.breed_species,
        breedKey: r.breed_key,
        breedLabel: r.breed_label,
        count: r.n,
      })),
    });
  }

  if (action === 'storyComments') {
    const storyId = clean(body.storyId, 80);
    const rows = await d1(env, 'SELECT * FROM stories WHERE id = ?', [storyId]);
    if (!rows[0] || !storyVisibleInPublicFeed({ status: rows[0].status, deletedAt: rows[0].deleted_at, expiresAt: rows[0].expires_at }, now)) {
      return json({ error: STORY_EXPIRED_MESSAGE, expired: true }, 410);
    }
    const comments = await d1(
      env,
      `SELECT c.*, u.username, u.name AS user_name, u.avatar_url
       FROM story_comments c LEFT JOIN users u ON u.id = c.user_id
       WHERE c.story_id = ? ORDER BY c.created_at ASC LIMIT 200`,
      [storyId]
    );
    return json({
      ok: true,
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

  return null;
}

export async function handleAuthStoryAction(env, body, json, clean, userId, notifyUserPush) {
  const action = clean(body.action, 40);
  const now = Date.now();
  const authActions = new Set([
    'createStory',
    'createStoryUpload',
    'completeStoryUpload',
    'deleteStory',
    'markStoryViewed',
    'createStoryComment',
    'reportStory',
  ]);
  if (!authActions.has(action)) return null;
  await ensureStoriesSchema(env);

  if (action === 'createStory' || action === 'createStoryUpload') {
    const auth = await authorizeStoryIdentity(env, userId, body, clean);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    const limited = await assertStoryRateLimit(env, userId, now);
    if (!limited.ok) return json({ error: limited.error }, limited.status);

    const caption = clean(body.caption, STORY_CAPTION_MAX);
    const id = `story-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const expiresAt = storyExpiresAt(now);
    const breed = auth.breed;
    const common = [
      id,
      userId,
      auth.authorProfileId,
      auth.authorPetId,
      auth.protagonist ? auth.protagonist.id : null,
      caption,
      auth.audience,
      breed ? breed.species : null,
      breed ? breed.breedKey : null,
      breed ? breed.breedLabel : null,
      now,
      expiresAt,
    ];

    if (action === 'createStory') {
      const imageUrl = clean(body.imageUrl || body.image, 500);
      if (!imageUrl) return json({ error: 'Falta la foto' }, 400);
      const cfId = clean(body.cfId, 80) || cfIdFromImageUrl(imageUrl);
      await d1(
        env,
        `INSERT INTO stories (
          id, author_user_id, author_profile_id, author_pet_id, protagonist_pet_id,
          media_type, image_url, image_cf_id, caption, status, audience,
          breed_species, breed_key, breed_label, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, 'image', ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?)`,
        [
          id,
          userId,
          auth.authorProfileId,
          auth.authorPetId,
          auth.protagonist ? auth.protagonist.id : null,
          imageUrl,
          cfId,
          caption,
          auth.audience,
          breed ? breed.species : null,
          breed ? breed.breedKey : null,
          breed ? breed.breedLabel : null,
          now,
          expiresAt,
        ]
      );
      if (cfId) {
        await d1(
          env,
          'INSERT INTO images (id, user_id, cf_id, url, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [`img-${now}-${Math.random().toString(36).slice(2, 8)}`, userId, cfId, imageUrl, STORY_IMAGE_KIND, now]
        ).catch(() => {});
      }
      return json({ ok: true, storyId: id, expiresAt, audience: auth.audience, status: 'ready' });
    }

    if (!muxConfigured(env)) return json({ error: 'Mux no configurado' }, 503);
    const mime = String(body.mime || '').split(';')[0].trim().toLowerCase();
    if (mime && mime !== 'video/mp4' && mime !== 'video/quicktime') {
      return json({ error: 'Formato no soportado. Usá MP4 o MOV.' }, 400);
    }
    const bytes = Number(body.byteSize);
    if (Number.isFinite(bytes) && bytes > STORY_VIDEO_MAX_BYTES) {
      return json({ error: 'El video puede pesar hasta 50 MB.' }, 413);
    }
    const durationMs = body.durationMs == null ? null : Number(body.durationMs);
    if (clientStoryVideoRejects(durationMs)) {
      return json({ error: 'Las historias de video pueden durar hasta 15 segundos.' }, 400);
    }

    await d1(
      env,
      `INSERT INTO stories (
        id, author_user_id, author_profile_id, author_pet_id, protagonist_pet_id,
        media_type, caption, status, audience, breed_species, breed_key, breed_label,
        created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, 'video', ?, 'uploading', ?, ?, ?, ?, ?, ?)`,
      common
    );

    const mux = await muxApi(env, '/video/v1/uploads', 'POST', {
      cors_origin: '*',
      timeout: 600,
      new_asset_settings: {
        playback_policies: ['public'],
        video_quality: 'basic',
        max_resolution_tier: '1080p',
        passthrough: id,
      },
    });
    const upload = mux.json && mux.json.data;
    if (!mux.ok || !upload || !upload.url || !upload.id) {
      await d1(env, "UPDATE stories SET status = 'failed', error = 'mux_create_failed' WHERE id = ?", [id]);
      return json({ error: 'No se pudo autorizar la subida' }, 502);
    }
    await d1(env, 'UPDATE stories SET mux_upload_id = ? WHERE id = ?', [upload.id, id]);
    return json({ ok: true, storyId: id, uploadUrl: upload.url, expiresAt, audience: auth.audience, status: 'uploading' });
  }

  if (action === 'completeStoryUpload') {
    const storyId = clean(body.storyId, 80);
    const rows = await d1(env, 'SELECT * FROM stories WHERE id = ? AND author_user_id = ?', [storyId, userId]);
    if (!rows[0]) return json({ error: 'Esa historia no es tuya' }, 403);
    if (rows[0].status === 'uploading') {
      await d1(env, "UPDATE stories SET status = 'processing' WHERE id = ?", [storyId]);
    }
    return json({ ok: true, status: rows[0].status === 'uploading' ? 'processing' : rows[0].status });
  }

  if (action === 'deleteStory') {
    const storyId = clean(body.storyId, 80);
    const rows = await d1(env, 'SELECT * FROM stories WHERE id = ?', [storyId]);
    if (!rows[0]) return json({ error: 'Historia no encontrada' }, 404);
    if (!canDeleteStory(rows[0].author_user_id, userId)) return json({ error: 'Esa historia no es tuya' }, 403);
    await d1(
      env,
      "UPDATE stories SET status = 'deleted', deleted_at = ?, cleanup_needed = 1 WHERE id = ?",
      [now, storyId]
    );
    const cleaned = await cleanupStoryMedia(env, { ...rows[0], media_deleted_at: null }, now);
    return json({ ok: true, mediaDeleted: cleaned.ok });
  }

  if (action === 'markStoryViewed') {
    const storyId = clean(body.storyId, 80);
    const rows = await d1(env, 'SELECT * FROM stories WHERE id = ?', [storyId]);
    if (!rows[0] || !storyVisibleInPublicFeed({ status: rows[0].status, deletedAt: rows[0].deleted_at, expiresAt: rows[0].expires_at }, now)) {
      return json({ error: STORY_EXPIRED_MESSAGE, expired: true }, 410);
    }
    await d1(env, 'INSERT OR IGNORE INTO story_views (user_id, story_id, viewed_at) VALUES (?, ?, ?)', [userId, storyId, now]);
    return json({ ok: true });
  }

  if (action === 'createStoryComment') {
    const storyId = clean(body.storyId, 80);
    const text = clean(body.text, STORY_COMMENT_MAX);
    if (!text) return json({ error: 'Comentario vacío' }, 400);
    const rows = await d1(env, 'SELECT * FROM stories WHERE id = ?', [storyId]);
    const gate = storyCommentAllowed(
      rows[0]
        ? { status: rows[0].status, deletedAt: rows[0].deleted_at, expiresAt: rows[0].expires_at }
        : null,
      userId,
      now
    );
    if (!gate.ok) {
      return json({ error: gate.reason === 'guest' ? 'Inicia sesión para continuar' : STORY_EXPIRED_MESSAGE, expired: gate.reason === 'expired' }, gate.reason === 'guest' ? 401 : 410);
    }
    const id = `sc-${now}-${Math.random().toString(36).slice(2, 8)}`;
    await d1(env, 'INSERT INTO story_comments (id, story_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)', [id, storyId, userId, text, now]);
    if (rows[0].author_user_id && rows[0].author_user_id !== userId && typeof notifyUserPush === 'function') {
      try {
        const actors = await d1(env, 'SELECT name, username FROM users WHERE id = ?', [userId]);
        const actorName = displayPersonName(actors[0] || null) || 'Alguien';
        await notifyUserPush(env, {
          userId: rows[0].author_user_id,
          type: 'story_comment',
          idempotencyKey: `push:story_comment:${id}`,
          nowMs: now,
          buildMessage: (token) => storyCommentPushMessage({ token, storyId, actorName }),
        });
      } catch (_) {}
    }
    return json({ ok: true, id, createdAt: now });
  }

  if (action === 'reportStory') {
    const storyId = clean(body.storyId, 80);
    if (!storyId) return json({ error: 'Historia requerida' }, 400);
    const id = `rpt-${now}-${Math.random().toString(36).slice(2, 8)}`;
    await d1(
      env,
      'INSERT INTO content_reports (id, user_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, userId, 'story', storyId, now]
    ).catch(() => {});
    return json({ ok: true, reportType: 'story', targetId: storyId });
  }

  return null;
}
