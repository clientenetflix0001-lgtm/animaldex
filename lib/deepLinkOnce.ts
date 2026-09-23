/** Deep links QR/App Link: evento de una sola vez por launch + initial stale. */

const seenThisLaunch = new Set<string>();

export const CONSUMED_INITIAL_APP_LINK_KEY = 'animaldex-consumed-initial-app-link';

export function normalizeAppLinkUrl(url: string | null | undefined): string {
  return String(url || '').trim();
}

export function shouldAcceptInitialAppLink(
  url: string | null | undefined,
  lastConsumed: string | null | undefined
): boolean {
  const n = normalizeAppLinkUrl(url);
  if (!n) return false;
  if (seenThisLaunch.has(n)) return false;
  if (lastConsumed && lastConsumed === n) return false;
  return true;
}

export function shouldAcceptEventAppLink(url: string | null | undefined): boolean {
  const n = normalizeAppLinkUrl(url);
  if (!n) return false;
  if (seenThisLaunch.has(n)) return false;
  return true;
}

export function markAppLinkSeenThisLaunch(url: string | null | undefined): string {
  const n = normalizeAppLinkUrl(url);
  if (n) seenThisLaunch.add(n);
  return n;
}

export function resetDeepLinkOnceForTests(): void {
  seenThisLaunch.clear();
}

export function wasAppLinkSeenThisLaunch(url: string | null | undefined): boolean {
  return seenThisLaunch.has(normalizeAppLinkUrl(url));
}
