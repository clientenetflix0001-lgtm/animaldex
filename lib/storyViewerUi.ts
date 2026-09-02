import { STORY_PHOTO_DURATION_MS, STORY_VIDEO_MAX_MS, type StoryMediaType } from './stories.ts';

export const STORY_TAP_LEFT_RATIO = 0.45;
export const STORY_HOLD_DELAY_MS = 160;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function remainingProgressMs(progress01: number, totalMs: number): number {
  const total = Number(totalMs);
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, (1 - clamp01(progress01)) * total);
}

export function storyTapSide(x: number, width: number): 'left' | 'right' {
  const w = Number(width);
  if (!Number.isFinite(w) || w <= 0) return 'right';
  return Number(x) < w * STORY_TAP_LEFT_RATIO ? 'left' : 'right';
}

export function shouldIgnoreTapAfterHold(didHold: boolean): boolean {
  return !!didHold;
}

export function storyChromeInsets(insets: { top?: number; bottom?: number } | null | undefined) {
  return {
    paddingTop: Math.max(0, Number(insets?.top || 0)),
    paddingBottom: Math.max(0, Number(insets?.bottom || 0)),
  };
}

export function storyProgressDurationMs(mediaType: StoryMediaType, durationMs?: number | null): number {
  if (mediaType === 'video') {
    const d = Number(durationMs);
    if (Number.isFinite(d) && d > 0) return Math.min(d, STORY_VIDEO_MAX_MS);
    return STORY_VIDEO_MAX_MS;
  }
  return STORY_PHOTO_DURATION_MS;
}

export function storyProgressUsesInterval(): boolean {
  return false;
}

export function storyProgressUsesPerFrameState(): boolean {
  return false;
}
