// ============================================================
// Centro de notificaciones Animaldex.
//
// EVENTO → IMPORTANCIA → AGRUPACIÓN → ACTIVIDAD → PUSH
//
// Activity registra todo (tablas fuente). Push interrumpe solo
// cuando vale la pena. La ubicación de mascota perdida es CRITICAL
// y nunca se agrupa.
// ============================================================

export const PUSH_LEVEL = {
  CRITICAL: 'critical',
  IMPORTANT: 'important',
  SOCIAL: 'social',
  DIGEST: 'digest',
} as const;

export type PushLevel = (typeof PUSH_LEVEL)[keyof typeof PUSH_LEVEL];

export const PUSH_KIND = {
  LOCATION: 'location',
  ALERT_COMMENT: 'alert_comment',
  POST_COMMENT: 'post_comment',
  LISTING_COMMENT: 'listing_comment',
  LIKE: 'like',
  FOLLOW_USER: 'follow_user',
  FOLLOW_PET: 'follow_pet',
  FOLLOW_PAGE: 'follow_page',
  PET_FOLLOWING: 'pet_following',
  PAGE_FOLLOWING: 'page_following',
} as const;

export type PushKind = (typeof PUSH_KIND)[keyof typeof PUSH_KIND];

/** Ventanas en minutos. Un solo lugar para cambiar frecuencias. */
export const PUSH_BATCH_MINUTES = {
  ALERT_COMMENT: 15,
  POST_COMMENT: 20,
  SOCIAL: 60,
} as const;

export const PUSH_BATCH_LIMITS = {
  MAX_UNIQUE_ACTORS: 20,
  MAX_SUBJECTS: 12,
  FLUSH_PAGE: 20,
} as const;

export function pushBatchWindowMs(kind: PushKind): number {
  if (kind === PUSH_KIND.ALERT_COMMENT) return PUSH_BATCH_MINUTES.ALERT_COMMENT * 60_000;
  if (kind === PUSH_KIND.POST_COMMENT) return PUSH_BATCH_MINUTES.POST_COMMENT * 60_000;
  return PUSH_BATCH_MINUTES.SOCIAL * 60_000;
}

export function pushLevelForKind(kind: PushKind): PushLevel {
  if (kind === PUSH_KIND.LOCATION) return PUSH_LEVEL.CRITICAL;
  if (
    kind === PUSH_KIND.ALERT_COMMENT ||
    kind === PUSH_KIND.POST_COMMENT ||
    kind === PUSH_KIND.LISTING_COMMENT
  ) {
    return PUSH_LEVEL.IMPORTANT;
  }
  return PUSH_LEVEL.SOCIAL;
}

/** Prefs existentes. follow / following_activity default true sin columna D1. */
export function pushPrefKey(
  kind: PushKind
): 'location' | 'comment' | 'like' | 'follow' | 'following_activity' {
  if (kind === PUSH_KIND.LOCATION) return 'location';
  if (kind === PUSH_KIND.LIKE) return 'like';
  if (kind === PUSH_KIND.PET_FOLLOWING || kind === PUSH_KIND.PAGE_FOLLOWING) return 'following_activity';
  if (
    kind === PUSH_KIND.FOLLOW_USER ||
    kind === PUSH_KIND.FOLLOW_PET ||
    kind === PUSH_KIND.FOLLOW_PAGE
  ) {
    return 'follow';
  }
  return 'comment';
}

export function shouldNotifySelf(actorId: string | null | undefined, recipientId: string | null | undefined): boolean {
  if (!recipientId) return false;
  if (!actorId) return true;
  return actorId !== recipientId;
}

export function pushGroupKey(kind: PushKind, recipientId: string, targetId?: string | null): string {
  if (kind === PUSH_KIND.PET_FOLLOWING) return `pet_following:${recipientId}`;
  if (kind === PUSH_KIND.PAGE_FOLLOWING) return `page_following:${recipientId}`;
  if (kind === PUSH_KIND.FOLLOW_USER) return `follow_user:${recipientId}`;
  const target = String(targetId || '').trim() || 'none';
  return `${kind}:${recipientId}:${target}`;
}

export type OpenPushBatch = {
  firstPushSent: boolean;
  windowEndsAt: number;
  flushedAt: number | null;
};

export type PushDeliveryAction = 'skip' | 'immediate' | 'immediate_open' | 'enqueue';

