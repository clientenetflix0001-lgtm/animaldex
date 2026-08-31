import { isCommonUserPet } from './petBirthday.ts';

export type PetOwnershipPet = {
  id?: string;
  profileId?: string | null;
  careStatus?: string | null;
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

/** Misma semántica que cumpleaños: NULL o profile.type === 'personal'. No usa care_status. */
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
