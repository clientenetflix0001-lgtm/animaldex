/**
 * Logs DEV de timings del pipeline Reel (T0–T5).
 * Solo corre si __DEV__ === true. Nunca loguea tokens, secrets ni la
 * Direct Upload URL completa.
 */

export type ReelDevMark = 'T0' | 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

type Session = { t0: number; marks: Partial<Record<ReelDevMark, number>> };

let pending: Session | null = null;
const sessions = new Map<string, Session>();

export function reelTimingShouldLog(devFlag: unknown): boolean {
  return devFlag === true;
}

function isDev(): boolean {
  return typeof __DEV__ !== 'undefined' && reelTimingShouldLog(__DEV__);
}

export function reelTimingSafeUrl(url: string | null | undefined): string {
  const raw = String(url || '').trim();
  if (!raw) return 'none';
  if (raw.startsWith('file:') || raw.startsWith('content:') || raw.startsWith('/')) return 'local-file';
  try {
    const u = new URL(raw);
    if (u.hostname.includes('mux.com') || u.hostname === 'storage.googleapis.com') return 'mux-host';
    return 'host';
  } catch {
    return 'opaque';
  }
}

export function reelTimingShortId(reelId: string | null | undefined): string {
  const id = String(reelId || '').trim();
  if (!id) return 'pending';
  return id.length <= 24 ? id : `${id.slice(0, 16)}…`;
}

export function reelTimingPayloadLooksSafe(payload: Record<string, unknown>): boolean {
  const blob = JSON.stringify(payload);
  if (/ExponentPushToken|MUX_|CF_IMAGES|Bearer |storage\.googleapis|mux\.com\/[A-Za-z0-9_-]{12,}/i.test(blob)) {
    return false;
  }
  if (/https?:\/\/[^\s"]{30,}/i.test(blob)) return false;
  return true;
}

function emit(label: ReelDevMark, payload: Record<string, unknown>) {
  if (!isDev()) return;
  if (!reelTimingPayloadLooksSafe(payload)) return;
  console.log('[reel-timing]', label, payload);
}

export function reelDevReset(): void {
  pending = null;
  sessions.clear();
}

export function reelDevT0(): void {
  if (!isDev()) return;
  const t0 = Date.now();
  pending = { t0, marks: { T0: t0 } };
  emit('T0', { reelId: 'pending', dtMs: 0 });
}

export function reelDevAttach(reelId: string): void {
  if (!isDev()) return;
  const id = String(reelId || '').trim();
  if (!id || !pending) return;
  sessions.set(id, pending);
  pending = null;
}

export function reelDevMark(
  reelId: string | null | undefined,
  label: Exclude<ReelDevMark, 'T0'>,
  extra?: Record<string, unknown>
): void {
  if (!isDev()) return;
  const now = Date.now();
  const id = String(reelId || '').trim();
  const session = (id && sessions.get(id)) || pending;
  if (session?.marks[label] != null) return;
  const t0 = session?.t0 ?? now;
  if (session) session.marks[label] = now;
  const payload: Record<string, unknown> = {
    reelId: reelTimingShortId(id || null),
    dtMs: now - t0,
  };
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (k === 'url' || k === 'uploadUrl' || k === 'token' || k === 'secret') continue;
      if (typeof v === 'string' && /^https?:\/\//i.test(v)) {
        payload[k] = reelTimingSafeUrl(v);
        continue;
      }
      payload[k] = v;
    }
  }
  emit(label, payload);
}
