import type { StoryGestureAction } from './storyViewerUi.ts';

/** Marca temporal de esta ronda de diagnóstico. Solo Preview/DEV. */
export const STORY_GESTURE_DEBUG_MARK = 'GESTURE-V6 HITTEST';

/**
 * Reemplaza foto/video por una View sólida para descartar expo-image / VideoView.
 * Conserva GestureDetector, progreso, chrome y navegación.
 * TEMPORAL: true solo para esta ronda de hit-test.
 */
export const STORY_GESTURE_DEBUG_SOLID = true;

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
