import { colors } from './theme.ts';
import { ADOPTION_PURPLE } from './adoptionDiscovery.ts';

export const STORY_TTL_MS = 24 * 60 * 60 * 1000;
export const STORY_PHOTO_DURATION_MS = 5000;
export const STORY_VIDEO_MAX_MS = 15000;
export const STORY_VIDEO_MAX_SEC = 15;
export const STORY_MUX_DURATION_SLACK_SEC = 0.15;
export const STORY_MUX_MAX_DURATION_SEC = STORY_VIDEO_MAX_SEC + STORY_MUX_DURATION_SLACK_SEC;
export const STORY_RATE_LIMIT_PER_DAY = 10;
export const STORY_METADATA_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const STORY_IMAGE_KIND = 'story' as const;
export const STORY_ID_PREFIX = 'story-';
export const STORY_CAPTION_MAX = 200;
export const STORY_COMMENT_MAX = 500;
export const STORY_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

export const STORY_UNSEEN_GRADIENT = [colors.primary, ADOPTION_PURPLE] as const;
export const STORY_SEEN_RING = '#D1D5DB';

export const STORY_PRIVACY_BREED =
  'Las historias de raza son públicas. No son consejo veterinario oficial.';

export const STORY_EXPIRED_MESSAGE = 'Esta historia ya terminó.';
export const STORY_RATE_LIMIT_MESSAGE = 'Podés publicar hasta 10 historias por día.';
export const STORY_NOT_VET_DISCLAIMER =
  'Los comentarios de la comunidad no son consejo veterinario oficial.';

export type StoryMediaType = 'image' | 'video';
export type StoryAudience = 'normal' | 'breed' | 'both';
export type StoryStatus = 'uploading' | 'processing' | 'ready' | 'failed' | 'deleted';
export type StoryRingVariant = 'none' | 'unseen' | 'seen';
export type StoryRailKind = 'self' | 'identity' | 'breed' | 'more';

export const MESTIZO_KEYS = new Set([
  'mestizo',
  'mestiza',
  'mestizos',
  'mestizas',
  'mixto',
  'mixta',
  'mixed',
  'mixedbreed',
  'cruzado',
  'cruzada',
]);

const BREED_LABELS: Record<string, string> = {
  caniche: 'Caniches',
  labrador: 'Labradores',
  siames: 'Siameses',
  persa: 'Persas',
  mestizo: 'Mestizos',
};

const SPECIES_EMOJI: Record<string, string> = {
  perro: '🐕',
  gato: '🐱',
  otro: '🐾',
};

export type StoryBreedChannel = {
  species: string;
  breedKey: string;
  breedLabel: string;
  channelKey: string;
};

export function normalizeBreedKey(raw: string | null | undefined): string {
  const text = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '');
  if (!text) return '';
  if (MESTIZO_KEYS.has(text) || text.startsWith('mestiz')) return 'mestizo';
  return text;
}

export function breedLabelForKey(breedKey: string, rawBreed?: string | null): string {
  if (!breedKey) return '';
  if (BREED_LABELS[breedKey]) return BREED_LABELS[breedKey];
  const source = String(rawBreed || breedKey).trim();
  if (!source) return '';
  const titled = source.charAt(0).toUpperCase() + source.slice(1).toLowerCase();
  return /s$/i.test(titled) ? titled : `${titled}s`;
}

export function speciesEmoji(species: string | null | undefined): string {
  return SPECIES_EMOJI[String(species || '').toLowerCase()] || '🐾';
}

export function storyBreedChannel(
  species: string | null | undefined,
  breed: string | null | undefined
): StoryBreedChannel | null {
  const breedKey = normalizeBreedKey(breed);
  const speciesKey = String(species || '')
    .trim()
    .toLowerCase();
  if (!breedKey || !speciesKey) return null;
  return {
    species: speciesKey,
    breedKey,
    breedLabel: breedLabelForKey(breedKey, breed),
    channelKey: `${speciesKey}:${breedKey}`,
  };
}

