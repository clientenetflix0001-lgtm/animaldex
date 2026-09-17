/**
 * Contadores de desarrollo para comparar renders del Feed.
 * No se muestran en UI y no corren en producción.
 */

export type FeedMediaPerfSnapshot = {
  postCardRenders: number;
  renderItemCalls: number;
  likeToggles: number;
  mediaBoxes: { aspect: number; fallback: number };
  pawOverlayRenders: number;
  pawIconsMounted: number;
  backgroundCardRenders: number;
};

const empty = (): FeedMediaPerfSnapshot => ({
  postCardRenders: 0,
  renderItemCalls: 0,
  likeToggles: 0,
  mediaBoxes: { aspect: 0, fallback: 0 },
  pawOverlayRenders: 0,
  pawIconsMounted: 0,
  backgroundCardRenders: 0,
});

let counters = empty();

function enabled(): boolean {
  return typeof __DEV__ !== 'undefined' && !!__DEV__;
}

export function feedMediaPerfReset(): void {
  counters = empty();
}

export function feedMediaPerfSnapshot(): FeedMediaPerfSnapshot {
  return {
    postCardRenders: counters.postCardRenders,
    renderItemCalls: counters.renderItemCalls,
    likeToggles: counters.likeToggles,
    mediaBoxes: { ...counters.mediaBoxes },
    pawOverlayRenders: counters.pawOverlayRenders,
    pawIconsMounted: counters.pawIconsMounted,
    backgroundCardRenders: counters.backgroundCardRenders,
  };
}

export function feedMediaPerfNotePostCardRender(): void {
  if (!enabled()) return;
  counters.postCardRenders += 1;
}

export function feedMediaPerfNoteRenderItem(): void {
  if (!enabled()) return;
  counters.renderItemCalls += 1;
}

export function feedMediaPerfNoteLikeToggle(): void {
  if (!enabled()) return;
  counters.likeToggles += 1;
}

export function feedMediaPerfNoteMediaBox(kind: 'aspect' | 'fallback'): void {
  if (!enabled()) return;
  counters.mediaBoxes[kind] += 1;
}

export function feedMediaPerfNotePawOverlay(iconCount: number): void {
  if (!enabled()) return;
  counters.pawOverlayRenders += 1;
  counters.pawIconsMounted += iconCount;
}

export function feedMediaPerfNoteBackgroundCard(): void {
  if (!enabled()) return;
  counters.backgroundCardRenders += 1;
}
