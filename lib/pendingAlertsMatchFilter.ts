export type PendingAlertsMatchFilter = {
  type: 'found';
  breedId: string;
  locality?: string | null;
  placeId?: string | null;
};

let pending: PendingAlertsMatchFilter | null = null;

export function setPendingAlertsMatchFilter(next: PendingAlertsMatchFilter | null): void {
  pending = next;
}

export function consumePendingAlertsMatchFilter(): PendingAlertsMatchFilter | null {
  const current = pending;
  pending = null;
  return current;
}

export function peekPendingAlertsMatchFilter(): PendingAlertsMatchFilter | null {
  return pending;
}

export function alertMatchesPendingFilter(
  alert: { type?: string | null; breedId?: string | null; locality?: string | null; placeId?: string | null },
  filter: PendingAlertsMatchFilter | null
): boolean {
  if (!filter) return true;
  if (alert.type !== 'found') return false;
  if (String(alert.breedId || '') !== filter.breedId) return false;
  if (filter.placeId && alert.placeId) return alert.placeId === filter.placeId;
  if (filter.locality) {
    return String(alert.locality || '').trim().toLowerCase() === String(filter.locality).trim().toLowerCase();
  }
  return true;
}
