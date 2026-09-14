import { FLYER_ASPECT } from './alertFlyer.ts';

export function flyerPreviewFooterPadding(insetBottom: number): number {
  const n = typeof insetBottom === 'number' && Number.isFinite(insetBottom) ? insetBottom : 0;
  return Math.max(n + 8, 12);
}

/** El JPEG final sigue siendo 1080×1920. Preview al ancho útil; si no entra entero, hay scroll. */
export function flyerPreviewFrameSize(
  areaWidth: number,
  areaHeight: number,
  aspect = FLYER_ASPECT
): { width: number; height: number } {
  const maxW = Math.max(0, areaWidth - 32);
  if (aspect <= 0) {
    const maxH = Math.max(0, areaHeight - 16);
    return { width: maxW, height: maxH };
  }
  return { width: maxW, height: maxW / aspect };
}

export function flyerPreviewNeedsScroll(frameHeight: number, areaHeight: number): boolean {
  return frameHeight > Math.max(0, areaHeight - 16);
}
