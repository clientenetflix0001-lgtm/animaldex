import { resolveAppLink } from './appLinks.ts';
import { PUBLIC_WEB_ORIGIN } from './publicWeb.ts';

let linkingHasUser = false;

export function setLinkingHasUser(value: boolean): void {
  linkingHasUser = !!value;
}

export function getLinkingHasUser(): boolean {
  return linkingHasUser;
}

function pathnameOnly(path: string): string {
  const raw = String(path || '').trim();
  if (!raw) return '/';
  try {
    const href = raw.startsWith('http')
      ? raw
      : `${PUBLIC_WEB_ORIGIN}${raw.startsWith('/') ? raw : `/${raw}`}`;
    const url = new URL(href);
    const clean = url.pathname.replace(/\/+$/, '');
    return clean || '/';
  } catch {
    const noQuery = raw.split('?')[0].split('#')[0];
    const clean = noQuery.replace(/\/+$/, '');
    return clean || '/';
  }
}

/** `https://animaldex.com/` y equivalentes: raíz real, sin heredar pet/slug. */
export function isWebRootPath(path: string | null | undefined): boolean {
  return pathnameOnly(String(path || '')) === '/';
}

export function webHomeState(hasUser = linkingHasUser) {
  if (hasUser) {
    return {
      routes: [{ name: 'Tabs', state: { index: 0, routes: [{ name: 'Inicio' }] } }],
    };
  }
  return { routes: [{ name: 'Auth' }] };
}

export function getStateFromPublicPath(path: string, options?: object) {
  if (isWebRootPath(path)) {
    return webHomeState(linkingHasUser);
  }

  const href = path.startsWith('http')
    ? path
    : `${PUBLIC_WEB_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
  const target = resolveAppLink(href);

  if (target?.screen === 'PetProfile') {
    const pet = { name: 'PetProfile', params: target.params };
    return linkingHasUser ? { routes: [{ name: 'Tabs' }, pet] } : { routes: [pet] };
  }
  if (target?.screen === 'PetTransferRequest') {
    const transfer = { name: 'PetTransferRequest', params: target.params };
    return linkingHasUser ? { routes: [{ name: 'Tabs' }, transfer] } : { routes: [transfer] };
  }

  return null;
}
