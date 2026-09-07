/** Gestos locales de carruseles insertados en el Home. No cambia el pager global. */

export const HOME_MODULE_TAP_SLOP_PX = 12;
export const HOME_MODULE_DIRECTION_LOCK_PX = 8;
export const HOME_MODULE_PRESS_SUPPRESS_MS = 280;

export const HOME_HORIZONTAL_MODULES = [
  'story_channels',
  'alerts',
  'page_recommendations',
  'adoptions',
  'reels',
] as const;

export type HomeHorizontalModule = (typeof HOME_HORIZONTAL_MODULES)[number];
export type HomeModuleGestureKind = 'undecided' | 'tap' | 'horizontal_swipe' | 'vertical_scroll';
export type HomeModuleGestureOwner = 'carousel' | 'home' | 'none';
export type HomeModuleNavTarget =
  | 'none'
  | 'PublicProfile'
  | 'PetProfile'
  | 'StoryViewer'
  | 'ReelViewer'
  | 'AlertDetail';

export function classifyHomeModuleGesture(dx: number, dy: number): HomeModuleGestureKind {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax <= HOME_MODULE_TAP_SLOP_PX && ay <= HOME_MODULE_TAP_SLOP_PX) return 'tap';
  if (ax >= ay && ax >= HOME_MODULE_DIRECTION_LOCK_PX) return 'horizontal_swipe';
  if (ay > ax && ay >= HOME_MODULE_DIRECTION_LOCK_PX) return 'vertical_scroll';
  return 'undecided';
}

export function homeModuleGestureOwner(kind: HomeModuleGestureKind): HomeModuleGestureOwner {
  if (kind === 'horizontal_swipe') return 'carousel';
  if (kind === 'vertical_scroll') return 'home';
  return 'none';
}

export function parentFeedPagerShouldScroll(input: { moduleOwnsHorizontal: boolean }): boolean {
  return !input.moduleOwnsHorizontal;
}

export function homeVerticalListShouldScroll(_input?: { moduleOwnsHorizontal?: boolean }): boolean {
  return true;
}

export function shouldFireHomeModulePress(input: {
  dx: number;
  dy: number;
  recentHorizontalSwipe?: boolean;
}): boolean {
  if (input.recentHorizontalSwipe) return false;
  return classifyHomeModuleGesture(input.dx, input.dy) === 'tap';
}

const TAP_NAV_TARGET: Record<HomeHorizontalModule, HomeModuleNavTarget> = {
  story_channels: 'StoryViewer',
  alerts: 'AlertDetail',
  page_recommendations: 'PublicProfile',
  adoptions: 'PetProfile',
  reels: 'ReelViewer',
};

export function resolveHomeModuleInteraction(input: {
  module: HomeHorizontalModule;
  gesture: HomeModuleGestureKind;
}): {
  scrollCarousel: boolean;
  scrollHome: boolean;
  openReelsTab: boolean;
  changeTab: boolean;
  navigateLaterally: boolean;
  fireItemPress: boolean;
  openItem: HomeModuleNavTarget;
} {
  const owner = homeModuleGestureOwner(input.gesture);
  const isTap = input.gesture === 'tap';
  return {
    scrollCarousel: owner === 'carousel',
    scrollHome: owner !== 'carousel',
    openReelsTab: false,
    changeTab: false,
    navigateLaterally: false,
    fireItemPress: isTap,
    openItem: isTap ? TAP_NAV_TARGET[input.module] : 'none',
  };
}

export function homeFeedScrollContract() {
  return {
    mainVerticalFlatListCount: 1,
    modulesHorizontal: true,
    parentPagerUnchangedOutsideModules: true,
  };
}
