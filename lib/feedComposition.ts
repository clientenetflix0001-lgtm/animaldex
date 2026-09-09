import type { ApiAlert, ApiReel, ApiStoryRailItem } from './db';
import type { AdoptionCard } from './adoptionDiscovery';
import type { Post } from './data';
import { storiesForYouItems, visibleHomePageRecommendations } from './homeFeedModules.ts';

export const FEED_COMPOSITION_POLICY = {
  /** Metric radius for alerts (and future posts that store lat/lng). Not used to rank posts today. */
  alertRadiusKm: 10,
  firstPagePostLimit: 10,
  laterPagePostLimit: 10,
  maxAlerts: 1,
  alertCandidateLimit: 3,
  maxAdoptions: 2,
  maxReels: 2,
  minPageRecommendations: 3,
  maxPageRecommendations: 8,
  modulesOnFirstPageOnly: true,
  ads: {
    enabled: false,
    afterOrganicItems: 8,
  },
  postsBetweenModules: 2,
  firstPageSequence: [
    'locality_relevant_post',
    'trending_post',
    'story_channels',
    'post',
    'post',
    'alerts',
    'post',
    'post',
    'page_recommendations',
    'post',
    'post',
    'adoptions',
    'post',
    'post',
    'reels',
    'remaining_posts',
  ] as const,
};

export const COMPOSER_MODULE_KINDS = [
  'story_channels',
  'alerts',
  'page_recommendations',
  'adoptions',
  'reels',
] as const;

export type FeedCompositionSlot = (typeof FEED_COMPOSITION_POLICY.firstPageSequence)[number];

export type HomePageRecommendation = {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  type: 'protector' | 'business';
  typeLabel: string;
  locality?: string | null;
};

export type FeedPostBucket = 'locality' | 'trending' | 'default';

export type FeedItem =
  | { kind: 'post'; key: string; post: Post; bucket: FeedPostBucket }
  | { kind: 'story_channels'; key: string; items: ApiStoryRailItem[] }
  | { kind: 'alerts'; key: string; alerts: ApiAlert[] }
  | { kind: 'page_recommendations'; key: string; pages: HomePageRecommendation[] }
  | { kind: 'adoptions'; key: string; pets: AdoptionCard[] }
  | { kind: 'reels'; key: string; reels: ApiReel[] }
  | { kind: 'ad_slot'; key: string };

export function feedItemKey(kind: FeedItem['kind'], id: string): string {
  if (kind === 'post') return `post:${id}`;
  return `module:${kind}:${id}`;
}

export function pageRecommendationTypeLabel(type: 'protector' | 'business'): string {
  return type === 'protector' ? 'Bienestar Animal' : 'Empresa';
}

export function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

/** Una alerta por inserción. Orden de entrada (geo/recencia). Determinista. */
export function selectHomeModuleAlerts(
  alerts: ApiAlert[] | null | undefined,
  usedAlertIds?: Iterable<string>,
  limit = FEED_COMPOSITION_POLICY.maxAlerts
): ApiAlert[] {
  const used = new Set(usedAlertIds || []);
  const active = dedupeById(
    (alerts || []).filter((alert) => alert.status !== 'resolved' && !alert.resolvedAt)
  );
  const unused = active.filter((alert) => !used.has(alert.id));
  const pool = unused.length > 0 ? unused : active;
  return pool.slice(0, Math.max(0, limit));
}

export type ComposeFeedInput = {
  pageIndex: number;
  posts: Post[];
  /** Locality-relevant post ids. Wire alias `nearbyPostIds` means the same — not 10 km. */
  localityRelevantPostIds?: string[];
  nearbyPostIds?: string[];
  trendingPostIds?: string[];
  storyItems?: ApiStoryRailItem[];
  alerts?: ApiAlert[];
  pages?: HomePageRecommendation[];
  adoptions?: AdoptionCard[];
  reels?: ApiReel[];
  usedPostIds?: Iterable<string>;
  usedAlertIds?: Iterable<string>;
  policy?: typeof FEED_COMPOSITION_POLICY;
};

export type ComposeFeedResult = {
  items: FeedItem[];
  usedPostIds: string[];
  usedAlertIds: string[];
  nextCursor: number | undefined;
};

