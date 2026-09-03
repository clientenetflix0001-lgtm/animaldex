import type { StoryGestureAction } from './storyViewerUi.ts';

/** Marca temporal Preview/DEV. */
export const STORY_GESTURE_DEBUG_MARK = 'GESTURE-V8 LAYOUT';

/** Superficie sólida de diagnóstico. OFF: media real restaurada. */
export const STORY_GESTURE_DEBUG_SOLID = false;

export const STORY_GESTURE_DEBUG_TOUCH_FILL = 'rgba(255,0,0,0.15)';

export type StoryDebugBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function formatStoryDebugBox(box: StoryDebugBox | null | undefined): string {
  if (!box || !Number.isFinite(box.width) || !Number.isFinite(box.height)) return 'unmeasured';
  return `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}`;
}

export function storyDebugBoxesEqual(
  a: StoryDebugBox | null | undefined,
  b: StoryDebugBox | null | undefined
): boolean {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function storyLayoutToBox(layout: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}): StoryDebugBox {
  return {
    x: Number(layout.x) || 0,
    y: Number(layout.y) || 0,
    width: Number(layout.width) || 0,
    height: Number(layout.height) || 0,
  };
}

export type StoryExplicitSurfaceStyle = {
  width: number;
  height: number;
  flexGrow: 0;
  flexShrink: 0;
};

/** Pixels from the measured stage. Never flex:1 — that collapses inside RNGH AnimatedWrap. */
export function storyExplicitSurfaceStyle(box: StoryDebugBox | null | undefined): StoryExplicitSurfaceStyle {
  return {
    width: Math.max(0, Math.round(Number(box?.width) || 0)),
    height: Math.max(0, Math.round(Number(box?.height) || 0)),
    flexGrow: 0,
    flexShrink: 0,
  };
}

export function storyHasExplicitSurface(box: StoryDebugBox | null | undefined): boolean {
  const style = storyExplicitSurfaceStyle(box);
  return style.width >= 80 && style.height >= 80;
}

/** Evita el bug Samsung: TOUCH 360x38 / 360x0 en y=752 bajo un stage 360x752. */
export function storyTouchCoversStage(
  stage: StoryDebugBox | null | undefined,
  touch: StoryDebugBox | null | undefined,
  slack = 24
): boolean {
  if (!stage || !touch) return false;
  if (touch.height < 80) return false;
  if (touch.height < stage.height - slack) return false;
  if (Math.abs(touch.y - stage.y) > slack) return false;
  if (Math.abs(touch.width - stage.width) > slack) return false;
  return true;
}

export const STORY_GESTURE_DEBUG_ACTION_MS = 1000;

export type StoryGestureDebugPhase = 'IDLE' | 'BEGAN' | 'ACTIVE' | 'END' | 'CANCEL';

export const STORY_GESTURE_DEBUG_PHASES: StoryGestureDebugPhase[] = [
  'IDLE',
  'BEGAN',
  'ACTIVE',
  'END',
  'CANCEL',
];

export function storyGestureDebugEnabled(
  isDev: boolean,
  channel: string | null | undefined
): boolean {
  return !!isDev || channel === 'preview';
}

export function storyGestureDebugProductionSafe(
  isDev: boolean,
  channel: string | null | undefined
): boolean {
  return !storyGestureDebugEnabled(isDev, channel);
}

export function abbreviateUpdateId(id: string | null | undefined): string {
  const value = String(id || '').trim();
  if (!value) return 'none';
  return value.slice(0, 8);
}

export function storyGestureDebugPhaseLabel(phase: number): StoryGestureDebugPhase {
  return STORY_GESTURE_DEBUG_PHASES[phase] || 'IDLE';
}

export function storyGestureDebugPhaseIndex(phase: StoryGestureDebugPhase): number {
  const idx = STORY_GESTURE_DEBUG_PHASES.indexOf(phase);
  return idx >= 0 ? idx : 0;
}

export function formatStoryGestureDebugAction(action: StoryGestureAction | 'none' | null | undefined): string {
  if (action === 'next') return 'NEXT';
  if (action === 'previous') return 'PREVIOUS';
  if (action === 'stay' || action === 'resume') return 'STAY';
  if (action === 'close') return 'CLOSE';
  return 'NONE';
}

export function storyGestureDebugTouchesProductLogic(): boolean {
  return false;
}

export function storyGestureDebugTouchesBackend(): boolean {
  return false;
}
