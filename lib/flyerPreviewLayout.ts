import { FLYER_ASPECT } from './alertFlyer.ts';

export function flyerPreviewFooterPadding(insetBottom: number): number {
  const n = typeof insetBottom === 'number' && Number.isFinite(insetBottom) ? insetBottom : 0;
  return Math.max(n + 8, 12);
}

/** Encaja el 4:5 en el área libre sobre el footer. No cambia el JPEG 1080×1350. */
export function flyerPreviewFrameSize(
  areaWidth: number,
  areaHeight: number,
  aspect = FLYER_ASPECT
): { width: number; height: number } {
  const maxW = Math.max(0, areaWidth - 32);
  const maxH = Math.max(0, areaHeight - 16);
  if (aspect <= 0) return { width: maxW, height: maxH };
  const width = Math.min(maxW, maxH * aspect);
  return { width, height: width / aspect };
}
