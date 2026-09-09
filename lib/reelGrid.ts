export const REEL_GRID_PAGE = 12;
export const REEL_GRID_COLUMNS = 3;

export type ReelGridScopeType = 'profile' | 'pet' | 'user' | 'feed';

export type ReelGridScope =
  | { type: 'profile'; id: string }
  | { type: 'pet'; id: string }
  | { type: 'user'; id: string }
  | { type: 'feed' };

export function reelVisibleOnProfileGrid(
  reel: { status: string; deletedAt?: number | null },
  opts: { isOwner: boolean }
): boolean {
  if (reel.deletedAt) return false;
  if (reel.status === 'deleted') return false;
  if (reel.status === 'ready') return true;
  if (!opts.isOwner) return false;
  return (
    reel.status === 'processing' ||
    reel.status === 'uploading' ||
    reel.status === 'upload_failed' ||
    reel.status === 'processing_failed' ||
    reel.status === 'rejected'
  );
}

export function reelVisibleOnPetGrid(reel: { status: string; petId?: string | null; deletedAt?: number | null }, petId: string): boolean {
  if (reel.deletedAt || reel.status === 'deleted') return false;
  if (reel.status !== 'ready') return false;
  return reel.petId === petId;
}

export function appendUniqueReels<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const seen = new Set(existing.map((r) => r.id));
  const next = existing.slice();
  for (const row of incoming) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      next.push(row);
    }
  }
  return next;
}

export function reelGridCursor(items: Array<{ createdAt: number }>): number | undefined {
  if (!items.length) return undefined;
  return items[items.length - 1].createdAt;
}

export function clampReelGridLimit(limit?: number): number {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return REEL_GRID_PAGE;
  return Math.min(Math.max(1, Math.floor(n)), 24);
}

export function profileReelsOwnerStatuses(isOwner: boolean): string[] {
  if (isOwner) {
    return ['ready', 'processing', 'uploading', 'upload_failed', 'processing_failed', 'rejected'];
  }
  return ['ready'];
}

export function reelViewerParamsFromGrid<T extends { id: string }>(input: {
  reelId: string;
  items: T[];
  index: number;
  scope: Exclude<ReelGridScope, { type: 'feed' }>;
}): {
  reelId: string;
  scope: 'profile' | 'pet' | 'user';
  scopeId: string;
  initialReels: T[];
  initialIndex: number;
} {
  const index = Math.max(0, Math.min(input.index, Math.max(0, input.items.length - 1)));
  return {
    reelId: input.reelId,
    scope: input.scope.type,
    scopeId: input.scope.id,
    initialReels: input.items,
    initialIndex: index,
  };
}

export function reelViewerStartIndex(items: Array<{ id: string }>, reelId: string, fallback = 0): number {
  const i = items.findIndex((r) => r.id === reelId);
  return i >= 0 ? i : fallback;
}

export function gridTileUsesPlayer(_reel: { hlsUrl?: string | null }): boolean {
  return false;
}

export function ownerGridLabel(status: string): string | null {
  if (status === 'processing' || status === 'uploading') return 'Procesando…';
  if (status === 'upload_failed' || status === 'processing_failed' || status === 'rejected') return 'Error';
  return null;
}
