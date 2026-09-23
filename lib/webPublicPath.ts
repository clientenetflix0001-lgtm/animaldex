import { Platform } from 'react-native';

/** Quita ?qr= de la barra para que WebUrlSync no reabra TagWelcome. */
export function replaceWebPublicPath(path: string): void {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  const next = path.startsWith('/') ? path : `/${path}`;
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === next) return;
  window.history.replaceState(window.history.state, '', next);
}

export function webPetProfilePath(petId: string): string {
  return `/pet/${encodeURIComponent(String(petId || '').trim())}`;
}