function takeNext<T>(queue: T[]): T | null {
  return queue.length ? queue.shift() ?? null : null;
}

export function composeFeedPage(input: ComposeFeedInput): ComposeFeedResult {
  const policy = input.policy || FEED_COMPOSITION_POLICY;
  const used = new Set(input.usedPostIds || []);
  const posts = (input.posts || []).filter((post) => post?.id && !used.has(post.id));
  const byId = new Map(posts.map((post) => [post.id, post]));
  const localityIds = input.localityRelevantPostIds || input.nearbyPostIds || [];
  const localityQueue = localityIds.filter((id) => byId.has(id));
  const trendingQueue = (input.trendingPostIds || []).filter((id) => byId.has(id) && !localityQueue.includes(id));
  const regularQueue = posts.map((post) => post.id).filter((id) => !localityQueue.includes(id) && !trendingQueue.includes(id));
  const consumed: Post[] = [];
  const items: FeedItem[] = [];

  const bucketFor = (id: string, prefer: FeedPostBucket | 'any'): FeedPostBucket => {
    if (prefer === 'locality' || localityIds.includes(id)) return 'locality';
    if (prefer === 'trending' || (input.trendingPostIds || []).includes(id)) return 'trending';
    return 'default';
  };

  const usedAlertIds = new Set(input.usedAlertIds || []);
  const alerts =
    input.pageIndex === 0 ? selectHomeModuleAlerts(input.alerts, usedAlertIds, policy.maxAlerts) : [];
  const pages = visibleHomePageRecommendations(dedupeById(input.pages || []), policy.maxPageRecommendations);
  const adoptions = (() => {
    const seen = new Set<string>();
    const out: AdoptionCard[] = [];
    for (const card of input.adoptions || []) {
      const id = card.petId || card.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(card);
      if (out.length >= policy.maxAdoptions) break;
    }
    return out;
  })();
  const reels = dedupeById(input.reels || []).slice(0, policy.maxReels);
  const stories = input.storyItems || [];

  const takePost = (prefer: FeedPostBucket | 'any'): Post | null => {
    let id: string | null = null;
    if (prefer === 'locality') id = takeNext(localityQueue);
    else if (prefer === 'trending') id = takeNext(trendingQueue);
    else id = takeNext(regularQueue) || takeNext(localityQueue) || takeNext(trendingQueue);
    if (!id) return null;
    const post = byId.get(id);
    if (!post) return null;
    byId.delete(id);
    consumed.push(post);
    used.add(id);
    return post;
  };

  const pushPost = (post: Post, bucket: FeedPostBucket) => {
    items.push({ kind: 'post', key: feedItemKey('post', post.id), post, bucket });
  };

  const pushAvailableModule = (slot: FeedCompositionSlot): boolean => {
    if (slot === 'story_channels' && storiesForYouItems(stories).length > 0) {
      items.push({ kind: 'story_channels', key: feedItemKey('story_channels', `p${input.pageIndex}`), items: stories });
      return true;
    }
    if (slot === 'alerts' && alerts.length > 0) {
      items.push({ kind: 'alerts', key: feedItemKey('alerts', `p${input.pageIndex}`), alerts });
      for (const row of alerts) usedAlertIds.add(row.id);
      return true;
    }
    if (slot === 'page_recommendations' && pages.length > 0) {
      items.push({
        kind: 'page_recommendations',
        key: feedItemKey('page_recommendations', `p${input.pageIndex}`),
        pages,
      });
      return true;
    }
    if (slot === 'adoptions' && adoptions.length > 0) {
      items.push({ kind: 'adoptions', key: feedItemKey('adoptions', `p${input.pageIndex}`), pets: adoptions });
      return true;
    }
    if (slot === 'reels' && reels.length > 0) {
      items.push({ kind: 'reels', key: feedItemKey('reels', `p${input.pageIndex}`), reels });
      return true;
    }
    return false;
  };

  const gap = policy.postsBetweenModules ?? 2;

  if (input.pageIndex === 0) {
    const localityPost = takePost('locality');
    if (localityPost) pushPost(localityPost, 'locality');
    const trendingPost = takePost('trending');
    if (trendingPost) pushPost(trendingPost, 'trending');

    let postsSinceModule = items.filter((item) => item.kind === 'post').length;
    for (const kind of COMPOSER_MODULE_KINDS) {
      const available =
        (kind === 'story_channels' && storiesForYouItems(stories).length > 0) ||
        (kind === 'alerts' && alerts.length > 0) ||
        (kind === 'page_recommendations' && pages.length > 0) ||
        (kind === 'adoptions' && adoptions.length > 0) ||
        (kind === 'reels' && reels.length > 0);
      if (!available) continue;
      while (postsSinceModule < gap) {
        const post = takePost('any');
        if (!post) break;
        pushPost(post, bucketFor(post.id, 'any'));
        postsSinceModule += 1;
      }
      if (pushAvailableModule(kind)) postsSinceModule = 0;
    }
  }

  while (true) {
    const post = takePost('any');
    if (!post) break;
    pushPost(post, bucketFor(post.id, 'any'));
  }

  if (policy.ads.enabled) {
    const organic = items.filter((item) => item.kind !== 'ad_slot').length;
    if (organic >= policy.ads.afterOrganicItems) {
      items.push({ kind: 'ad_slot', key: feedItemKey('ad_slot', `p${input.pageIndex}`) });
    }
  }

  const chronological = posts.filter((post) => used.has(post.id));
  return {
    items,
    usedPostIds: [...used],
    usedAlertIds: [...usedAlertIds],
    nextCursor: chronological.length ? chronological[chronological.length - 1].createdAt : undefined,
  };
}

