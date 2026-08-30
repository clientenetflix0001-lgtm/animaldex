/**
 * Política de Reels + Mux (cliente, Worker y tests).
 *
 * Duración de producto (UI / trim / archivo a subir):
 *   el usuario NUNCA puede seleccionar más de 30.00 s
 *   30.00 s inclusive = válido en el editor
 * Mux metadata (autoridad del webhook): holgura TÉCNICA de 0.15 s
 *   porque un clip real de 5.000 s llegó como 5.067 s (+67 ms).
 *   Se acepta durationSec <= 30.15; > 30.15 se rechaza.
 *   No se sube el tope de la UI a 30.2 / 30.5.
 * Galería: un video >30 s NO se rechaza si puede pasar por el trim.
 *
 * Tamaño 50 MB: el archivo NO atraviesa el Worker. Cliente valida
 * fileSize del picker. Worker solo puede rechazar el byteSize DECLARADO
 * en createReelUpload. Mux no se usa aquí como medidor de bytes del
 * original (no hay metadata fiable de “peso del archivo subido”).
 *
 * Secrets (solo Worker, nunca cliente):
 *   MUX_TOKEN_ID, MUX_TOKEN_SECRET, MUX_WEBHOOK_SECRET
 * Limpieza Mux DELETE solo si MUX_CLEANUP_ENABLED === '1'.
 * Schema D1: migrations/001_reels.sql es la fuente de verdad.
 * ensureReelsSchema no aplica SQL salvo REELS_SCHEMA_APPLY=1.
 */

export const REEL_MAX_DURATION_SEC = 30;
export const REEL_MAX_DURATION_MS = REEL_MAX_DURATION_SEC * 1000;
/** Holgura solo para data.duration de Mux. No es límite de producto. */
export const REEL_MUX_DURATION_SLACK_SEC = 0.15;
export const REEL_MUX_MAX_DURATION_SEC = REEL_MAX_DURATION_SEC + REEL_MUX_DURATION_SLACK_SEC;
export const REEL_MAX_BYTES = 50 * 1024 * 1024;
export const REEL_ALLOWED_MIMES = ['video/mp4', 'video/quicktime'] as const;
export const REEL_DURATION_REJECT_MESSAGE = 'Los Reels pueden durar hasta 30 segundos.';
export const REEL_UPLOADS_PER_HOUR = 5;
export const REEL_UPLOADS_PER_DAY = 15;
export const REEL_CAPTION_MAX = 300;
export const REEL_FEED_PAGE = 10;
export const REEL_UPLOAD_TIMEOUT_SEC = 600;
export const REEL_STALE_UPLOAD_MS = 60 * 60 * 1000;
export const REEL_WEBHOOK_SKEW_MS = 5 * 60 * 1000;
export const REEL_SCROLL_DEBOUNCE_MS = 120;
export const REEL_ACTIVE_BUFFER_SEC = 4;
export const REEL_PRELOAD_BUFFER_SEC = 1.5;
export const REEL_PUBLIC_ORIGIN = 'https://animaldex-web.pages.dev';

export const REEL_STATUSES = [
  'uploading',
  'processing',
  'ready',
  'upload_failed',
  'processing_failed',
  'rejected',
  'deleted',
] as const;

export type ReelStatus = (typeof REEL_STATUSES)[number];
export type ReelModeration = 'none' | 'hidden' | 'blocked';
export type ReelPlayerRole = 'active' | 'next' | 'idle';

export function isAllowedReelMime(raw: string | null | undefined): boolean {
  const mime = String(raw || '').split(';')[0].trim().toLowerCase();
  return (REEL_ALLOWED_MIMES as readonly string[]).includes(mime);
}

export function normalizeReelMime(raw: string | null | undefined): string | null {
  const mime = String(raw || '').split(';')[0].trim().toLowerCase();
  return isAllowedReelMime(mime) ? mime : null;
}

/** Valida un tamaño DECLARADO (picker / body.byteSize), no el archivo real. */
export function isReelFileTooLarge(bytes: number | null | undefined): boolean {
  if (bytes == null || !Number.isFinite(Number(bytes))) return false;
  return Number(bytes) > REEL_MAX_BYTES;
}