/** El cliente no puede elegir raza: solo se deriva de la mascota protagonista. */
export function resolveStoryBreedFromPet(
  pet: { species?: string | null; breed?: string | null } | null | undefined,
  _clientBreed?: string | null
): StoryBreedChannel | null {
  if (!pet) return null;
  return storyBreedChannel(pet.species, pet.breed);
}

export function resolveStoryAudience(
  requested: string | null | undefined,
  breed: StoryBreedChannel | null
): StoryAudience {
  if (!breed) return 'normal';
  if (requested === 'breed' || requested === 'both') return requested;
  return 'normal';
}

export function storyDestinations(breed: StoryBreedChannel | null): Array<{
  id: StoryAudience;
  label: string;
}> {
  if (!breed) return [{ id: 'normal', label: 'Mi historia' }];
  return [
    { id: 'normal', label: 'Mi historia' },
    { id: 'breed', label: breed.breedLabel },
    { id: 'both', label: 'Ambas' },
  ];
}

export function storyExpiresAt(createdAt: number): number {
  return createdAt + STORY_TTL_MS;
}

export function isStoryActive(
  story: { expiresAt: number; status?: string; deletedAt?: number | null },
  now = Date.now()
): boolean {
  if (story.deletedAt) return false;
  if (story.status && story.status !== 'ready') return false;
  return story.expiresAt > now;
}

export function storyVisibleInPublicFeed(
  story: { status?: string | null; deletedAt?: number | null; expiresAt?: number | null },
  now = Date.now()
): boolean {
  if (!story || story.status !== 'ready') return false;
  if (story.deletedAt) return false;
  return Number(story.expiresAt || 0) > now;
}

export function storyCommentAllowed(
  story: { status?: string | null; deletedAt?: number | null; expiresAt?: number | null } | null,
  userId: string | null | undefined,
  now = Date.now()
): { ok: true } | { ok: false; reason: 'guest' | 'expired' } {
  if (!userId) return { ok: false, reason: 'guest' };
  if (!story || !storyVisibleInPublicFeed(story, now)) return { ok: false, reason: 'expired' };
  return { ok: true };
}

export function storyViewAllowed(
  story: { status?: string | null; deletedAt?: number | null; expiresAt?: number | null } | null,
  now = Date.now()
): boolean {
  return !!(story && storyVisibleInPublicFeed(story, now));
}

export function storyRateLimited(createdInLastDay: number): boolean {
  return Number(createdInLastDay || 0) >= STORY_RATE_LIMIT_PER_DAY;
}

export function isStoryId(id: string | null | undefined): boolean {
  return String(id || '').startsWith(STORY_ID_PREFIX);
}

export function isStoryMuxPassthrough(id: string | null | undefined): boolean {
  return isStoryId(id);
}

export function storyImageThumbUrl(imageUrl: string | null | undefined): string {
  const url = String(imageUrl || '');
  if (!url.includes('imagedelivery.net')) return url;
  return url.replace(/\/public(?:\?.*)?$/, '/w=240,h=240,fit=cover,q=70');
}

