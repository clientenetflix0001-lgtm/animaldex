/** Una sola fuente de verdad: página 0 = Inicio, 1 = Reels. */

export type FeedReelsPage = 0 | 1;

export function feedPageFromTab(name: string | null | undefined): FeedReelsPage | null {
  if (name === 'Inicio') return 0;
  if (name === 'Reels') return 1;
  return null;
}

export function tabFromFeedPage(page: FeedReelsPage): 'Inicio' | 'Reels' {
  return page === 1 ? 'Reels' : 'Inicio';
}

export function isFeedReelsTab(name: string | null | undefined): boolean {
  return name === 'Inicio' || name === 'Reels';
}

export function resolvedMainTab(navFocused: string, feedPage: FeedReelsPage): string {
  if (isFeedReelsTab(navFocused)) return tabFromFeedPage(feedPage);
  return navFocused;
}

export function shouldHighlightTab(tabName: string, navFocused: string, feedPage: FeedReelsPage): boolean {
  return resolvedMainTab(navFocused, feedPage) === tabName;
}

export type MainTabPress =
  | { kind: 'noop' }
  | { kind: 'setPage'; page: FeedReelsPage }
  | { kind: 'navigate'; tab: string; page?: FeedReelsPage };

export function planMainTabPress(input: {
  pressed: string;
  navFocused: string;
  feedPage: FeedReelsPage;
}): MainTabPress {
  if (input.pressed === 'Inicio' || input.pressed === 'Reels') {
    const page: FeedReelsPage = input.pressed === 'Reels' ? 1 : 0;
    if (isFeedReelsTab(input.navFocused)) {
      return input.feedPage === page ? { kind: 'noop' } : { kind: 'setPage', page };
    }
    return { kind: 'navigate', tab: 'Inicio', page };
  }
  if (input.navFocused === input.pressed) return { kind: 'noop' };
  return { kind: 'navigate', tab: input.pressed };
}

export function shouldPlayFeedReels(input: { page: FeedReelsPage; tabFocused: boolean }): boolean {
  return input.page === 1 && input.tabFocused;
}

/** Página 0/1 a partir del offset del pager horizontal. */
export function pageFromPagerOffset(offsetX: number, width: number): FeedReelsPage {
  if (!width || width <= 0 || !Number.isFinite(offsetX)) return 0;
  const next = Math.round(offsetX / width);
  return next <= 0 ? 0 : 1;
}

/**
 * Devuelve la página a commitear, o null si no cambió.
 * El swiper web no emite onMomentumScrollEnd de forma fiable.
 */
export function commitFeedPageFromOffset(
  offsetX: number,
  width: number,
  current: FeedReelsPage
): FeedReelsPage | null {
  const next = pageFromPagerOffset(offsetX, width);
  return next === current ? null : next;
}
