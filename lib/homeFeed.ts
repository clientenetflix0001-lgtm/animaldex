import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, type ApiAlert, type ApiPost, type ApiReel, type ApiStoryRailItem } from './db';
import { petFeedId, type AdoptionCard, adoptionCardFromProtectorPet } from './adoptionDiscovery';
import { apiPostToPost } from './store';
import type { Post } from './data';
import {
  FEED_COMPOSITION_POLICY,
  appendFeedItems,
  composeFeedPage,
  pageRecommendationTypeLabel,
  type FeedItem,
  type HomePageRecommendation,
} from './feedComposition';
import { pickNearbyPostIds, pickTrendingPostIds } from './feedRanking';
import { readCachedLastLocation } from './lastLocationSync';

export const HOME_FEED_CACHE_KEY = 'animaldex-home-feed-cache-v1';

export type HomeFeedBuckets = {
  posts: ApiPost[];
  nearbyPostIds: string[];
  trendingPostIds: string[];
  storyRail: ApiStoryRailItem[];
  alerts: ApiAlert[];
  pageRecommendations: HomePageRecommendation[];
  adoptions: AdoptionCard[];
  reels: ApiReel[];
  nextCursor?: number;
  hasMore?: boolean;
};

export type HomeFeedPage = {
  items: FeedItem[];
  usedPostIds: string[];
  nextCursor?: number;
  hasMore: boolean;
  source: 'homeFeed' | 'fallback';
};

function mapAdoptions(raw: unknown): AdoptionCard[] {
  if (!Array.isArray(raw)) return [];
  const out: AdoptionCard[] = [];
  for (const row of raw) {
    if (row && typeof row === 'object' && 'petId' in row && 'shelterProfileId' in row) {
      out.push(row as AdoptionCard);
      continue;
    }
    const card = adoptionCardFromProtectorPet(row as Parameters<typeof adoptionCardFromProtectorPet>[0]);
    if (card) out.push(card);
  }
  return out;
}

function mapPages(raw: unknown): HomePageRecommendation[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const r = row as HomePageRecommendation;
      if (!r?.id || (r.type !== 'protector' && r.type !== 'business')) return null;
      return {
        id: r.id,
        name: r.name,
        username: r.username,
        avatarUrl: r.avatarUrl || null,
        type: r.type,
        typeLabel: r.typeLabel || pageRecommendationTypeLabel(r.type),
        locality: r.locality || null,
      };
    })
    .filter((row): row is HomePageRecommendation => !!row);
}

export function bucketsFromHomeFeedResponse(json: any): HomeFeedBuckets {
  return {
    posts: Array.isArray(json?.posts) ? json.posts : [],
    nearbyPostIds: Array.isArray(json?.nearbyPostIds) ? json.nearbyPostIds : [],
    trendingPostIds: Array.isArray(json?.trendingPostIds) ? json.trendingPostIds : [],
    storyRail: Array.isArray(json?.storyRail) ? json.storyRail : [],
    alerts: Array.isArray(json?.alerts) ? json.alerts : [],
    pageRecommendations: mapPages(json?.pageRecommendations),
    adoptions: mapAdoptions(json?.adoptions),
    reels: Array.isArray(json?.reels) ? json.reels : [],
    nextCursor: json?.nextCursor,
    hasMore: json?.hasMore,
  };
}

