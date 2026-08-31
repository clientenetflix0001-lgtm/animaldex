import { isCommonUserPet } from './petBirthday.ts';

export type PetOwnershipPet = {
  id?: string;
  profileId?: string | null;
};

export type ProfileTypeHint = {
  id: string;
  type?: string | null;
};

export type PublishingIdentity = {
  profileId?: string | null;
  type?: string | null;
};

function trimId(value: string | null | undefined): string | null {
  const s = String(value || '').trim();
  return s || null;
}

export function profileTypeForPet(
  pet: PetOwnershipPet,
  profiles?: readonly ProfileTypeHint[] | null
): string | null | undefined {
  const profileId = trimId(pet.profileId);
  if (!profileId) return null;
  const found = (profiles || []).find((p) => p.id === profileId);
  return found?.type;
}

/** Misma semántica que cumpleaños: NULL o profile.type === 'personal'. El estado no participa. */
export function isPersonalPet(
  pet: PetOwnershipPet,
  profiles?: readonly ProfileTypeHint[] | null
): boolean {
  return isCommonUserPet({
    profileId: pet.profileId,
    profileType: profileTypeForPet(pet, profiles),
  });
}

export function petBelongsToProfile(
  pet: PetOwnershipPet,
  profileId: string | null | undefined
): boolean {
  const wanted = trimId(profileId);
  const owned = trimId(pet.profileId);
  return !!wanted && !!owned && wanted === owned;
}

export function filterPersonalPets<T extends PetOwnershipPet>(
  pets: readonly T[] | null | undefined,
  profiles?: readonly ProfileTypeHint[] | null
): T[] {
  return (pets || []).filter((pet) => isPersonalPet(pet, profiles));
}

export function petsForPublishingIdentity<T extends PetOwnershipPet>(
  pets: readonly T[] | null | undefined,
  identity: PublishingIdentity | null | undefined,
  profiles?: readonly ProfileTypeHint[] | null
): T[] {
  const type = identity?.type || 'personal';
  const profileId = trimId(identity?.profileId);
  if (type === 'personal' || !profileId) {
    return filterPersonalPets(pets, profiles);
  }
  return (pets || []).filter((pet) => petBelongsToProfile(pet, profileId));
}

export function canAddPetForPublishingIdentity(identity: PublishingIdentity | null | undefined): boolean {
  const type = identity?.type || 'personal';
  return type === 'personal' || type === 'protector';
}

export function reconcileSelectedPetId<T extends { id?: string }>(
  selectedId: string | null | undefined,
  available: readonly T[] | null | undefined
): string | null {
  const id = trimId(selectedId);
  if (!id) return null;
  return (available || []).some((pet) => pet.id === id) ? id : null;
}

export const POST_PET_NOT_OWNED_ERROR = 'Esa mascota no es tuya';
export const POST_PET_IDENTITY_ERROR =
  'La mascota seleccionada no pertenece al perfil o página desde la que estás publicando.';

export type PostPetAuthPet = {
  userId?: string | null;
  profileId?: string | null;
};

export type PostPetAuthProfile = {
  id?: string | null;
  type?: string | null;
  accountId?: string | null;
};

export type PostPetAuthResult =
  | { ok: true }
  | { ok: false; code: 'pet_not_owned' | 'identity_mismatch' };

function isManagedPageAuthor(type: string | null | undefined): boolean {
  return type === 'protector' || type === 'business';
}

/**
 * Autorización createPost: cuenta + identidad autora + mascota.
 * Sin mascota → permitido. El estado de la mascota no participa.
 */
export function petAllowedForAuthorIdentity(input: {
  accountId: string;
  pet?: PostPetAuthPet | null;
  author?: PostPetAuthProfile | null;
  petProfile?: PostPetAuthProfile | null;
}): PostPetAuthResult {
  const accountId = trimId(input.accountId);
  if (!accountId) return { ok: false, code: 'pet_not_owned' };
  const pet = input.pet;
  if (!pet) return { ok: true };

  if (trimId(pet.userId) !== accountId) return { ok: false, code: 'pet_not_owned' };

  const author = input.author;
  if (author && trimId(author.accountId) && trimId(author.accountId) !== accountId) {
    return { ok: false, code: 'identity_mismatch' };
  }

  if (isManagedPageAuthor(author?.type)) {
    const authorId = trimId(author?.id);
    if (authorId && petBelongsToProfile(pet, authorId)) return { ok: true };
    return { ok: false, code: 'identity_mismatch' };
  }

  const petProfileId = trimId(pet.profileId);
  if (!petProfileId) return { ok: true };

  const petProfile = input.petProfile;
  if (
    petProfile &&
    trimId(petProfile.id) === petProfileId &&
    petProfile.type === 'personal' &&
    trimId(petProfile.accountId) === accountId
  ) {
    return { ok: true };
  }
  return { ok: false, code: 'identity_mismatch' };
}
