import { FLYER_EXPORT_HEIGHT, FLYER_EXPORT_WIDTH } from './alertFlyer.ts';

export const FLYER_SHARE_FORMAT = 'jpeg' as const;
export const FLYER_SHARE_MIME = 'image/jpeg';
export const FLYER_SHARE_UTI = 'public.jpeg';

/** Primer intento: nítido para texto, ya mucho más liviano que PNG. */
export const FLYER_JPEG_QUALITIES = [0.78, 0.7, 0.68] as const;
export const FLYER_MAX_COMPRESS_ATTEMPTS = FLYER_JPEG_QUALITIES.length;

export const FLYER_IDEAL_MIN_BYTES = 150 * 1024;
export const FLYER_IDEAL_MAX_BYTES = 350 * 1024;
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

export function flyerShareSize(width: number, height: number): { width: number; height: number } {
  if (width <= FLYER_EXPORT_WIDTH && height <= FLYER_EXPORT_HEIGHT) {
    return { width: FLYER_EXPORT_WIDTH, height: FLYER_EXPORT_HEIGHT };
  }
  const scale = Math.min(FLYER_EXPORT_WIDTH / width, FLYER_EXPORT_HEIGHT / height);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export function pickSmallerFlyer(current: FlyerCompressAttempt | null, next: FlyerCompressAttempt): FlyerCompressAttempt {
  if (!current || next.bytes < current.bytes) return next;
  return current;
}
