/**
 * Cálculo de caja de media SOLO para el Feed.
 * No recorta el archivo original: solo define aspect-ratio de presentación.
 *
 * Proporción = width / height.
 *  - horizontal máximo ≈ 1.91:1
 *  - cuadrada 1:1
 *  - vertical máximo 4:5 (0.8)
 */

export const FEED_MAX_LANDSCAPE_ASPECT = 1.91;
export const FEED_MIN_PORTRAIT_ASPECT = 4 / 5;
export const FEED_TEXT_BACKGROUND_ASPECT = 4 / 5;
export const FEED_FALLBACK_MEDIA_HEIGHT = 350;

export type FeedMediaBox =
  | { kind: 'aspect'; aspectRatio: number }
  | { kind: 'fallback'; height: number };

export function parsePositiveDimension(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

/** Aspecto natural width/height, o null si faltan metadatos. */
export function rawMediaAspect(
  width: unknown,
  height: unknown
): number | null {
  const w = parsePositiveDimension(width);
  const h = parsePositiveDimension(height);
  if (!w || !h) return null;
  return w / h;
}

/** Aspecto de presentación: clamp a [4:5, 1.91:1]. */
export function clampFeedMediaAspect(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return 1;
  if (aspect > FEED_MAX_LANDSCAPE_ASPECT) return FEED_MAX_LANDSCAPE_ASPECT;
  if (aspect < FEED_MIN_PORTRAIT_ASPECT) return FEED_MIN_PORTRAIT_ASPECT;
  return aspect;
}

export function feedMediaBox(width: unknown, height: unknown): FeedMediaBox {
  const raw = rawMediaAspect(width, height);
  if (raw == null) {
    return { kind: 'fallback', height: FEED_FALLBACK_MEDIA_HEIGHT };
  }
  return { kind: 'aspect', aspectRatio: clampFeedMediaAspect(raw) };
}

export function feedMediaBoxStyle(
  width: unknown,
  height: unknown
): { width: '100%'; aspectRatio: number } | { width: '100%'; height: number } {
  const box = feedMediaBox(width, height);
  if (box.kind === 'aspect') {
    return { width: '100%', aspectRatio: box.aspectRatio };
  }
  return { width: '100%', height: box.height };
}

export function feedTextBackgroundBoxStyle(): { width: '100%'; aspectRatio: number } {
  return { width: '100%', aspectRatio: FEED_TEXT_BACKGROUND_ASPECT };
}

/** Alto de presentación a partir de un ancho conocido (tests / see-more). */
export function feedBoxHeightForWidth(containerWidth: number, aspectRatio: number): number {
  if (!(containerWidth > 0) || !(aspectRatio > 0)) return FEED_FALLBACK_MEDIA_HEIGHT;
  return containerWidth / aspectRatio;
}

/** Varias fotos: una sola caja, según la primera/principal. */
export function feedCarouselBox(
  images: Array<{ width?: unknown; height?: unknown }>
): FeedMediaBox {
  const first = images[0];
  if (!first) return { kind: 'fallback', height: FEED_FALLBACK_MEDIA_HEIGHT };
  return feedMediaBox(first.width, first.height);
}
