import { authorLooksNearby } from './feedGeo';

export const TRENDING_POLICY = {
  likeWeight: 1,
  commentWeight: 2,
  halfLifeHours: 18,
  maxAgeHours: 7 * 24,
  minScore: 0.35,
};

export type RankablePost = {
  id: string;
  createdAt: number;
  likeCount?: number;
  commentCount?: number;
  likes?: number;
  authorUserId?: string | null;
  userId?: string | null;
  petId?: string | null;
  authorProfileId?: string | null;
  authorLocality?: string | null;
  authorLocationText?: string | null;
};

export function engagementScore(post: RankablePost): number {
  const likes = Number(post.likeCount ?? post.likes ?? 0);
  const comments = Number(post.commentCount ?? 0);
  return likes * TRENDING_POLICY.likeWeight + comments * TRENDING_POLICY.commentWeight;
}

export function recencyScore(createdAt: number, now: number): number {
  const ageHours = Math.max(0, (now - createdAt) / 3_600_000);
  return 1 / (1 + ageHours / 12);
}

export function trendingScore(post: RankablePost, now: number): number {
  const ageHours = Math.max(0, (now - post.createdAt) / 3_600_000);
  if (ageHours > TRENDING_POLICY.maxAgeHours) return 0;
  const engagement = engagementScore(post);
  if (engagement <= 0) return 0;
  const decay = Math.pow(ageHours + 2, 1.5);
  return engagement / decay;
}

export function nearbyScore(post: RankablePost, viewerLocality: string | null | undefined): number {
  return authorLooksNearby(post.authorLocality, post.authorLocationText, viewerLocality) ? 1 : 0;
}

export function relationshipScore(
  post: RankablePost,
  followed: { users?: string[]; pets?: string[]; profiles?: string[] }
): number {
  const userId = post.authorUserId || post.userId;
  if (userId && followed.users?.includes(userId)) return 1;
  if (post.petId && followed.pets?.includes(post.petId)) return 1;
  if (post.authorProfileId && followed.profiles?.includes(post.authorProfileId)) return 1;
  return 0;
}

export function pickTrendingPostIds(posts: RankablePost[], now: number, limit = 4): string[] {
  return posts
    .map((post) => ({ id: post.id, score: trendingScore(post, now) }))
    .filter((row) => row.score >= TRENDING_POLICY.minScore)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((row) => row.id);
}

export function pickNearbyPostIds(posts: RankablePost[], viewerLocality: string | null | undefined, limit = 6): string[] {
  if (!viewerLocality) return [];
  return posts.filter((post) => nearbyScore(post, viewerLocality) > 0).slice(0, limit).map((post) => post.id);
}
