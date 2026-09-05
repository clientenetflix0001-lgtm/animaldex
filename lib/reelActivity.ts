import { PUBLIC_WEB_ORIGIN } from './publicWeb.ts';

const REEL_PUBLIC_ORIGIN = PUBLIC_WEB_ORIGIN;

export const REEL_LIKE_ACTIVITY_TYPE = 'reel_like' as const;
export const REEL_COMMENT_ACTIVITY_TYPE = 'reel_comment' as const;

/** Misma voz que “le dio me gusta a tu publicación”. */
export function reelLikeActivityText(): string {
  return 'le dio me gusta a tu Reel';
}

export function sanitizeReelCommentPreview(raw: string | null | undefined): string {
  let t = String(raw || '');
  t = t.replace(/<[^>]*>/g, '');
  t = t.replace(/[\r\n\t]+/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t.slice(0, 80);
}

export function reelCommentActivityText(preview?: string | null): string {
  const t = sanitizeReelCommentPreview(preview);
  return t ? `comentó tu Reel: "${t}"` : 'comentó tu Reel';
}

export function shouldCreateReelActivity(ownerId: string | null | undefined, actorId: string | null | undefined): boolean {
  if (!ownerId || !actorId) return false;
  return ownerId !== actorId;
}

export function reelActivityPath(reelId: string): string {
  return `/r/${encodeURIComponent(reelId)}`;
}

export function reelActivityAbsoluteUrl(reelId: string): string {
  return `${REEL_PUBLIC_ORIGIN}${reelActivityPath(reelId)}`;
}

export function reelLikePushIdempotencyKey(reelId: string, actorId: string): string {
  return `push:reel_like:${reelId}:${actorId}`;
}

export function reelCommentPushIdempotencyKey(commentId: string): string {
  return `push:reel_comment:${commentId}`;
}

/** El destinatario sale del dueño del Reel en DB. El cliente no puede elegirlo. */
export function reelPushRecipient(ownerId: string, _clientBody?: unknown): string {
  return ownerId;
}

export type ReelSocialNotifyPlan =
  | { notify: false; reason: 'self' | 'unlike' | 'not_inserted' | 'invalid_reel' | 'missing' | 'comment_failed' }
  | {
      notify: true;
      type: 'reel_like' | 'reel_comment';
      ownerId: string;
      actorId: string;
      reelId: string;
    };

export function planReelLikePush(input: {
  ownerId?: string | null;
  actorId?: string | null;
  reelId?: string | null;
  reelPublic?: boolean;
  likeValue?: boolean;
  likeInserted?: boolean;
}): ReelSocialNotifyPlan {
  if (!input.reelId || !input.ownerId || !input.actorId) return { notify: false, reason: 'missing' };
  if (!input.reelPublic) return { notify: false, reason: 'invalid_reel' };
  if (input.likeValue === false) return { notify: false, reason: 'unlike' };
  if (!input.likeInserted) return { notify: false, reason: 'not_inserted' };
  if (!shouldCreateReelActivity(input.ownerId, input.actorId)) return { notify: false, reason: 'self' };
  return {
    notify: true,
    type: REEL_LIKE_ACTIVITY_TYPE,
    ownerId: input.ownerId,
    actorId: input.actorId,
    reelId: input.reelId,
  };
}

export function planReelCommentPush(input: {
  ownerId?: string | null;
  actorId?: string | null;
  reelId?: string | null;
  reelPublic?: boolean;
  commentInserted?: boolean;
}): ReelSocialNotifyPlan {
  if (!input.reelId || !input.ownerId || !input.actorId) return { notify: false, reason: 'missing' };
  if (!input.reelPublic) return { notify: false, reason: 'invalid_reel' };
  if (!input.commentInserted) return { notify: false, reason: 'comment_failed' };
  if (!shouldCreateReelActivity(input.ownerId, input.actorId)) return { notify: false, reason: 'self' };
  return {
    notify: true,
    type: REEL_COMMENT_ACTIVITY_TYPE,
    ownerId: input.ownerId,
    actorId: input.actorId,
    reelId: input.reelId,
  };
}

export function reelActivityPushPayload(input: {
  type: 'reel_like' | 'reel_comment';
  reelId: string;
  actorName: string;
  commentPreview?: string | null;
}): { title: string; body: string; data: { type: string; reelId: string; url: string } } {
  const url = reelActivityPath(input.reelId);
  const actor = String(input.actorName || '').trim() || 'Alguien';
  if (input.type === 'reel_like') {
    return {
      title: 'Animaldex',
      body: `${actor} ${reelLikeActivityText()}`,
      data: { type: REEL_LIKE_ACTIVITY_TYPE, reelId: input.reelId, url },
    };
  }
  return {
    title: 'Animaldex',
    body: `${actor} ${reelCommentActivityText(input.commentPreview)}`,
    data: { type: REEL_COMMENT_ACTIVITY_TYPE, reelId: input.reelId, url },
  };
}

export function reelIdFromActivityUrl(url: string | null | undefined): string | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  const m = raw.match(/\/r\/([^/?#]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export function reelIsViewableFromLink(reel: { status?: string | null; deletedAt?: number | null } | null | undefined): boolean {
  if (!reel) return false;
  if (reel.deletedAt) return false;
  return reel.status === 'ready';
}

export function reelViewerSurface(
  reel: { status?: string | null; deletedAt?: number | null } | null | undefined,
  loaded: boolean,
  opts?: { fromSeededList?: boolean }
): 'loading' | 'unavailable' | 'player' {
  if (!loaded) return 'loading';
  if (!reel) return 'unavailable';
  if (reel.deletedAt || reel.status === 'deleted') return 'unavailable';
  if (opts?.fromSeededList) return 'player';
  return reelIsViewableFromLink(reel) ? 'player' : 'unavailable';
}

export const REEL_UNAVAILABLE_COPY = 'Este Reel ya no está disponible';