async function fallbackBuckets(input: {
  before?: number;
  limit: number;
  locality?: string | null;
  firstPage: boolean;
}): Promise<HomeFeedBuckets> {
  const locality = input.locality || undefined;
  const tasks: Promise<void>[] = [];
  let posts: ApiPost[] = [];
  let storyRail: ApiStoryRailItem[] = [];
  let alerts: ApiAlert[] = [];
  let adoptions: AdoptionCard[] = [];
  let reels: ApiReel[] = [];

  tasks.push(
    db.feed(input.before, input.limit).then((res) => {
      posts = res.posts || [];
    }).catch(() => {})
  );

  if (input.firstPage) {
    tasks.push(
      db.storyRail().then((res) => {
        storyRail = res.items || [];
      }).catch(() => {})
    );
    if (locality) {
      tasks.push(
        db.alertsFeed(locality, undefined, FEED_COMPOSITION_POLICY.maxAlerts).then((res) => {
          alerts = (res.alerts || []).filter((a) => a.status !== 'resolved');
        }).catch(() => {})
      );
    }
    tasks.push(
      db.adoptionFeed({ locality, limit: FEED_COMPOSITION_POLICY.maxAdoptions }).then((res) => {
        adoptions = mapAdoptions(res.items);
      }).catch(() => {})
    );
    tasks.push(
      db.reelsFeed(undefined, FEED_COMPOSITION_POLICY.maxReels).then((res) => {
        reels = res.reels || [];
      }).catch(() => {})
    );
  }

  await Promise.all(tasks);
  const now = Date.now();
  return {
    posts,
    nearbyPostIds: pickNearbyPostIds(posts, locality),
    trendingPostIds: pickTrendingPostIds(posts, now),
    storyRail,
    alerts,
    pageRecommendations: [],
    adoptions,
    reels,
    nextCursor: posts.length ? posts[posts.length - 1].createdAt : undefined,
    hasMore: posts.length >= input.limit,
  };
}

export async function fetchHomeFeedBuckets(input: {
  before?: number;
  limit?: number;
  locality?: string | null;
  firstPage: boolean;
}): Promise<{ buckets: HomeFeedBuckets; source: HomeFeedPage['source'] }> {
  const limit = input.limit ?? (input.firstPage
    ? FEED_COMPOSITION_POLICY.firstPagePostLimit
    : FEED_COMPOSITION_POLICY.laterPagePostLimit);
  try {
    const json = await db.homeFeed({
      before: input.before,
      limit,
      includeModules: input.firstPage,
    });
    return { buckets: bucketsFromHomeFeedResponse(json), source: 'homeFeed' };
  } catch {
    const cached = await readCachedLastLocation();
    const locality = input.locality || cached?.locality || null;
    return {
      buckets: await fallbackBuckets({ before: input.before, limit, locality, firstPage: input.firstPage }),
      source: 'fallback',
    };
  }
}

export function composeHomeFeedPage(
  buckets: HomeFeedBuckets,
  pageIndex: number,
  usedPostIds?: Iterable<string>
): HomeFeedPage {
  const posts: Post[] = (buckets.posts || []).map(apiPostToPost);
  const composed = composeFeedPage({
    pageIndex,
    posts,
    nearbyPostIds: buckets.nearbyPostIds,
    trendingPostIds: buckets.trendingPostIds,
    storyItems: buckets.storyRail,
    alerts: buckets.alerts,
    pages: buckets.pageRecommendations,
    adoptions: buckets.adoptions,
    reels: buckets.reels,
    usedPostIds,
  });
  return {
    items: composed.items,
    usedPostIds: composed.usedPostIds,
    nextCursor: buckets.nextCursor ?? composed.nextCursor,
    hasMore: buckets.hasMore ?? (buckets.posts.length >= FEED_COMPOSITION_POLICY.laterPagePostLimit),
    source: 'homeFeed',
  };
}

export function mergeHomeFeedPages(existing: FeedItem[], incoming: FeedItem[]): FeedItem[] {
  return appendFeedItems(existing, incoming);
}

export async function readCachedHomeFeed(): Promise<FeedItem[] | null> {
  try {
    const raw = await AsyncStorage.getItem(HOME_FEED_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.items) ? parsed.items : null;
  } catch {
    return null;
  }
}

export async function writeCachedHomeFeed(items: FeedItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(HOME_FEED_CACHE_KEY, JSON.stringify({ items, savedAt: Date.now() }));
  } catch {}
}

export { petFeedId };
