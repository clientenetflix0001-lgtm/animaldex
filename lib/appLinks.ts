import { hasPetSuffix, isValidPetUsername } from './petHandles';

/** Prefijos que React Navigation y el parser público reconocen. */
export const APP_LINK_PREFIXES = [
  'animaldex://',
  'https://animaldex-web.pages.dev',
] as const;

export const APP_LINK_HTTPS_HOSTS = ['animaldex-web.pages.dev'] as const;

export type AppLinkTab = 'Inicio' | 'Reels' | 'Alertas' | 'Mercado' | 'Crear' | 'Mascotas' | 'Actividad' | 'Perfil';

export type AppLinkTarget =
  | { screen: 'PostDetail'; params: { postId: string; d?: string } }
  | { screen: 'PetProfile'; params: { petId: string } }
  | { screen: 'AlertDetail'; params: { alertId: string } }
  | { screen: 'ListingDetail'; params: { listingId: string } }
  | { screen: 'ReelViewer'; params: { reelId: string } }
  | { screen: 'PublicProfile'; params: { username: string } }
  | { screen: 'Tabs'; params: { screen: AppLinkTab } };

const TAB_SEGMENTS: Record<string, AppLinkTab> = {
  reels: 'Reels',
  alertas: 'Alertas',
  mercado: 'Mercado',
  crear: 'Crear',
  mascotas: 'Mascotas',
  actividad: 'Actividad',
  perfil: 'Perfil',
};

/** Alineado con lib/publicHandles.ts USERNAME_RE + RESERVED_PUBLIC_USERNAMES. */
const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
const RESERVED_SEGMENTS = new Set([
  'p',
  'pet',
  'a',
  'm',
  'r',
  'login',
  'register',
  'auth',
  'feed',
  'reels',
  'alerts',
  'alertas',
  'marketplace',
  'mercado',
  'admin',
  'api',
  'crear',
  'mascotas',
  'actividad',
  'perfil',
  'explorar',
  'verificar',
  'escanear',
  'entrar',
  'tienda',
  'vender',
  'user',
  'users',
  'assets',
  'expo',
  'index',
  'home',
  'app',
  'www',
  'static',
  'public',
  'nueva-mascota',
  'editar-perfil',
  'editar-perfil-publico',
  'crear-alerta',
  'mercado-favoritos',
  'favicon.ico',
  'robots.txt',
  'well-known',
]);

const SCHEME_PLACEHOLDER_HOST = 'animaldex.local';

let pendingUrl: string | null = null;

function parseUrl(raw: string): URL | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  try {
    if (/^animaldex:/i.test(s)) {
      const rest = s.replace(/^animaldex:\/\//i, '').replace(/^animaldex:/i, '');
      if (/^https?:\/\//i.test(rest)) return new URL(rest);
      return new URL(`https://${SCHEME_PLACEHOLDER_HOST}/${rest.replace(/^\//, '')}`);
    }
    return new URL(s);
  } catch {
    return null;
  }
}

function isAllowedHost(host: string): boolean {
  if (host === SCHEME_PLACEHOLDER_HOST) return true;
  return (APP_LINK_HTTPS_HOSTS as readonly string[]).includes(host);
}

function firstSegmentId(parts: string[], index: number): string {
  return decodeURIComponent(parts[index] || '').trim();
}

/**
 * Resuelve una URL pública o `animaldex://` a la pantalla del Root Stack.
 * No cambia las formas públicas: /p/, /pet/, /a/, /m/, /:username.
 */
export function resolveAppLink(url: string | null | undefined): AppLinkTarget | null {
  if (!url) return null;
  const parsed = parseUrl(url);
  if (!parsed || !isAllowedHost(parsed.hostname)) return null;

  const parts = parsed.pathname.split('/').filter(Boolean);
  const queryD = parsed.searchParams.get('d') || undefined;

  if (parts.length === 0) {
    return { screen: 'Tabs', params: { screen: 'Inicio' } };
  }

  const head = parts[0];
  const id = parts.length > 1 ? firstSegmentId(parts, 1) : '';

  if (head === 'p' && id) {
    return { screen: 'PostDetail', params: queryD ? { postId: id, d: queryD } : { postId: id } };
  }
  if (head === 'pet' && id) {
    return { screen: 'PetProfile', params: { petId: id } };
  }
  if (head === 'a' && id) {
    return { screen: 'AlertDetail', params: { alertId: id } };
  }
  if (head === 'm' && id) {
    return { screen: 'ListingDetail', params: { listingId: id } };
  }
  if (head === 'r' && id) {
    return { screen: 'ReelViewer', params: { reelId: id } };
  }

  if (parts.length === 1) {
    const seg = head.toLowerCase();
    const tab = TAB_SEGMENTS[seg];
    if (tab) return { screen: 'Tabs', params: { screen: tab } };
    if (hasPetSuffix(seg) && (isValidPetUsername(seg) || USERNAME_RE.test(seg))) {
      return { screen: 'PetProfile', params: { petId: seg } };
    }
    if (USERNAME_RE.test(seg) && !RESERVED_SEGMENTS.has(seg)) {
      return { screen: 'PublicProfile', params: { username: seg } };
    }
    if (RESERVED_SEGMENTS.has(seg)) return null;
  }

  return null;
}

export function rememberIncomingAppLink(url: string | null | undefined): AppLinkTarget | null {
  const target = resolveAppLink(url);
  if (target && url) pendingUrl = url;
  return target;
}

export function peekPendingAppLink(): string | null {
  return pendingUrl;
}

export function clearPendingAppLink(): void {
  pendingUrl = null;
}

export function applyAppLinkIfReady(input: {
  authReady: boolean;
  navReady: boolean;
  hasUser: boolean;
  isReady?: () => boolean;
  navigate: (name: string, params?: object) => void;
}): 'idle' | 'wait' | 'applied' | 'ignored' {
  if (!pendingUrl) return 'idle';
  const target = resolveAppLink(pendingUrl);
  if (!target) {
    pendingUrl = null;
    return 'ignored';
  }
  if (!input.authReady || !input.navReady) return 'wait';
  if (input.isReady && !input.isReady()) return 'wait';
  if (target.screen === 'Tabs' && !input.hasUser) return 'wait';
  input.navigate(target.screen, target.params);
  pendingUrl = null;
  return 'applied';
}