export function decidePushDelivery(input: {
  kind: PushKind;
  actorId?: string | null;
  recipientId?: string | null;
  now: number;
  openBatch?: OpenPushBatch | null;
}): { action: PushDeliveryAction; reason: string; windowMs: number } {
  const windowMs = pushBatchWindowMs(input.kind);
  if (!shouldNotifySelf(input.actorId, input.recipientId)) {
    return { action: 'skip', reason: 'self', windowMs };
  }
  if (input.kind === PUSH_KIND.LOCATION) {
    return { action: 'immediate', reason: 'critical_never_grouped', windowMs: 0 };
  }
  if (input.kind === PUSH_KIND.LISTING_COMMENT) {
    return { action: 'immediate', reason: 'direct_market_inquiry', windowMs: 0 };
  }

  const batch = input.openBatch;
  const open =
    batch && !batch.flushedAt && batch.windowEndsAt > input.now ? batch : null;

  if (input.kind === PUSH_KIND.ALERT_COMMENT || input.kind === PUSH_KIND.POST_COMMENT) {
    if (!open) return { action: 'immediate_open', reason: 'first_comment', windowMs };
    return { action: 'enqueue', reason: 'comment_window', windowMs };
  }

  return { action: 'enqueue', reason: 'social_batch', windowMs };
}

export function uniqueAppend(list: string[], value: string, max: number): string[] {
  const next = list.slice();
  if (!value || next.includes(value)) return next;
  if (next.length >= max) return next;
  next.push(value);
  return next;
}

export function extraPeopleCount(uniqueActors: number): number {
  return Math.max(0, uniqueActors - 1);
}

export function groupedPeopleCopy(input: {
  firstName: string;
  extraCount: number;
  one: string;
  many: string;
}): string {
  const name = String(input.firstName || '').trim() || 'Alguien';
  if (input.extraCount <= 0) return `${name} ${input.one}`;
  return `${name} y ${input.extraCount} ${input.extraCount === 1 ? 'persona más' : 'personas más'} ${input.many}`;
}

