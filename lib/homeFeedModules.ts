import type { ApiStoryRailItem } from './db.ts';

export const HOME_MODULE_TITLES = {
  storiesForYou: 'Historias para ti',
  alerts: '🚨 Alertas cerca de ti',
  pages: 'Páginas que podrían interesarte',
  adoptions: 'Mascotas que buscan un hogar',
  reels: 'Reels para ti',
} as const;

export const HOME_PAGES_VISIBLE_MIN = 3;
export const HOME_PAGES_VISIBLE_MAX = 8;
export const HOME_ALERTS_VISIBLE_MAX = 3;

export function storiesForYouItems(items: ApiStoryRailItem[] | null | undefined): ApiStoryRailItem[] {
  return (items || []).filter((item) => item.kind === 'identity' || item.kind === 'breed');
}

export function visibleHomePageRecommendations<T>(pages: T[] | null | undefined, max = HOME_PAGES_VISIBLE_MAX): T[] {
  return (pages || []).slice(0, max);
}

export function homePagesMeetVisibleMinimum(count: number, min = HOME_PAGES_VISIBLE_MIN): boolean {
  return count >= min;
}

export function homeFeedHasHeaderStoryRail(source: string): boolean {
  return (
    /ListHeaderComponent=\{listHeader\}/.test(source) &&
    /<StoryRail seedItems=\{storyRailItems\}/.test(source) &&
    /item\.kind === 'story_channels'/.test(source)
  );
}

export function homeFeedHasStoriesForYouModule(source: string): boolean {
  return source.includes('HOME_MODULE_TITLES.storiesForYou') && /item\.kind === 'story_channels'/.test(source);
}
