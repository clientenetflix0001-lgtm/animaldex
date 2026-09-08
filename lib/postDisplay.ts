// Helper: obtiene los datos de presentación de un post,
// ya sea real (base de datos) o demo (generado).
import { getPet, getOwner, petAvatar, SPECIES_LABEL, PETS, type Post, type Species } from './data.ts';
import { userFallbackAvatar } from './images.ts';
import { petPhotoUri } from './petAvatar.ts';
import { speciesLabel } from './petFields.ts';

export interface PostDisplay {
  petName: string;
  petEmoji: string;
  avatarUri: string | null;
  username: string;
  petUsername?: string;
  speciesLabel: string;
  ownerSubtitle: string;
  isRealPet: boolean;
}

export type PostHeaderKind = 'page' | 'personal' | 'pet';

export type PostHeaderOpen =
  | { mode: 'page'; username: string }
  | { mode: 'pet'; petId: string }
  | { mode: 'human'; username: string; userId?: string };

export type PostHeader = {
  kind: PostHeaderKind;
  title: string;
  subtitle: string | null;
  avatarUri: string | null;
  open: PostHeaderOpen;
  orgType: boolean;
  hasPet: boolean;
  asProfile: boolean;
  display: PostDisplay;
};

export function isDemoPetId(petId: string): boolean {
  return PETS.some((p) => p.id === petId);
}

export function isPageAuthorType(type?: string | null): boolean {
  return type === 'business' || type === 'protector';
}

export function postHasPetIdentity(post: Pick<Post, 'petId' | 'petName'>): boolean {
  return !!(post.petId && post.petName);
}

/** Sustantivo para “X de (dueño)”. “otro” se muestra como mascota. */
export function postSpeciesOwnerNoun(species?: string | null): string {
  const key = String(species || '').trim().toLowerCase();
  if (!key || key === 'otro') return 'mascota';
  const labeled = SPECIES_LABEL[key as Species] || speciesLabel(key);
  const noun = String(labeled || key).trim();
  return noun ? noun.toLowerCase() : 'mascota';
}

export function postOwnerSubtitle(species: string | null | undefined, ownerUsername: string): string {
  return `${postSpeciesOwnerNoun(species)} de (${ownerUsername})`;
}

export function getPostDisplay(post: Post): PostDisplay {
  if (post.real) {
    const username = post.username ?? 'usuario';
    return {
      petName: post.petName ?? 'Mascota',
      petEmoji: post.petEmoji ?? '🐾',
      avatarUri: petPhotoUri(post.petAvatarUrl),
      username,
      petUsername: post.petUsername,
      speciesLabel:
        SPECIES_LABEL[(post.petSpecies as Species) ?? 'perro'] ??
        (post.petSpecies ? post.petSpecies.charAt(0).toUpperCase() + post.petSpecies.slice(1) : 'Mascota'),
      ownerSubtitle: postOwnerSubtitle(post.petSpecies, username),
      isRealPet: true,
    };
  }
  const pet = getPet(post.petId);
  const owner = getOwner(pet);
  return {
    petName: pet.name,
    petEmoji: pet.emoji,
    avatarUri: petPhotoUri(petAvatar(pet)),
    username: owner.username,
    petUsername: pet.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_.]/g, ''),
    speciesLabel: SPECIES_LABEL[pet.species],
    ownerSubtitle: postOwnerSubtitle(pet.species, owner.username),
    isRealPet: false,
  };
}

export function resolvePostHeader(post: Post): PostHeader {
  const display = getPostDisplay(post);
  const orgType = isPageAuthorType(post.authorProfileType);
  const hasPet = postHasPetIdentity(post);
  const asProfile = orgType || (!hasPet && !!post.authorProfileId);
  const profileHandle = post.authorProfileUsername || display.username;
  const profileAvatar = post.authorProfileAvatar || userFallbackAvatar(profileHandle || 'usuario');

  if (orgType) {
    return {
      kind: 'page',
      title: profileHandle,
      subtitle: null,
      avatarUri: profileAvatar,
      open: { mode: 'page', username: profileHandle },
      orgType,
      hasPet,
      asProfile,
      display,
    };
  }

  if (asProfile) {
    return {
      kind: 'personal',
      title: profileHandle,
      subtitle: null,
      avatarUri: profileAvatar,
      open: { mode: 'human', username: profileHandle, userId: post.authorUserId },
      orgType,
      hasPet,
      asProfile,
      display,
    };
  }

  return {
    kind: 'pet',
    title: `${display.petUsername || display.petName.toLowerCase()}${display.petEmoji}`,
    subtitle: display.ownerSubtitle,
    avatarUri: display.avatarUri,
    open: { mode: 'pet', petId: display.petUsername || post.petId },
    orgType,
    hasPet,
    asProfile,
    display,
  };
}
