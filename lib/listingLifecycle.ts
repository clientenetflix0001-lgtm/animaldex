export const LISTING_RENEW_MS = 7 * 24 * 60 * 60 * 1000;
export const LISTING_RENEW_DAY_MS = 24 * 60 * 60 * 1000;
export const LISTING_RENEW_TOO_SOON = 'Todavía no pasaron 7 días desde la última renovación.';
export const LISTING_SOLD_NOT_RENEWABLE = 'Esta publicación ya está marcada como vendida.';
export const LISTING_RENEW_OWNER_ERROR = 'Esa publicación no es tuya';

export type ListingLifecycleStatus = 'active' | 'sold' | 'removed' | string;

export function isListingSold(status?: string | null): boolean {
  return String(status || '').toLowerCase() === 'sold';
}

export function isListingPublic(status?: string | null): boolean {
  return String(status || '').toLowerCase() === 'active';
}

export function listingStatusLabel(status?: string | null): string {
  const value = String(status || '').toLowerCase();
  if (value === 'sold') return 'Vendido';
  if (value === 'removed') return 'Eliminado';
  return 'Activo';
}

export function listingBumpedAt(listing: {
  createdAt?: number | null;
  created_at?: number | null;
  renewedAt?: number | null;
  renewed_at?: number | null;
}): number {
  return Number(listing.renewedAt || listing.renewed_at || listing.createdAt || listing.created_at || 0);
}

export function canRenewListing(
  listing: {
    status?: string | null;
    createdAt?: number | null;
    renewedAt?: number | null;
  },
  now: number = Date.now()
): boolean {
  if (isListingSold(listing.status) || String(listing.status || '') === 'removed') return false;
  const bump = listingBumpedAt(listing);
  if (!bump) return false;
  return now - bump >= LISTING_RENEW_MS;
}

export function listingRenewalDueAt(listing: {
  createdAt?: number | null;
  renewedAt?: number | null;
}): number {
  return listingBumpedAt(listing) + LISTING_RENEW_MS;
}

export function listingRenewalUi(
  listing: {
    status?: string | null;
    createdAt?: number | null;
    renewedAt?: number | null;
  },
  now: number = Date.now()
): { canRenew: boolean; label: string } {
  if (isListingSold(listing.status)) return { canRenew: false, label: 'Vendido' };
  if (canRenewListing(listing, now)) return { canRenew: true, label: 'Renovar publicación' };
  const due = listingRenewalDueAt(listing);
  const days = Math.max(1, Math.ceil((due - now) / LISTING_RENEW_DAY_MS));
  return { canRenew: false, label: `Podrás renovar en ${days} día${days === 1 ? '' : 's'}` };
}

export function listingRenewRejectReason(
  listing: {
    status?: string | null;
    createdAt?: number | null;
    renewedAt?: number | null;
  },
  now: number = Date.now()
): string | null {
  if (isListingSold(listing.status)) return LISTING_SOLD_NOT_RENEWABLE;
  if (String(listing.status || '') === 'removed') return LISTING_SOLD_NOT_RENEWABLE;
  if (!canRenewListing(listing, now)) return LISTING_RENEW_TOO_SOON;
  return null;
}