export function nextCursorFromPosts(posts: Array<{ createdAt: number }>): number | undefined {
  if (!posts.length) return undefined;
  return posts[posts.length - 1].createdAt;
}

export function appendFeedItems(existing: FeedItem[], incoming: FeedItem[]): FeedItem[] {
  const seen = new Set(existing.map((item) => item.key));
  const next = existing.slice();
  for (const item of incoming) {
    if (seen.has(item.key)) continue;
    if (item.kind === 'post' && seen.has(feedItemKey('post', item.post.id))) continue;
    seen.add(item.key);
    next.push(item);
  }
  return next;
}

export function extractFeedPosts(items: FeedItem[]): Post[] {
  return items.filter((item): item is Extract<FeedItem, { kind: 'post' }> => item.kind === 'post').map((item) => item.post);
}

export function hasVisibleAdSlot(items: FeedItem[]): boolean {
  return items.some((item) => item.kind === 'ad_slot');
}

export function feedItemTypes(items: FeedItem[]): Array<FeedItem['kind']> {
  return items.map((item) => item.kind);
}

export function isComposerModule(item: FeedItem): boolean {
  return (COMPOSER_MODULE_KINDS as readonly string[]).includes(item.kind);
}

export function composerModulesAreAdjacent(items: FeedItem[]): boolean {
  for (let i = 0; i < items.length - 1; i++) {
    if (isComposerModule(items[i]) && isComposerModule(items[i + 1])) return true;
  }
  return false;
}

export function postsBetweenComposerModules(items: FeedItem[]): number[] {
  const gaps: number[] = [];
  let count = 0;
  let seenModule = false;
  for (const item of items) {
    if (isComposerModule(item)) {
      if (seenModule) gaps.push(count);
      seenModule = true;
      count = 0;
    } else if (item.kind === 'post' && seenModule) {
      count += 1;
    }
  }
  return gaps;
}

export function adoptionsAndReelsAreConsecutive(items: FeedItem[]): boolean {
  for (let i = 0; i < items.length - 1; i++) {
    if (items[i].kind === 'adoptions' && items[i + 1].kind === 'reels') return true;
  }
  return false;
}

export function postIdsBetweenAdoptionsAndReels(items: FeedItem[]): string[] {
  const start = items.findIndex((item) => item.kind === 'adoptions');
  const end = items.findIndex((item) => item.kind === 'reels');
  if (start < 0 || end < 0 || end <= start) return [];
  return items
    .slice(start + 1, end)
    .filter((item): item is Extract<FeedItem, { kind: 'post' }> => item.kind === 'post')
    .map((item) => item.post.id);
}

export function keysAreStable(items: FeedItem[]): boolean {
  const keys = items.map((item) => item.key);
  return keys.every((key) => typeof key === 'string' && key.length > 0 && !/random|Date\.now/i.test(key));
}

