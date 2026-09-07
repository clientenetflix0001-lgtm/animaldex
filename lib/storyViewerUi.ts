import { STORY_PHOTO_DURATION_MS, STORY_VIDEO_MAX_MS, type StoryMediaType } from './stories.ts';
import { nextStoryIndex, prevStoryIndex } from './stories.ts';

export const STORY_TAP_LEFT_RATIO = 0.5;
export const STORY_HOLD_DELAY_MS = 250;
export const STORY_TAP_MAX_MS = 250;
export const STORY_MOVE_SLOP_PX = 16;
export const STORY_SWIPE_MIN_DX = 60;
export const STORY_PAN_ACTIVE_OFFSET_X = 15;
export const STORY_PAN_FAIL_OFFSET_Y = 40;
export const STORY_HOLD_MIN_DURATION_MS = 0;
/** Mismo slack que el result sheet del QR Scanner (probado en Samsung). */
export const OVERLAY_SHEET_BOTTOM_EXTRA = 12;
export const OVERLAY_SHEET_BOTTOM_MIN = 20;

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

export function classifyStorySwipe(opts: {
  deltaX: number;
  deltaY: number;
  commentsOpen?: boolean;
}): StoryGestureKind {
  if (opts.commentsOpen) return 'cancel';
  const dx = Number(opts.deltaX);
  const dy = Number(opts.deltaY);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 'cancel';
  if (Math.abs(dx) < STORY_SWIPE_MIN_DX) return 'hold';
  if (Math.abs(dx) <= Math.abs(dy)) return 'cancel';
  return dx < 0 ? 'next' : 'previous';
}

export function classifyStoryGesture(touch: StoryTouch): StoryGestureKind {
  return classifyStorySwipe({
    deltaX: Number(touch.endX) - Number(touch.startX),
    deltaY: Number(touch.endY) - Number(touch.startY),
    commentsOpen: touch.commentsOpen,
  });
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

export function storyGestureUsesDedicatedHoldAndPan(): boolean {
  return true;
}

export function storyGestureHoldUsesSharedValue(): boolean {
  return true;
}

export function storyGestureDetectorChildUsesFlexLayout(): boolean {
  return false;
}

export function storyGestureChildUsesExplicitStageSize(): boolean {
  return true;
}

export type StoryLayoutBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type StoryExplicitSurfaceStyle = {
  width: number;
  height: number;
  flexGrow: 0;
  flexShrink: 0;
};

export function storyLayoutToBox(layout: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}): StoryLayoutBox {
  return {
    x: Number(layout.x) || 0,
    y: Number(layout.y) || 0,
    width: Number(layout.width) || 0,
    height: Number(layout.height) || 0,
  };
}

export function storyLayoutBoxesEqual(
  a: StoryLayoutBox | null | undefined,
  b: StoryLayoutBox | null | undefined
): boolean {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** Pixels from the measured stage. Never flex:1 — that collapses inside RNGH AnimatedWrap. */
export function storyExplicitSurfaceStyle(box: StoryLayoutBox | null | undefined): StoryExplicitSurfaceStyle {
  return {
    width: Math.max(0, Math.round(Number(box?.width) || 0)),
    height: Math.max(0, Math.round(Number(box?.height) || 0)),
    flexGrow: 0,
    flexShrink: 0,
  };
}

export function storyHasExplicitSurface(box: StoryLayoutBox | null | undefined): boolean {
  const style = storyExplicitSurfaceStyle(box);
  return style.width >= 80 && style.height >= 80;
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

/** Copia el contrato del result sheet de QRScanner: Math.max(insets.bottom + 12, 20). */
export function storyCommentsComposerPadding(insets: { bottom?: number } | null | undefined) {
  return Math.max(Number(insets?.bottom || 0) + OVERLAY_SHEET_BOTTOM_EXTRA, OVERLAY_SHEET_BOTTOM_MIN);
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
