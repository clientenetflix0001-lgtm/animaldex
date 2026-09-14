import {
  FLYER_EXPORT_HEIGHT,
  FLYER_EXPORT_WIDTH,
  FLYER_FALLBACK_HEIGHT,
  FLYER_FALLBACK_WIDTH,
} from './alertFlyer.ts';

export const FLYER_SHARE_FORMAT = 'jpeg' as const;
export const FLYER_SHARE_MIME = 'image/jpeg';
export const FLYER_SHARE_UTI = 'public.jpeg';

export { FLYER_FALLBACK_HEIGHT, FLYER_FALLBACK_WIDTH };

/** JPEG escalonado. 1080×1920 pesa más; bajar calidad antes de recortar a 900×1600. */
export const FLYER_JPEG_QUALITIES = [0.7, 0.62, 0.54, 0.46] as const;
export const FLYER_MAX_COMPRESS_ATTEMPTS = FLYER_JPEG_QUALITIES.length;

export const FLYER_IDEAL_MIN_BYTES = 250 * 1024;
export const FLYER_IDEAL_MAX_BYTES = 600 * 1024;
export const FLYER_ACCEPTABLE_BYTES = 600 * 1024;
export const FLYER_HARD_MAX_BYTES = 800 * 1024;

export type FlyerCompressAttempt = {
  quality: number;
  bytes: number;
  uri: string;
};

export function flyerJpegQualityForAttempt(attempt: number): number {
  const index = Math.min(Math.max(attempt, 0), FLYER_JPEG_QUALITIES.length - 1);
  return FLYER_JPEG_QUALITIES[index];
}

export function shouldRetryFlyerCompress(bytes: number, attempt: number): boolean {
  return bytes > FLYER_ACCEPTABLE_BYTES && attempt + 1 < FLYER_MAX_COMPRESS_ATTEMPTS;
}

export function flyerShareSize(
  width: number,
  height: number,
  targetWidth = FLYER_EXPORT_WIDTH,
  targetHeight = FLYER_EXPORT_HEIGHT
): { width: number; height: number } {
  if (width <= targetWidth && height <= targetHeight) {
    return { width: targetWidth, height: targetHeight };
  }
  const scale = Math.min(targetWidth / width, targetHeight / height);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export function shouldFallbackFlyerResolution(bytes: number): boolean {
  return bytes > FLYER_HARD_MAX_BYTES;
}

export function flyerFallbackShareSize(): { width: number; height: number } {
  return { width: FLYER_FALLBACK_WIDTH, height: FLYER_FALLBACK_HEIGHT };
}

export function pickSmallerFlyer(current: FlyerCompressAttempt | null, next: FlyerCompressAttempt): FlyerCompressAttempt {
  if (!current || next.bytes < current.bytes) return next;
  return current;
}