export function sanitizePushPreview(raw: string | null | undefined, max = 80): string {
  return String(raw || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function firstAlertCommentCopy(actorName: string, petName?: string | null, preview?: string | null): {
  title: string;
  body: string;
} {
  const actor = String(actorName || '').trim() || 'Alguien';
  const pet = String(petName || '').trim();
  const title = pet ? `${actor} comentó en tu alerta de ${pet}` : `${actor} comentó en tu alerta`;
  const safe = sanitizePushPreview(preview);
  return { title, body: safe || 'Hay un comentario nuevo.' };
}

export function groupedAlertCommentCopy(firstName: string, extraCount: number, petName?: string | null): {
  title: string;
  body: string;
} {
  const pet = String(petName || '').trim();
  const subject = pet ? `en tu alerta de ${pet}` : 'en tu alerta';
  return {
    title: groupedPeopleCopy({
      firstName,
      extraCount,
      one: `comentó ${subject}`,
      many: `comentaron ${subject}`,
    }),
    body: 'Abrí la alerta para ver los comentarios.',
  };
}

export function firstPostCommentCopy(actorName: string, preview?: string | null): { title: string; body: string } {
  const actor = String(actorName || '').trim() || 'Alguien';
  const safe = sanitizePushPreview(preview);
  return {
    title: `${actor} comentó tu publicación`,
    body: safe || 'Hay un comentario nuevo.',
  };
}

export function groupedPostCommentCopy(firstName: string, extraCount: number): { title: string; body: string } {
  return {
    title: groupedPeopleCopy({
      firstName,
      extraCount,
      one: 'comentó tu publicación',
      many: 'comentaron tu publicación',
    }),
    body: 'Abrí la publicación para ver los comentarios.',
  };
}

export function listingInquiryCopy(actorName: string, listingTitle?: string | null): { title: string; body: string } {
  const actor = String(actorName || '').trim() || 'Alguien';
  const title = String(listingTitle || '').trim();
  return {
    title: 'Nueva consulta por tu publicación',
    body: title ? `${actor} preguntó por ${title}.` : `${actor} preguntó por tu publicación.`,
  };
}

export function groupedLikeCopy(firstName: string, extraCount: number): { title: string; body: string } {
  const inner = groupedPeopleCopy({
    firstName,
    extraCount,
    one: 'le gustó tu publicación',
    many: 'les gustó tu publicación',
  });
  return {
    title: `A ${inner}.`,
    body: 'Mirá quién reaccionó.',
  };
}

/** Tras el primer comentario inmediato, no repetir si no hubo más personas. */
export function shouldSkipGroupedFlush(input: { firstPushSent: boolean; uniqueActorCount: number }): boolean {
  return Boolean(input.firstPushSent) && extraPeopleCount(input.uniqueActorCount) <= 0;
}

/** Clasificados, no cableados: digest y respuestas aún no tienen evento fiable. */
export const PUSH_KIND_DEFERRED = {
  ADOPTION_NEARBY: 'adoption_nearby',
  PET_MARKED_ADOPTED: 'pet_marked_adopted',
  COMMENT_REPLY: 'comment_reply',
} as const;

export function groupedFollowUserCopy(firstName: string, extraCount: number): { title: string; body: string } {
  return {
    title: groupedPeopleCopy({
      firstName,
      extraCount,
      one: 'empezó a seguirte',
      many: 'empezaron a seguirte',
    }),
    body: 'Nuevos seguidores en Animaldex.',
  };
}

export function groupedFollowPetCopy(
  firstName: string,
  extraCount: number,
  petName?: string | null
): { title: string; body: string } {
  const pet = String(petName || '').trim() || 'tu mascota';
  return {
    title: groupedPeopleCopy({
      firstName,
      extraCount,
      one: `empezó a seguir a ${pet} 🐾`,
      many: `empezaron a seguir a ${pet} 🐾`,
    }),
    body: 'Nuevos seguidores de tu mascota.',
  };
}

export function groupedFollowPageCopy(
  firstName: string,
  extraCount: number,
  pageName?: string | null
): { title: string; body: string } {
  const page = String(pageName || '').trim() || 'tu página';
  return {
    title: groupedPeopleCopy({
      firstName,
      extraCount,
      one: `empezó a seguir a ${page}`,
      many: `empezaron a seguir a ${page}`,
    }),
    body: 'Nuevos seguidores de tu página.',
  };
}

export function petFollowingCopy(petNames: string[]): { title: string; body: string } {
  const names = petNames.map((n) => String(n || '').trim()).filter(Boolean);
  if (names.length <= 1) {
    const pet = names[0] || 'Una mascota que seguís';
    return { title: `${pet} publicó una actualización 🐾`, body: 'Mirá la novedad de una mascota que seguís.' };
  }
  const extra = names.length - 1;
  return {
    title: `${names[0]} y otras ${extra} mascotas que seguís publicaron nuevas actualizaciones.`,
    body: 'Varias mascotas que seguís publicaron.',
  };
}

export function pageFollowingCopy(pageNames: string[]): { title: string; body: string } {
  const names = pageNames.map((n) => String(n || '').trim()).filter(Boolean);
  if (names.length <= 1) {
    const page = names[0] || 'Una página que seguís';
    return { title: `${page} publicó una actualización.`, body: 'Mirá la novedad.' };
  }
  return {
    title: `${names[0]} y otras páginas que seguís publicaron nuevas actualizaciones.`,
    body: 'Hay novedades de páginas que seguís.',
  };
}

export function flushCopyForKind(
  kind: PushKind,
  firstName: string,
  extraCount: number,
  extra?: { petName?: string | null; pageName?: string | null; subjectNames?: string[] }
): { title: string; body: string } {
  if (kind === PUSH_KIND.ALERT_COMMENT) return groupedAlertCommentCopy(firstName, extraCount, extra?.petName);
  if (kind === PUSH_KIND.POST_COMMENT) return groupedPostCommentCopy(firstName, extraCount);
  if (kind === PUSH_KIND.LIKE) return groupedLikeCopy(firstName, extraCount);
  if (kind === PUSH_KIND.FOLLOW_USER) return groupedFollowUserCopy(firstName, extraCount);
  if (kind === PUSH_KIND.FOLLOW_PET) return groupedFollowPetCopy(firstName, extraCount, extra?.petName);
  if (kind === PUSH_KIND.FOLLOW_PAGE) return groupedFollowPageCopy(firstName, extraCount, extra?.pageName);
  if (kind === PUSH_KIND.PET_FOLLOWING) return petFollowingCopy(extra?.subjectNames || []);
  if (kind === PUSH_KIND.PAGE_FOLLOWING) return pageFollowingCopy(extra?.subjectNames || []);
  return { title: 'Animaldex', body: 'Tenés actividad nueva.' };
}

export function batchFlushIdempotencyKey(groupKey: string, windowEndsAt: number): string {
  return `push:batch:${groupKey}:${windowEndsAt}`;
}

export const PUSH_PREF_CATEGORIES = [
  { key: 'lost_pet', label: 'Alertas de mascotas' },
  { key: 'comment', label: 'Comentarios y respuestas' },
  { key: 'following_activity', label: 'Mascotas que sigo' },
  { key: 'follow', label: 'Seguidores y reacciones' },
  { key: 'like', label: 'Seguidores y reacciones' },
  { key: 'adoption', label: 'Adopciones' },
  { key: 'location', label: 'Alertas de mascotas' },
] as const;
