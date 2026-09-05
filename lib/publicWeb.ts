/** Dominio público oficial de Animaldex. Nunca generar www. */
export const PUBLIC_WEB_ORIGIN = 'https://animaldex.com';
export const PUBLIC_WEB_HOST = 'animaldex.com';

/** Host legacy de Cloudflare Pages. Los enlaces antiguos deben seguir resolviendo. */
export const LEGACY_WEB_ORIGIN = 'https://animaldex-web.pages.dev';
export const LEGACY_WEB_HOST = 'animaldex-web.pages.dev';

/** Hosts HTTPS aceptados al parsear un enlace entrante. www no se genera. */
export const ACCEPTED_PUBLIC_WEB_HOSTS = [
  PUBLIC_WEB_HOST,
  LEGACY_WEB_HOST,
  'www.animaldex.com',
] as const;

export function publicWebOrigin(): string {
  return PUBLIC_WEB_ORIGIN;
}

/** URL pública nueva. `path` puede ser `?qr=AAA123`, `/nina.pet` o `p/id`. */
export function publicWebUrl(path: string = ''): string {
  const raw = String(path || '');
  if (!raw || raw === '/') return PUBLIC_WEB_ORIGIN;
  if (raw.startsWith('?')) return `${PUBLIC_WEB_ORIGIN}${raw}`;
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  return `${PUBLIC_WEB_ORIGIN}${normalized}`;
}

export function isAcceptedPublicWebHost(host: string | null | undefined): boolean {
  const h = String(host || '').trim().toLowerCase();
  return (ACCEPTED_PUBLIC_WEB_HOSTS as readonly string[]).includes(h);
}

export function isGeneratedPublicUrl(url: string | null | undefined): boolean {
  const raw = String(url || '').trim();
  return raw.startsWith(`${PUBLIC_WEB_ORIGIN}/`) || raw === PUBLIC_WEB_ORIGIN || raw.startsWith(`${PUBLIC_WEB_ORIGIN}?`);
}

export function generatesWww(url: string | null | undefined): boolean {
  return /https?:\/\/www\./i.test(String(url || ''));
}
