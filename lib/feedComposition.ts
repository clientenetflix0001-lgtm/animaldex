import type { ApiAlert, ApiReel, ApiStoryRailItem } from './db';
import type { AdoptionCard } from './adoptionDiscovery';
import type { Post } from './data';

export const FEED_COMPOSITION_POLICY = {
  nearbyRadiusKm: 10,
  firstPagePostLimit: 10,
  laterPagePostLimit: 10,
  maxAlerts: 3,
  maxAdoptions: 2,
  maxReels: 2,
  maxPageRecommendations: 8,
  modulesOnFirstPageOnly: true,
  ads: {
    enabled: false,
    afterOrganicItems: 8,
  },
  firstPageSequence: [
    'nearby_post',
    'trending_post',
    'story_channels',
    'post',
    'post',
    'alerts',
    'post',
    'post',
    'page_recommendations',
    'post',
    'adoptions',
    'reels',
    'remaining_posts',
  ] as const,
};

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

export type FeedPostBucket = 'nearby' | 'trending' | 'default';

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

export type ComposeFeedInput = {
  pageIndex: number;
  posts: Post[];
  nearbyPostIds?: string[];
  trendingPostIds?: string[];
  storyItems?: ApiStoryRailItem[];
  alerts?: ApiAlert[];
  pages?: HomePageRecommendation[];
  adoptions?: AdoptionCard[];
  reels?: ApiReel[];
  usedPostIds?: Iterable<string>;
  policy?: typeof FEED_COMPOSITION_POLICY;
};

export type ComposeFeedResult = {
  items: FeedItem[];
  usedPostIds: string[];
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
  const nearbyQueue = (input.nearbyPostIds || []).filter((id) => byId.has(id));
  const trendingQueue = (input.trendingPostIds || []).filter((id) => byId.has(id) && !nearbyQueue.includes(id));
  const regularQueue = posts.map((post) => post.id).filter((id) => !nearbyQueue.includes(id) && !trendingQueue.includes(id));
  const consumed: Post[] = [];
  const items: FeedItem[] = [];

  const bucketFor = (id: string, prefer: FeedPostBucket | 'any'): FeedPostBucket => {
    if (prefer === 'nearby' || (input.nearbyPostIds || []).includes(id)) return 'nearby';
    if (prefer === 'trending' || (input.trendingPostIds || []).includes(id)) return 'trending';
    return 'default';
  };

  const takePost = (prefer: FeedPostBucket | 'any'): Post | null => {
    let id: string | null = null;
    if (prefer === 'nearby') id = takeNext(nearbyQueue);
    else if (prefer === 'trending') id = takeNext(trendingQueue);
    else id = takeNext(regularQueue) || takeNext(nearbyQueue) || takeNext(trendingQueue);
    if (!id) return null;
    const post = byId.get(id);
    if (!post) return null;
    byId.delete(id);
    consumed.push(post);
    used.add(id);
    return post;
  };

  const alerts = dedupeById((input.alerts || []).filter((a) => a.status !== 'resolved' && !a.resolvedAt)).slice(0, policy.maxAlerts);
  const pages = dedupeById(input.pages || []).slice(0, policy.maxPageRecommendations);
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

  const sequence: FeedCompositionSlot[] =
    input.pageIndex === 0 ? [...policy.firstPageSequence] : ['remaining_posts'];

  for (const slot of sequence) {
    if (slot === 'nearby_post') {
      const post = takePost('nearby');
      if (post) items.push({ kind: 'post', key: feedItemKey('post', post.id), post, bucket: 'nearby' });
      continue;
    }
    if (slot === 'trending_post') {
      const post = takePost('trending');
      if (post) items.push({ kind: 'post', key: feedItemKey('post', post.id), post, bucket: 'trending' });
      continue;
    }
    if (slot === 'post') {
      const post = takePost('any');
      if (post) items.push({ kind: 'post', key: feedItemKey('post', post.id), post, bucket: bucketFor(post.id, 'any') });
      continue;
    }
    if (slot === 'remaining_posts') {
      while (true) {
        const post = takePost('any');
        if (!post) break;
        items.push({ kind: 'post', key: feedItemKey('post', post.id), post, bucket: bucketFor(post.id, 'any') });
      }
      continue;
    }
    if (input.pageIndex > 0 && policy.modulesOnFirstPageOnly) continue;
    if (slot === 'story_channels' && stories.length > 0) {
      items.push({ kind: 'story_channels', key: feedItemKey('story_channels', `p${input.pageIndex}`), items: stories });
    } else if (slot === 'alerts' && alerts.length > 0) {
      items.push({ kind: 'alerts', key: feedItemKey('alerts', `p${input.pageIndex}`), alerts });
    } else if (slot === 'page_recommendations' && pages.length > 0) {
      items.push({
        kind: 'page_recommendations',
        key: feedItemKey('page_recommendations', `p${input.pageIndex}`),
        pages,
      });
    } else if (slot === 'adoptions' && adoptions.length > 0) {
      items.push({ kind: 'adoptions', key: feedItemKey('adoptions', `p${input.pageIndex}`), pets: adoptions });
    } else if (slot === 'reels' && reels.length > 0) {
      items.push({ kind: 'reels', key: feedItemKey('reels', `p${input.pageIndex}`), reels });
    }
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

export function keysAreStable(items: FeedItem[]): boolean {
  const keys = items.map((item) => item.key);
  return keys.every((key) => typeof key === 'string' && key.length > 0 && !/random|Date\.now/i.test(key));
}

