const REEL_PUBLIC_ORIGIN = 'https://animaldex-web.pages.dev';

export const REEL_LIKE_ACTIVITY_TYPE = 'reel_like' as const;
export const REEL_COMMENT_ACTIVITY_TYPE = 'reel_comment' as const;

/** Misma voz que “le dio me gusta a tu publicación”. */
export function reelLikeActivityText(): string {
  return 'le dio me gusta a tu Reel';
}

export function reelCommentActivityText(preview?: string | null): string {
  const t = String(preview || '').trim().slice(0, 80);
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

export function reelActivityPushPayload(input: {
  type: 'reel_like' | 'reel_comment';
  reelId: string;
  actorName: string;
  commentPreview?: string | null;
}): { title: string; body: string; data: { type: string; reelId: string; url: string } } {
  const url = reelActivityPath(input.reelId);
  if (input.type === 'reel_like') {
    return {
      title: 'Nuevo me gusta',
      body: `${input.actorName} ${reelLikeActivityText()}.`,
      data: { type: REEL_LIKE_ACTIVITY_TYPE, reelId: input.reelId, url },
    };
  }
  return {
    title: 'Nuevo comentario',
    body: `${input.actorName} ${reelCommentActivityText(input.commentPreview)}.`,
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
