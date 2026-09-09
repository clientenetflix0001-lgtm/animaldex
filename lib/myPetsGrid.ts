import { ageLabelFromBirthDate } from './birthDate.ts';
import { petFallbackAvatar } from './images.ts';

export type MyPetsGridPet = {
  id: string;
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  birthDate?: string | null;
  age?: string | null;
};

export type MyPetsGridItem =
  | { kind: 'add'; key: 'add' }
  | {
      kind: 'pet';
      key: string;
      petId: string;
      handle: string;
      ageLabel: string;
      avatarUri: string;
    };

export function petCardAgeLabel(
  birthDate: string | null | undefined,
  storedAge?: string | null,
  now: Date = new Date()
): string {
  const fromBirth = ageLabelFromBirthDate(birthDate, now);
  if (fromBirth) return fromBirth;
  const fallback = String(storedAge || '').trim();
  return fallback;
}

export function petCardHandle(pet: MyPetsGridPet): string {
  const username = String(pet.username || '').trim();
  if (username) return `@${username.replace(/^@/, '')}`;
  const name = String(pet.name || '').trim();
  return name || 'Mascota';
}

export function petProfileNavId(pet: MyPetsGridPet): string {
  return String(pet.username || pet.id || '').trim();
}

export function buildMyPetsGrid(pets: MyPetsGridPet[], now: Date = new Date()): MyPetsGridItem[] {
  const tiles: MyPetsGridItem[] = [{ kind: 'add', key: 'add' }];
  for (const pet of pets || []) {
    if (!pet?.id) continue;
    tiles.push({
      kind: 'pet',
      key: pet.id,
      petId: petProfileNavId(pet),
      handle: petCardHandle(pet),
      ageLabel: petCardAgeLabel(pet.birthDate, pet.age, now),
      avatarUri: pet.avatarUrl || petFallbackAvatar(pet.id),
    });
  }
  return tiles;
}

export const ADD_PET_ROUTE = 'AddPet';
export const ADOPT_ROUTE = 'AdoptionDiscovery';
export const PET_PROFILE_ROUTE = 'PetProfile';
