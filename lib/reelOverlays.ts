/**
 * Overlays de texto sobre Reels. No se queman en el MP4.
 * Posiciones normalizadas 0–1. Máximo 3 textos × 100 caracteres.
 */

export const REEL_OVERLAY_MAX = 3;
export const REEL_OVERLAY_TEXT_MAX = 100;
export const REEL_OVERLAY_SAFE = { minX: 0.08, maxX: 0.92, minY: 0.16, maxY: 0.72 };

export type ReelOverlayBackground = 'none' | 'solid';

export type ReelTextOverlay = {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  textColor: string;
  background: ReelOverlayBackground;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
};

const COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function sanitizeOverlayText(raw: string | null | undefined): string {
  return String(raw || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, REEL_OVERLAY_TEXT_MAX);
}

function clamp01(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return (min + max) / 2;
  return Math.min(max, Math.max(min, n));
}

function overlayStyle(input: Partial<ReelTextOverlay> | null | undefined, index = 0) {
  const color = COLOR_RE.test(String(input?.textColor || '')) ? String(input?.textColor) : '#FFFFFF';
  const bg = input?.background === 'solid' ? 'solid' : 'none';
  const align = input?.align === 'left' || input?.align === 'right' ? input.align : 'center';
  const fontSize = Math.min(42, Math.max(16, Number(input?.fontSize) || 22));
  return {
    id: String(input?.id || `ov-${index}`).slice(0, 40),
    x: clamp01(Number(input?.x ?? 0.5), REEL_OVERLAY_SAFE.minX, REEL_OVERLAY_SAFE.maxX),
    y: clamp01(Number(input?.y ?? 0.3), REEL_OVERLAY_SAFE.minY, REEL_OVERLAY_SAFE.maxY),
    fontSize,
    textColor: color,
    background: bg,
    align,
    bold: !!input?.bold,
  };
}

/** Draft del editor: permite texto vacío. Persistencia usa normalizeOverlay. */
export function createDraftOverlay(input: Partial<ReelTextOverlay> | null | undefined = {}, index = 0): ReelTextOverlay {
  return { ...overlayStyle(input, index), text: '' };
}

export function normalizeOverlay(input: Partial<ReelTextOverlay> | null | undefined, index = 0): ReelTextOverlay | null {
  const text = sanitizeOverlayText(input?.text);
  if (!text) return null;
  return { ...overlayStyle(input, index), text };
}

export function parseReelOverlays(raw: unknown): ReelTextOverlay[] {
  let list: unknown[] = [];
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      return [];
    }
  } else if (Array.isArray(raw)) {
    list = raw;
  }
  const out: ReelTextOverlay[] = [];
  for (let i = 0; i < list.length && out.length < REEL_OVERLAY_MAX; i++) {
    const item = normalizeOverlay(list[i] as Partial<ReelTextOverlay>, i);
    if (item) out.push(item);
  }
  return out;
}

export function serializeReelOverlays(items: ReelTextOverlay[] | null | undefined): string {
  return JSON.stringify(parseReelOverlays(items));
}

export function canAddReelOverlay(current: ReelTextOverlay[]): boolean {
  return current.length < REEL_OVERLAY_MAX;
}

export function overlayHlsUnchanged(hlsUrl: string | null | undefined): string | null {
  return hlsUrl || null;
}
