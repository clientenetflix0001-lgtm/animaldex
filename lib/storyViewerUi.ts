import { STORY_PHOTO_DURATION_MS, STORY_VIDEO_MAX_MS, type StoryMediaType } from './stories.ts';
import { nextStoryIndex, prevStoryIndex } from './stories.ts';

export const STORY_TAP_LEFT_RATIO = 0.5;
export const STORY_HOLD_DELAY_MS = 250;
export const STORY_TAP_MAX_MS = 250;
export const STORY_MOVE_SLOP_PX = 16;

export type StoryGestureKind = 'previous' | 'next' | 'hold' | 'cancel';
export type StoryGestureAction = 'stay' | 'previous' | 'next' | 'close' | 'resume';

export type StoryTouch = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startMs: number;
  endMs: number;
  width: number;
  commentsOpen?: boolean;
};

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

export function shouldNavigateOnRelease(opts: {
  held: boolean;
  downAtMs: number;
  nowMs: number;
  holdDelayMs?: number;
}): boolean {
  if (opts.held) return false;
  const delay = opts.holdDelayMs ?? STORY_HOLD_DELAY_MS;
  if (!Number.isFinite(opts.downAtMs) || !Number.isFinite(opts.nowMs)) return false;
  return opts.nowMs - opts.downAtMs < delay;
}

export function classifyStoryGesture(touch: StoryTouch): StoryGestureKind {
  if (touch.commentsOpen) return 'cancel';
  const duration = Number(touch.endMs) - Number(touch.startMs);
  const dx = Math.abs(Number(touch.endX) - Number(touch.startX));
  const dy = Math.abs(Number(touch.endY) - Number(touch.startY));
  if (!Number.isFinite(duration) || duration < 0) return 'cancel';
  if (dx > STORY_MOVE_SLOP_PX || dy > STORY_MOVE_SLOP_PX) return 'cancel';
  if (duration >= STORY_TAP_MAX_MS) return 'hold';
  return storyTapSide(touch.startX, touch.width) === 'left' ? 'previous' : 'next';
}

export function applyStoryGesture(
  kind: StoryGestureKind,
  index: number,
  length: number
): { action: StoryGestureAction; nextIndex: number } {
  if (kind === 'hold' || kind === 'cancel') {
    return { action: 'resume', nextIndex: index };
  }
  if (kind === 'previous') {
    const prev = prevStoryIndex(index);
    if (prev == null) return { action: 'stay', nextIndex: index };
    return { action: 'previous', nextIndex: prev };
  }
  const next = nextStoryIndex(index, length);
  if (next == null) return { action: 'close', nextIndex: index };
  return { action: 'next', nextIndex: next };
}

export function storyGesturePausesOnTouchStart(): boolean {
  return true;
}

export function storyGestureUsesPressableZones(): boolean {
  return false;
}

/** Media may extend behind the status bar; bottom nav stays inset. */
export function storyStageInsets(insets: { top?: number; bottom?: number } | null | undefined) {
  return {
    marginTop: 0,
    marginBottom: Math.max(0, Number(insets?.bottom || 0)),
  };
}

export function storyChromeTopInset(insets: { top?: number; bottom?: number } | null | undefined) {
  return Math.max(0, Number(insets?.top || 0));
}

export function storyChromeInsets(insets: { top?: number; bottom?: number } | null | undefined) {
  return {
    paddingTop: Math.max(0, Number(insets?.top || 0)),
    paddingBottom: Math.max(0, Number(insets?.bottom || 0)),
  };
}

export function storyCommentsComposerPadding(insets: { bottom?: number } | null | undefined) {
  return Math.max(0, Number(insets?.bottom || 0));
}

export function storyMediaUsesRootAbsoluteFill(): boolean {
  return false;
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
