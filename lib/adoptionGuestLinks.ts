// ============================================================
// Animaldex Adopciones web — enlaces privados de gestión (sin cuenta).
// ============================================================
// El enlace es `/adopciones/<slug>/gestionar#<alertId>.<token>`. El token
// nunca viaja en la ruta ni en el query: el fragmento no se envía al
// servidor, no queda en logs ni en Referer y no aparece en previews OG.
//
// Copia local opcional en este navegador (localStorage) para que "Mis
// publicaciones" las muestre sin cuenta. Solo web.
// ============================================================
import { Platform } from 'react-native';
import { PUBLIC_WEB_ORIGIN } from './publicWeb';
import { adoptionSubPath, ADOPTIONS_SEGMENT } from './adoptionLocalities';
import { buildManageFragment, parseManageFragment } from './adoptionLifecycle';

const STORAGE_KEY = 'animaldex.adoptionGuestLinks.v1';
const MAX_LINKS = 10;

export type GuestManageLink = { alertId: string; token: string; city: string; expiresAt: number };

function hasWindow(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined';
}

// React Navigation reescribe la URL al montar; el fragmento se captura antes.
let initialFragment: { alertId: string; token: string } | null = null;
if (hasWindow()) {
  try {
    const path = window.location.pathname || '';
    if (path.startsWith(`/${ADOPTIONS_SEGMENT}/`) && path.replace(/\/+$/, '').endsWith('/gestionar')) {
      initialFragment = parseManageFragment(window.location.hash);
    }
  } catch {}
}

/** Fragmento de gestión de la URL actual o de la carga inicial. */
export function currentManageFragment(): { alertId: string; token: string } | null {
  if (hasWindow()) {
    const now = parseManageFragment(window.location.hash);
    if (now) return now;
  }
  return initialFragment;
}

export function guestManageUrl(city: string, alertId: string, token: string): string {
  return `${PUBLIC_WEB_ORIGIN}${adoptionSubPath(city, 'gestionar')}#${buildManageFragment(alertId, token)}`;
}

function read(): GuestManageLink[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.filter(
      (l) => l && typeof l.alertId === 'string' && typeof l.token === 'string' && typeof l.city === 'string'
    );
  } catch {
    return [];
  }
}

function write(list: GuestManageLink[]): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_LINKS)));
  } catch {}
}

export function listGuestLinks(now = Date.now()): GuestManageLink[] {
  const list = read();
  const alive = list.filter((l) => !l.expiresAt || l.expiresAt > now);
  if (alive.length !== list.length) write(alive);
  return alive;
}

export function saveGuestLink(link: GuestManageLink): void {
  write([link, ...read().filter((l) => l.alertId !== link.alertId)]);
}

export function removeGuestLink(alertId: string): void {
  write(read().filter((l) => l.alertId !== alertId));
}
