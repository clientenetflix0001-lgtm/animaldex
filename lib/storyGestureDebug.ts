import type { StoryGestureAction } from './storyViewerUi.ts';

/** Marca temporal de esta ronda de diagnóstico. Solo Preview/DEV. */
export const STORY_GESTURE_DEBUG_MARK = 'GESTURE-V5 DEBUG';

/**
 * Prueba posterior: si true (y debug activo), reemplaza foto/video por una View sólida.
 * Conserva GestureDetector, progreso, chrome y navegación.
 * Default false: no activa la superficie sólida.
 */
export const STORY_GESTURE_DEBUG_SOLID = false;

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