/** Cliente / trim: si puede medir duración, >30000 ms se rechaza. 30000 es válido. */
export function clientDurationRejects(durationMs: number | null | undefined): boolean {
  if (durationMs == null || !Number.isFinite(Number(durationMs)) || Number(durationMs) <= 0) {
    return false;
  }
  return Number(durationMs) > REEL_MAX_DURATION_MS;
}

/** Galería: >30 s requiere trim; no se rechaza el pick. */
export function galleryNeedsTrim(durationMs: number | null | undefined): boolean {
  if (durationMs == null || !Number.isFinite(Number(durationMs)) || Number(durationMs) <= 0) {
    return false;
  }
  return Number(durationMs) > REEL_MAX_DURATION_MS;
}

/**
 * Autoridad Mux/backend: segundos (float de Mux) + holgura 0.15 s.
 * 29.99, 30.00 y 30.15 → válido; 30.16, 30.25, 31.00 → rechazado.
 */
export function muxDurationRejects(durationSec: number | null | undefined): boolean {
  if (durationSec == null || !Number.isFinite(Number(durationSec)) || Number(durationSec) < 0) {
    return true;
  }
  return Number(durationSec) > REEL_MUX_MAX_DURATION_SEC;
}

/** Archivo que se sube a Mux: trimmed gana siempre sobre el original. */
export function reelUploadSource(input: { originalUri?: string | null; trimmedUri?: string | null }): string | null {
  const trimmed = String(input.trimmedUri || '').trim();
  if (trimmed) return trimmed;
  const original = String(input.originalUri || '').trim();
  return original || null;
}

export function durationSecToMs(durationSec: number): number {
  return Math.round(Number(durationSec) * 1000);
}

export function muxHlsUrl(playbackId: string): string {
  return `https://stream.mux.com/${encodeURIComponent(playbackId)}.m3u8`;
}

export function muxThumbnailUrl(playbackId: string): string {
  const id = encodeURIComponent(playbackId);
  return `https://image.mux.com/${id}/thumbnail.webp?time=0.1&width=720&height=1280&fit_mode=smartcrop`;
}

export function reelShareUrl(reelId: string): string {
  return `${REEL_PUBLIC_ORIGIN}/r/${encodeURIComponent(reelId)}`;
}

export function isPublicReel(input: {
  status: string;
  deletedAt?: number | null;
  moderation?: string | null;
}): boolean {
  if (input.deletedAt) return false;
  if (input.status !== 'ready') return false;
  const mod = input.moderation || 'none';
  return mod !== 'blocked' && mod !== 'hidden';
}

export function reelUploadLimited(hourCount: number, dayCount: number): boolean {
  return hourCount >= REEL_UPLOADS_PER_HOUR || dayCount >= REEL_UPLOADS_PER_DAY;
}

export function reelPlayerSourceKey(role: ReelPlayerRole, hlsUrl: string | null | undefined): string {
  return role === 'idle' || !hlsUrl ? 'idle' : `hls:${hlsUrl}`;
}

export function displayedLikeCount(likeCount: number, liked: boolean, serverLiked?: boolean): number {
  return Math.max(0, (likeCount || 0) + (liked ? 1 : 0) - (serverLiked ? 1 : 0));
}

export function toggleLikedSet(prev: Iterable<string>, id: string): { next: Set<string>; value: boolean } {
  const next = new Set(prev);
  const value = !next.has(id);
  if (value) next.add(id);
  else next.delete(id);
  return { next, value };
}

export function rollbackLikedSet(current: Iterable<string>, id: string, attemptedValue: boolean): Set<string> {
  const roll = new Set(current);
  if (attemptedValue) roll.delete(id);
  else roll.add(id);
  return roll;
}

export function shouldPlayReel(input: {
  tabFocused: boolean;
  reelsPageVisible: boolean;
  reelIsActive: boolean;
  appIsForeground: boolean;
}): boolean {
  return !!(input.tabFocused && input.reelsPageVisible && input.reelIsActive && input.appIsForeground);
}

