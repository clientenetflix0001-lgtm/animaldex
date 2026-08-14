const FALLBACK_ORIGIN = 'https://animaldex-web.pages.dev';
export function appWebOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin?.startsWith('http')) return window.location.origin;
  return FALLBACK_ORIGIN;
}
export const APP_WEB_ORIGIN = FALLBACK_ORIGIN;
export function buildTagUrl(code: number): string { return `${appWebOrigin()}?qr=${code}`; }
export function extractTagCode(url: string | null | undefined): number | null {
  if (!url) return null;
  const m = url.match(/[?&]qr=(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) ? n : null;
}
export function qrImageUrl(data: string, size = 280): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
}
