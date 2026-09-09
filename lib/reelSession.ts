/**
 * Reels del dueño en esta sesión (processing / failed) hasta que myReelState
 * esté desplegado. No es backend. No persiste entre installs.
 */

export type LocalOwnerReel = {
  id: string;
  status: string;
  caption: string;
  thumbnailUri: string | null;
  createdAt: number;
};

const mine = new Map<string, LocalOwnerReel>();

export function rememberLocalReel(row: LocalOwnerReel): LocalOwnerReel {
  mine.set(row.id, row);
  return row;
}

export function forgetLocalReel(id: string): void {
  mine.delete(id);
}

export function listLocalReels(): LocalOwnerReel[] {
  return [...mine.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function updateLocalReel(id: string, patch: Partial<LocalOwnerReel>): LocalOwnerReel | null {
  const prev = mine.get(id);
  if (!prev) return null;
  const next = { ...prev, ...patch, id };
  mine.set(id, next);
  return next;
}

export function clearLocalReels(): void {
  mine.clear();
}

/** El pending local nunca puebla el feed Reels. */
export function localReelMayAppearInFeed(_row?: LocalOwnerReel | null): boolean {
  return false;
}

export function shouldForgetLocalReelStatus(status: string): boolean {
  return (
    status === 'ready' ||
    status === 'deleted' ||
    status === 'upload_failed' ||
    status === 'processing_failed' ||
    status === 'rejected'
  );
}
