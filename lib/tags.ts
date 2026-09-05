import { PUBLIC_WEB_ORIGIN, publicWebUrl } from './publicWeb.ts';

export function appWebOrigin(): string {
  return PUBLIC_WEB_ORIGIN;
}
export const APP_WEB_ORIGIN = PUBLIC_WEB_ORIGIN;

export const TAG_CODE_INVALID = 'El código debe tener hasta 6 letras o números.';
export const TAG_CODE_TAKEN = 'Este código QR ya está en uso.';
export const TAG_CODE_REQUIRED = 'Escribí un código QR.';

const MANUAL_TAG_RE = /^[A-Za-z0-9]{1,6}$/;
const INCOMING_TAG_RE = /^[A-Za-z0-9]{1,32}$/;

/** Código nuevo escrito por el admin: 1–6 alfanuméricos, en mayúsculas. */
export function parseManualTagCode(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/\s/.test(s) || !MANUAL_TAG_RE.test(s)) return null;
  return s.toUpperCase();
}

/** Lectura de ?qr= : acepta numéricos antiguos y alfanuméricos. */
export function parseIncomingTagCode(raw: unknown): string | null {
  const s = String(raw ?? '').trim().toUpperCase();
  if (!INCOMING_TAG_RE.test(s)) return null;
  return s;
}

export function buildTagUrl(code: string | number): string {
  return publicWebUrl(`?qr=${encodeURIComponent(String(code))}`);
}

export function extractTagCode(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = String(url).match(/[?&]qr=([A-Za-z0-9]+)/i);
  if (!m) return null;
  return parseIncomingTagCode(m[1]);
}

export function qrImageUrl(data: string, size = 280): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
}