export function shouldStartStream(nowMs: number, becameStableAtMs: number, debounceMs = REEL_SCROLL_DEBOUNCE_MS): boolean {
  return nowMs - becameStableAtMs >= debounceMs;
}

export function playerRoleForIndex(index: number, activeIndex: number): ReelPlayerRole {
  if (index === activeIndex) return 'active';
  if (index === activeIndex + 1) return 'next';
  return 'idle';
}

export function bufferSecondsForRole(role: ReelPlayerRole): number {
  if (role === 'active') return REEL_ACTIVE_BUFFER_SEC;
  if (role === 'next') return REEL_PRELOAD_BUFFER_SEC;
  return 0;
}

export function extractMuxPlaybackId(data: { playback_ids?: Array<{ id?: string; policy?: string }> } | null | undefined): string | null {
  const ids = data?.playback_ids || [];
  const pub = ids.find((p) => p && p.policy === 'public' && p.id) || ids.find((p) => p && p.id);
  return pub?.id || null;
}

export function extractMuxVideoSize(data: {
  tracks?: Array<{ type?: string; max_width?: number; max_height?: number }>;
} | null | undefined): { width: number | null; height: number | null } {
  const track = (data?.tracks || []).find((t) => t && t.type === 'video');
  const width = track && Number.isFinite(Number(track.max_width)) ? Number(track.max_width) : null;
  const height = track && Number.isFinite(Number(track.max_height)) ? Number(track.max_height) : null;
  return { width, height };
}

export type ReelRowLike = {
  id: string;
  status: ReelStatus | string;
  mux_upload_id?: string | null;
  mux_asset_id?: string | null;
  mux_playback_id?: string | null;
  mux_last_event_id?: string | null;
  duration_ms?: number | null;
  width?: number | null;
  height?: number | null;
  error?: string | null;
  cleanup_needed?: number | null;
  deleted_at?: number | null;
  ready_at?: number | null;
};

export type MuxWebhookApply = {
  skip: boolean;
  reason?: string;
  patch: Partial<ReelRowLike> & { status?: ReelStatus };
  requestMuxDelete: boolean;
};

