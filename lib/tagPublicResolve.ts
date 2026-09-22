// ============================================================
// Animaldex — Resolución pública de chapita QR.
// ============================================================
// Un visitante sin sesión puede VER una mascota ya vinculada.
// Claim / registro sigue exigiendo login.
// ============================================================

export type TagStatusLike = {
  exists?: boolean;
  status?: 'unclaimed' | 'claimed' | string;
  pet?: { id?: string | null } | null;
};

export type PublicTagTarget =
  | { kind: 'pet'; petId: string }
  | { kind: 'claim'; code: string }
  | { kind: 'unavailable'; code: string };

export const TAG_UNAVAILABLE_TITLE = 'Esta chapita no está disponible';

/** Decide destino a partir de `tagStatus`. No toca Worker ni D1. */
export function publicTagTargetFromStatus(
  code: string,
  res: TagStatusLike | null | undefined
): PublicTagTarget {
  const normalized = String(code || '').trim();
  if (!normalized) return { kind: 'unavailable', code: '' };
  if (!res || res.exists === false) return { kind: 'unavailable', code: normalized };
  const petId = res.pet?.id != null ? String(res.pet.id).trim() : '';
  if (res.status === 'claimed' && petId) return { kind: 'pet', petId };
  if (res.exists) return { kind: 'claim', code: normalized };
  return { kind: 'unavailable', code: normalized };
}

export function guestTagWelcomeHome(hasUser: boolean): 'Tabs' | 'Auth' {
  return hasUser ? 'Tabs' : 'Auth';
}
