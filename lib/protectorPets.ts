// Contadores y pestañas del perfil proteccionista.
//
// Mascotas = toda mascota que SIGUE asociada al refugio (pets.profile_id).
// En adopción / En recuperación son estados operativos; no cierran la adopción.
// Adoptados es un contador HISTÓRICO: solo crece cuando se transfiere el
// mismo petId a otro usuario (tabla pet_transfers). No se implementa aquí.

export type ShelterCareStatus = 'en_adopcion' | 'en_recuperacion' | 'adoptado' | null | undefined;
export type ShelterPetTab = 'en_adopcion' | 'en_recuperacion' | 'adoptado' | 'posts';

export function isRecoveryStatus(careStatus: ShelterCareStatus): boolean {
  return careStatus === 'en_recuperacion';
}

/** Mascotas actuales del refugio que se listan en "En adopción". */
export function belongsToAdoptionTab(careStatus: ShelterCareStatus): boolean {
  return !isRecoveryStatus(careStatus);
}

export function filterShelterPets<T extends { careStatus?: ShelterCareStatus }>(
  pets: T[],
  tab: ShelterPetTab
): T[] {
  if (tab === 'en_recuperacion') return pets.filter((p) => isRecoveryStatus(p.careStatus));
  if (tab === 'en_adopcion') return pets.filter((p) => belongsToAdoptionTab(p.careStatus));
  return [];
}
