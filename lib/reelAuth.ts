/**
 * Autorización de publicación de Reels (misma regla que createPost).
 * El cliente puede enviar profileId/petId; el Worker no debe confiar en eso.
 * Like/comment de Reels usan el user_id de la cuenta autenticada,
 * igual que likes/comentarios del feed normal — no el perfil org activo.
 */

export function authorizeOwnedProfileId(
  requestedId: string | null | undefined,
  ownedIds: string[],
  personalId: string | null
): { ok: true; profileId: string | null } | { ok: false; status: 403; error: string } {
  const id = requestedId ? String(requestedId).trim() : '';
  if (!id) return { ok: true, profileId: personalId };
  if (ownedIds.includes(id)) return { ok: true, profileId: id };
  return { ok: false, status: 403, error: 'Ese perfil no es tuyo' };
}

export function authorizeOwnedPetId(
  petId: string | null | undefined,
  ownedPetIds: string[]
): { ok: true; petId: string | null } | { ok: false; status: 403; error: string } {
  const id = petId ? String(petId).trim() : '';
  if (!id) return { ok: true, petId: null };
  if (ownedPetIds.includes(id)) return { ok: true, petId: id };
  return { ok: false, status: 403, error: 'Esa mascota no es tuya' };
}

/** Identidad pública de like/comment: cuenta, no perfil empresa/protector activo. */
export function reelSocialActorIsAccountUser(): boolean {
  return true;
}