export function cfIdFromImageUrl(url: string | null | undefined): string | null {
  const m = String(url || '').match(/imagedelivery\.net\/[^/]+\/([^/]+)\//);
  return m ? m[1] : null;
}

export function storyMediaSafeToDelete(input: {
  table?: string | null;
  imageKind?: string | null;
  imageCfId?: string | null;
  muxAssetId?: string | null;
  otherImageKinds?: string[] | null;
  otherTablesUsingAsset?: string[] | null;
}): { ok: boolean; reason: string } {
  const others = (input.otherTablesUsingAsset || []).filter(Boolean);
  if (others.some((t) => t !== 'stories')) {
    return { ok: false, reason: 'shared_asset' };
  }
  if (input.muxAssetId) {
    if (input.table && input.table !== 'stories') return { ok: false, reason: 'not_story_table' };
    return { ok: true, reason: 'story_mux' };
  }
  if (input.imageCfId) {
    if (input.imageKind && input.imageKind !== STORY_IMAGE_KIND) {
      return { ok: false, reason: 'not_story_kind' };
    }
    const kinds = input.otherImageKinds || [];
    if (kinds.some((k) => k && k !== STORY_IMAGE_KIND)) {
      return { ok: false, reason: 'shared_image_kind' };
    }
    return { ok: true, reason: 'story_image' };
  }
  return { ok: false, reason: 'no_media' };
}

export type StoryCleanupAction =
  | { type: 'delete_media'; storyId: string; imageCfId?: string | null; muxAssetId?: string | null }
  | { type: 'purge_metadata'; storyId: string };

export function planStoryCleanup(
  rows: Array<{
    id: string;
    status?: string | null;
    expiresAt?: number | null;
    deletedAt?: number | null;
    mediaDeletedAt?: number | null;
    cleanupNeeded?: number | null;
    imageCfId?: string | null;
    muxAssetId?: string | null;
  }>,
  now: number
): StoryCleanupAction[] {
  const actions: StoryCleanupAction[] = [];
  for (const row of rows) {
    const expired = Number(row.expiresAt || 0) <= now;
    const deleted = !!row.deletedAt || row.status === 'deleted' || row.status === 'failed';
    const needsMedia = !row.mediaDeletedAt && (expired || deleted || row.cleanupNeeded === 1);
    if (needsMedia && (row.imageCfId || row.muxAssetId)) {
      actions.push({
        type: 'delete_media',
        storyId: row.id,
        imageCfId: row.imageCfId || null,
        muxAssetId: row.muxAssetId || null,
      });
      continue;
    }
    if (
      row.mediaDeletedAt &&
      now - Number(row.mediaDeletedAt) >= STORY_METADATA_RETENTION_MS
    ) {
      actions.push({ type: 'purge_metadata', storyId: row.id });
    }
  }
  return actions;
}

export function uniqueBreedChannelsFromPets(
  pets: Array<{ species?: string | null; breed?: string | null }> | null | undefined
): StoryBreedChannel[] {
  const out: StoryBreedChannel[] = [];
  const seen = new Set<string>();
  for (const pet of pets || []) {
    const ch = storyBreedChannel(pet.species, pet.breed);
    if (!ch || seen.has(ch.channelKey)) continue;
    seen.add(ch.channelKey);
    out.push(ch);
  }
  return out;
}

export function storyRingVariant(hasStory: boolean, hasUnseen: boolean): StoryRingVariant {
  if (!hasStory) return 'none';
  return hasUnseen ? 'unseen' : 'seen';
}

export type StoryRailItem = {
  kind: StoryRailKind;
  id: string;
  label: string;
  emoji?: string | null;
  thumbUrl?: string | null;
  hasStory: boolean;
  hasUnseen: boolean;
  ring: StoryRingVariant;
  count?: number;
};

export function sortFollowedRail(
  items: Array<{ id: string; hasUnseen: boolean; latestAt: number }>
): string[] {
  return [...items]
    .sort((a, b) => {
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      return b.latestAt - a.latestAt;
    })
    .map((i) => i.id);
}

export function buildStoryRailItems(input: {
  self: { hasStory: boolean; hasUnseen: boolean; thumbUrl?: string | null; label?: string };
  followed: Array<{
    id: string;
    label: string;
    thumbUrl?: string | null;
    hasUnseen: boolean;
    latestAt: number;
    count?: number;
  }>;
  myBreedChannels: Array<{
    channel: StoryBreedChannel;
    hasActive: boolean;
    hasUnseen: boolean;
    thumbUrl?: string | null;
    count?: number;
  }>;
  extraBreedCount: number;
}): StoryRailItem[] {
  const items: StoryRailItem[] = [
    {
      kind: 'self',
      id: 'self',
      label: input.self.label || 'Tu historia',
      thumbUrl: input.self.thumbUrl || null,
      hasStory: input.self.hasStory,
      hasUnseen: input.self.hasUnseen,
      ring: storyRingVariant(input.self.hasStory, input.self.hasUnseen),
    },
  ];
  const followedOrder = sortFollowedRail(input.followed);
  const followedById = new Map(input.followed.map((f) => [f.id, f]));
  for (const id of followedOrder) {
    const f = followedById.get(id);
    if (!f) continue;
    items.push({
      kind: 'identity',
      id: f.id,
      label: f.label,
      thumbUrl: f.thumbUrl || null,
      hasStory: true,
      hasUnseen: f.hasUnseen,
      ring: storyRingVariant(true, f.hasUnseen),
      count: f.count,
    });
  }
  for (const row of input.myBreedChannels) {
    if (!row.hasActive) continue;
    items.push({
      kind: 'breed',
      id: row.channel.channelKey,
      label: row.channel.breedLabel,
      emoji: speciesEmoji(row.channel.species),
      thumbUrl: row.thumbUrl || null,
      hasStory: true,
      hasUnseen: row.hasUnseen,
      ring: storyRingVariant(true, row.hasUnseen),
      count: row.count,
    });
  }
  if (input.extraBreedCount > 0) {
    items.push({
      kind: 'more',
      id: 'more',
      label: 'Más',
      hasStory: false,
      hasUnseen: false,
      ring: 'none',
      count: input.extraBreedCount,
    });
  }
  return items;
}

export function storyProgressMs(mediaType: StoryMediaType, durationMs?: number | null): number {
  if (mediaType === 'video') {
    const d = Number(durationMs);
    if (Number.isFinite(d) && d > 0) return Math.min(d, STORY_VIDEO_MAX_MS);
    return STORY_VIDEO_MAX_MS;
  }
  return STORY_PHOTO_DURATION_MS;
}

export function nextStoryIndex(index: number, length: number): number | null {
  if (index + 1 < length) return index + 1;
  return null;
}

export function prevStoryIndex(index: number): number | null {
  if (index > 0) return index - 1;
  return null;
}

export function storyMuxDurationRejects(durationSec: number | null | undefined): boolean {
  if (durationSec == null || !Number.isFinite(Number(durationSec)) || Number(durationSec) < 0) {
    return true;
  }
  return Number(durationSec) > STORY_MUX_MAX_DURATION_SEC;
}

export function clientStoryVideoRejects(durationMs: number | null | undefined): boolean {
  if (durationMs == null || !Number.isFinite(Number(durationMs)) || Number(durationMs) <= 0) {
    return false;
  }
  return Number(durationMs) > STORY_VIDEO_MAX_MS;
}

export function storyTrimEditorConfig() {
  return {
    maxDuration: STORY_VIDEO_MAX_MS,
    minDuration: 1000,
    saveToPhoto: false,
    openShareSheetOnFinish: false,
    openDocumentsOnFinish: false,
    enablePreciseTrimming: true,
    enableEditTools: false,
    closeWhenFinish: true,
    theme: 'dark' as const,
    headerText: 'Recortar historia',
    cancelButtonText: 'Cancelar',
    saveButtonText: 'Usar',
    trimmingText: 'Recortando…',
    durationFormat: 'mm:ss' as const,
    enableSaveDialog: false,
    enableCancelDialog: true,
    cancelDialogTitle: '¿Cancelar recorte?',
    cancelDialogMessage: 'No se usará este segmento.',
    cancelDialogCancelText: 'Seguir',
    cancelDialogConfirmText: 'Salir',
    outputExt: 'mp4',
  };
}

export function applyStoryMuxWebhookEvent(
  story: {
    id: string;
    status?: string | null;
    mux_upload_id?: string | null;
    mux_asset_id?: string | null;
    mux_playback_id?: string | null;
    mux_last_event_id?: string | null;
  } | null,
  event: { id?: string; type?: string; data?: any }
): {
  skip: boolean;
  reason?: string;
  patch: Record<string, unknown>;
  requestMuxDelete: boolean;
} {
  if (!story) return { skip: true, reason: 'unknown_story', patch: {}, requestMuxDelete: false };
  if (event.id && story.mux_last_event_id && event.id === story.mux_last_event_id) {
    return { skip: true, reason: 'duplicate_event', patch: {}, requestMuxDelete: false };
  }
  const type = String(event.type || '');
  const data = event.data || {};
  const base = { mux_last_event_id: event.id || story.mux_last_event_id };

  if (story.status === 'deleted' && type !== 'video.asset.deleted') {
    return { skip: true, reason: 'already_deleted', patch: {}, requestMuxDelete: false };
  }

  if (type === 'video.upload.asset_created') {
    if (story.status === 'ready' || story.status === 'failed') {
      return { skip: true, reason: 'already_terminal', patch: base, requestMuxDelete: false };
    }
    return {
      skip: false,
      patch: {
        ...base,
        mux_asset_id: data.asset_id || data.id || story.mux_asset_id,
        mux_upload_id: data.id || data.upload_id || story.mux_upload_id,
        status: story.status === 'uploading' ? 'processing' : story.status,
      },
      requestMuxDelete: false,
    };
  }

  if (type === 'video.asset.ready') {
    const durationSec = Number(data.duration);
    const playback = Array.isArray(data.playback_ids)
      ? data.playback_ids.find((p: any) => p && p.id)
      : null;
    const playbackId = playback?.id || story.mux_playback_id;
    const assetId = data.id || story.mux_asset_id;
    const uploadId = data.upload_id || story.mux_upload_id;
    const durationMs = Number.isFinite(durationSec) ? Math.round(durationSec * 1000) : null;
    if (storyMuxDurationRejects(durationSec)) {
      return {
        skip: false,
        patch: {
          ...base,
          mux_asset_id: assetId,
          mux_upload_id: uploadId,
          mux_playback_id: playbackId,
          duration_ms: durationMs,
          status: 'failed',
          error: 'duration_exceeded',
          cleanup_needed: 1,
        },
        requestMuxDelete: true,
      };
    }
    return {
      skip: false,
      patch: {
        ...base,
        mux_asset_id: assetId,
        mux_upload_id: uploadId,
        mux_playback_id: playbackId,
        duration_ms: durationMs,
        status: 'ready',
        error: null,
        cleanup_needed: 0,
      },
      requestMuxDelete: false,
    };
  }

  if (type === 'video.upload.errored' || type === 'video.upload.cancelled' || type === 'video.asset.errored') {
    if (story.status === 'ready') {
      return { skip: true, reason: 'already_terminal', patch: base, requestMuxDelete: false };
    }
    return {
      skip: false,
      patch: {
        ...base,
        status: 'failed',
        error: type,
        cleanup_needed: 1,
        mux_asset_id: data.asset_id || data.id || story.mux_asset_id,
      },
      requestMuxDelete: !!data.asset_id || !!data.id || !!story.mux_asset_id,
    };
  }

  return { skip: true, reason: 'unhandled', patch: base, requestMuxDelete: false };
}

export function canDeleteStory(authorUserId: string | null | undefined, actorUserId: string | null | undefined): boolean {
  return !!authorUserId && !!actorUserId && authorUserId === actorUserId;
}

export function storyIdentityKey(row: {
  authorUserId?: string | null;
  authorProfileId?: string | null;
  authorProfileType?: string | null;
  authorPetId?: string | null;
}): string {
  if (row.authorPetId) return `pet:${row.authorPetId}`;
  if (row.authorProfileId && row.authorProfileType && row.authorProfileType !== 'personal') {
    return `profile:${row.authorProfileId}`;
  }
  return `user:${row.authorUserId || 'unknown'}`;
}

export function storiesSchemaApplyEnabled(flag: string | undefined | null): boolean {
  return String(flag || '') === '1';
}
