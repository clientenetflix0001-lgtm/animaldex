/**
 * Verificación de webhooks Mux. Solo Worker + tests (usa node:crypto).
 * El cliente React Native NO debe importar este archivo.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { REEL_WEBHOOK_SKEW_MS } from './reels.ts';

export function parseMuxSignature(header: string | null | undefined): { timestamp: number; v1: string } | null {
  const raw = String(header || '');
  if (!raw) return null;
  let timestamp = 0;
  let v1 = '';
  for (const part of raw.split(',')) {
    const [k, ...rest] = part.trim().split('=');
    const v = rest.join('=');
    if (k === 't') timestamp = Number(v);
    if (k === 'v1') v1 = v;
  }
  if (!timestamp || !v1) return null;
  return { timestamp, v1 };
}

export function verifyMuxSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  nowMs = Date.now()
): boolean {
  if (!secret) return false;
  const parsed = parseMuxSignature(header);
  if (!parsed) return false;
  if (Math.abs(nowMs - parsed.timestamp * 1000) > REEL_WEBHOOK_SKEW_MS) return false;
  const expected = createHmac('sha256', secret).update(`${parsed.timestamp}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(parsed.v1, 'utf8');
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
