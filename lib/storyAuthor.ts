import { openHumanProfile } from './publicHandles.ts';

export type StoryAuthorKind = 'personal' | 'profile' | 'pet';

export type StoryAuthorIdentity = {
  kind: StoryAuthorKind;
  id: string | null;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  userId: string | null;
  profileId: string | null;
  petId: string | null;
  profileType: string | null;
};

export type StoryAuthorOpenTarget =
  | { mode: 'pet'; petId: string }
  | { mode: 'human'; username?: string | null; userId?: string | null };

export type StoryAuthorSource = {
  authorUserId?: string | null;
  authorProfileId?: string | null;
  authorProfileType?: string | null;
  authorPetId?: string | null;
  username?: string | null;
  userName?: string | null;
  userAvatar?: string | null;
  authorProfileName?: string | null;
  authorProfileUsername?: string | null;
  authorProfileAvatar?: string | null;
  authorPetName?: string | null;
  authorPetUsername?: string | null;
  authorPetAvatar?: string | null;
  protagonistPetId?: string | null;
  protagonistName?: string | null;
  protagonistAvatar?: string | null;
};

const PAGE_PROFILE_TYPES = new Set(['business', 'protector', 'company']);

export function isStoryPageProfileType(type?: string | null): boolean {
  return PAGE_PROFILE_TYPES.has(String(type || '').trim().toLowerCase());
}

export function storyVisibleHandle(value?: string | null): string {
  return String(value || '').trim().replace(/^@+/, '');
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const next = storyVisibleHandle(value);
    if (next) return next;
  }
  return '';
}

export function resolveStoryAuthorIdentity(story?: StoryAuthorSource | null): StoryAuthorIdentity {
  const source = story || {};
  const authorPetId = source.authorPetId ? String(source.authorPetId) : null;
  const authorProfileId = source.authorProfileId ? String(source.authorProfileId) : null;
  const authorUserId = source.authorUserId ? String(source.authorUserId) : null;
  const profileType = source.authorProfileType ? String(source.authorProfileType) : null;

  if (authorPetId) {
    const username = firstNonEmpty(source.authorPetUsername, source.authorPetName);
    return {
      kind: 'pet',
      id: authorPetId,
      username,
      displayName: firstNonEmpty(source.authorPetName, username),
      avatarUrl: source.authorPetAvatar || null,
      userId: authorUserId,
      profileId: authorProfileId,
      petId: authorPetId,
      profileType,
    };
  }

  if (authorProfileId && isStoryPageProfileType(profileType)) {
    const username = firstNonEmpty(source.authorProfileUsername, source.authorProfileName);
    return {
      kind: 'profile',
      id: authorProfileId,
      username,
      displayName: firstNonEmpty(source.authorProfileName, username),
      avatarUrl: source.authorProfileAvatar || null,
      userId: authorUserId,
      profileId: authorProfileId,
      petId: null,
      profileType,
    };
  }

  const username = firstNonEmpty(source.username, source.userName);
  return {
    kind: 'personal',
    id: authorUserId,
    username,
    displayName: firstNonEmpty(source.userName, username),
    avatarUrl: source.userAvatar || null,
    userId: authorUserId,
    profileId: authorProfileId,
    petId: null,
    profileType,
  };
}

export function storyAuthorVisibleName(story?: StoryAuthorSource | null, fallback = 'Historia'): string {
  return resolveStoryAuthorIdentity(story).username || fallback;
}

export function storyAuthorOpenTarget(story?: StoryAuthorSource | null): StoryAuthorOpenTarget | null {
  const author = resolveStoryAuthorIdentity(story);
  if (author.kind === 'pet' && author.petId) {
    return { mode: 'pet', petId: author.petId };
  }
  if (author.username || author.userId) {
    return { mode: 'human', username: author.username || null, userId: author.userId };
  }
  return null;
}

export function storyProtagonistOpenTarget(story?: StoryAuthorSource | null): { petId: string } | null {
  const petId = story?.protagonistPetId ? String(story.protagonistPetId) : '';
  if (!petId) return null;
  return { petId };
}

export function storyAuthorPressPlan(story?: StoryAuthorSource | null): {
  pause: true;
  advance: false;
  swipe: false;
  target: StoryAuthorOpenTarget | null;
} {
  return {
    pause: true,
    advance: false,
    swipe: false,
    target: storyAuthorOpenTarget(story),
  };
}

export function openStoryAuthorProfile(
  navigation: { navigate: (name: string, params?: Record<string, unknown>) => void },
  story?: StoryAuthorSource | null,
): boolean {
  const target = storyAuthorOpenTarget(story);
  if (!target) return false;
  if (target.mode === 'pet') {
    navigation.navigate('PetProfile', { petId: target.petId });
    return true;
  }
  openHumanProfile(navigation, { username: target.username, userId: target.userId });
  return true;
}

export function openStoryProtagonistProfile(
  navigation: { navigate: (name: string, params?: Record<string, unknown>) => void },
  story?: StoryAuthorSource | null,
): boolean {
  const target = storyProtagonistOpenTarget(story);
  if (!target) return false;
  navigation.navigate('PetProfile', { petId: target.petId });
  return true;
}