export function applyMuxWebhookEvent(
  reel: ReelRowLike | null,
  event: { id?: string; type?: string; data?: any }
): MuxWebhookApply {
  if (!reel) return { skip: true, reason: 'unknown_reel', patch: {}, requestMuxDelete: false };
  if (event.id && reel.mux_last_event_id && event.id === reel.mux_last_event_id) {
    return { skip: true, reason: 'duplicate_event', patch: {}, requestMuxDelete: false };
  }
  const type = String(event.type || '');
  const data = event.data || {};
  const base: Partial<ReelRowLike> = { mux_last_event_id: event.id || reel.mux_last_event_id };

  if (reel.status === 'deleted' && type !== 'video.asset.deleted') {
    return { skip: true, reason: 'already_deleted', patch: {}, requestMuxDelete: false };
  }

  if (type === 'video.upload.asset_created') {
    if (reel.status === 'ready' || reel.status === 'rejected') {
      return { skip: true, reason: 'already_terminal', patch: base, requestMuxDelete: false };
    }
    return {
      skip: false,
      patch: {
        ...base,
        mux_asset_id: data.asset_id || data.id || reel.mux_asset_id,
        mux_upload_id: data.id || data.upload_id || reel.mux_upload_id,
        status: reel.status === 'uploading' ? 'processing' : reel.status,
      },
      requestMuxDelete: false,
    };
  }

  if (type === 'video.asset.ready') {
    const durationSec = Number(data.duration);
    const playbackId = extractMuxPlaybackId(data);
    const size = extractMuxVideoSize(data);
    const assetId = data.id || reel.mux_asset_id;
    const uploadId = data.upload_id || reel.mux_upload_id;
    if (muxDurationRejects(durationSec)) {
      return {
        skip: false,
        patch: {
          ...base,
          mux_asset_id: assetId,
          mux_upload_id: uploadId,
          mux_playback_id: playbackId,
          duration_ms: Number.isFinite(durationSec) ? durationSecToMs(durationSec) : null,
          width: size.width,
          height: size.height,
          status: 'rejected',
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
        duration_ms: durationSecToMs(durationSec),
        width: size.width,
        height: size.height,
        status: 'ready',
        error: null,
        cleanup_needed: 0,
      },
      requestMuxDelete: false,
    };
  }

  if (type === 'video.upload.errored' || type === 'video.upload.cancelled') {
    if (reel.status === 'ready' || reel.status === 'rejected') {
      return { skip: true, reason: 'already_terminal', patch: base, requestMuxDelete: false };
    }
    return {
      skip: false,
      patch: {
        ...base,
        status: 'upload_failed',
        error: type === 'video.upload.cancelled' ? 'cancelled' : 'upload_errored',
        cleanup_needed: 1,
      },
      requestMuxDelete: false,
    };
  }

  if (type === 'video.asset.errored') {
    if (reel.status === 'ready' || reel.status === 'rejected') {
      return { skip: true, reason: 'already_terminal', patch: base, requestMuxDelete: false };
    }
    return {
      skip: false,
      patch: {
        ...base,
        mux_asset_id: data.id || reel.mux_asset_id,
        status: 'processing_failed',
        error: 'asset_errored',
        cleanup_needed: 1,
      },
      requestMuxDelete: !!data.id || !!reel.mux_asset_id,
    };
  }

  if (type === 'video.asset.deleted') {
    return {
      skip: false,
      patch: {
        ...base,
        status: 'deleted',
        cleanup_needed: 0,
      },
      requestMuxDelete: false,
    };
  }

  return { skip: true, reason: 'ignored_type', patch: base, requestMuxDelete: false };
}

export type ReelCleanupAction = {
  reelId: string;
  reason: 'stale_upload' | 'rejected' | 'failed' | 'deleted_pending';
  muxAssetId: string | null;
  muxUploadId: string | null;
  markDeleted: boolean;
};

export function planReelCleanup(
  reels: Array<ReelRowLike & { created_at?: number }>,
  nowMs: number,
  staleMs = REEL_STALE_UPLOAD_MS
): ReelCleanupAction[] {
  const out: ReelCleanupAction[] = [];
  for (const r of reels) {
    const created = Number(r.created_at || 0);
    if (r.status === 'uploading' && created && nowMs - created >= staleMs) {
      out.push({
        reelId: r.id,
        reason: 'stale_upload',
        muxAssetId: r.mux_asset_id || null,
        muxUploadId: r.mux_upload_id || null,
        markDeleted: true,
      });
      continue;
    }
    if (r.status === 'rejected' && (r.cleanup_needed || r.mux_asset_id)) {
      out.push({
        reelId: r.id,
        reason: 'rejected',
        muxAssetId: r.mux_asset_id || null,
        muxUploadId: r.mux_upload_id || null,
        markDeleted: false,
      });
    }
    if ((r.status === 'upload_failed' || r.status === 'processing_failed') && (r.cleanup_needed || r.mux_asset_id)) {
      out.push({
        reelId: r.id,
        reason: 'failed',
        muxAssetId: r.mux_asset_id || null,
        muxUploadId: r.mux_upload_id || null,
        markDeleted: false,
      });
    }
    if (r.status === 'deleted' && r.cleanup_needed && r.mux_asset_id) {
      out.push({
        reelId: r.id,
        reason: 'deleted_pending',
        muxAssetId: r.mux_asset_id,
        muxUploadId: r.mux_upload_id || null,
        markDeleted: false,
      });
    }
  }
  return out;
}

export function muxCleanupEnabled(flag: string | undefined | null): boolean {
  return String(flag || '') === '1';
}

export function clientReelValidationError(input: {
  mime?: string | null;
  bytes?: number | null;
  durationMs?: number | null;
  /** Galería: no rechaza >30 s (el trim recorta). Publicar: sí. */
  stage?: 'gallery' | 'publish';
}): string | null {
  if (!isAllowedReelMime(input.mime)) return 'Formato no soportado. Usá MP4 o MOV.';
  if (isReelFileTooLarge(input.bytes)) return 'El video puede pesar hasta 50 MB.';
  if (input.stage === 'gallery') return null;
  if (clientDurationRejects(input.durationMs)) return REEL_DURATION_REJECT_MESSAGE;
  return null;
}
