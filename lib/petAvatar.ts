/** UI-only pet photo detection. Never persist a paw/placeholder URL. */

const LEGACY_PET_PLACEHOLDER = /api\.dicebear\.com\/[^/]+\/shapes/i;

export function isLegacyPetPlaceholder(uri?: string | null): boolean {
  return LEGACY_PET_PLACEHOLDER.test(String(uri || '').trim());
}

export function hasPetPhoto(uri?: string | null): boolean {
  const value = String(uri || '').trim();
  if (!value) return false;
  if (isLegacyPetPlaceholder(value)) return false;
  return true;
}

export function petPhotoUri(uri?: string | null): string | null {
  const value = String(uri || '').trim();
  if (!hasPetPhoto(value)) return null;
  return value;
}
