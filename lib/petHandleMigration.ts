import {
  firstFreePetUsername,
  isValidPetUsername,
  normalizePetUsernameBase,
  suggestPetUsernameBase,
} from './petHandles.ts';

export type PetHandleRow = {
  id: string;
  username?: string | null;
};

export type PetHandleMigrationPlan = {
  petId: string;
  oldUsername: string;
  newUsername: string;
  alias: string | null;
  changed: boolean;
};

/**
 * Plan determinista e idempotente:
 * - `nina.pet` ya válido no recibe `.pet.pet`
 * - `nina` → `nina.pet` si está libre
 * - colisión → `nina2.pet`, `nina3.pet`, …
 * - no toca `pet.id`
 * - orden estable por `pet.id`
 *
 * NO ejecuta D1. Solo calcula el mapping.
 */
export function planPetHandleMigration(pets: readonly PetHandleRow[]): PetHandleMigrationPlan[] {
  const sorted = [...pets].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const taken = new Set<string>();

  for (const pet of sorted) {
    const current = String(pet.username || '').trim().toLowerCase();
    if (isValidPetUsername(current)) taken.add(current);
  }

  const plans: PetHandleMigrationPlan[] = [];
  for (const pet of sorted) {
    const oldUsername = String(pet.username || '').trim().toLowerCase();
    if (isValidPetUsername(oldUsername)) {
      plans.push({
        petId: pet.id,
        oldUsername,
        newUsername: oldUsername,
        alias: null,
        changed: false,
      });
      continue;
    }

    const base = oldUsername
      ? suggestPetUsernameBase(normalizePetUsernameBase(oldUsername) || oldUsername)
      : suggestPetUsernameBase(pet.id.replace(/^pet-/, 'pet'));
    const newUsername = firstFreePetUsername(base, taken);
    if (!newUsername) {
      throw new Error(`No hay username .pet libre para ${pet.id}`);
    }
    taken.add(newUsername);
    const alias = oldUsername && oldUsername !== newUsername ? oldUsername : null;
    plans.push({
      petId: pet.id,
      oldUsername,
      newUsername,
      alias,
      changed: true,
    });
  }
  return plans;
}

/** Segunda pasada sobre el resultado: no debe cambiar nada. */
export function isPetHandleMigrationIdempotent(pets: readonly PetHandleRow[]): boolean {
  const first = planPetHandleMigration(pets);
  const second = planPetHandleMigration(
    first.map((row) => ({ id: row.petId, username: row.newUsername }))
  );
  return second.every((row) => !row.changed && isValidPetUsername(row.newUsername));
}

export const PET_HANDLE_MIGRATION_SELECT =
  'SELECT id, username FROM pets ORDER BY id ASC';

export const PET_HANDLE_ROLLBACK_NOTE =
  'Rollback: UPDATE pets SET username = old_username desde pet_username_aliases; no se toca pet.id.';
