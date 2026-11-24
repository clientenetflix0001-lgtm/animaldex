import { useEffect } from 'react';
import { Platform } from 'react-native';
import { navigationRef } from '../../lib/navigationRef';
import { trackAdoptionsPathChange } from '../../lib/adoptionsAnalytics';

function currentPath(): { path: string; alertId?: string; name?: string } {
  if (typeof window !== 'undefined') {
    const path = `${window.location.pathname || '/'}`;
    const state = navigationRef.getRootState?.();
    const leaf = leafRoute(state);
    return { path, alertId: leaf?.params?.alertId, name: leaf?.name };
  }
  return { path: '/' };
}

function leafRoute(state: { routes?: Array<{ name?: string; params?: { alertId?: string }; state?: unknown }>; index?: number } | undefined): {
  name?: string;
  params?: { alertId?: string };
} | null {
  if (!state?.routes?.length) return null;
  const route = state.routes[state.index ?? state.routes.length - 1];
  if (route?.state) return leafRoute(route.state as typeof state);
  return route || null;
}

/**
 * Escucha navegación SPA en el subdominio de Adopciones.
 * No altera scroll ni transiciones: solo dispara eventos en segundo plano.
 */
export function AdoptionsAnalyticsBridge() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let unsub = () => {};
    let tries = 0;
    const start = () => {
      if (!navigationRef.isReady()) {
        if (tries++ > 40) return;
        const t = setTimeout(start, 80);
        unsub = () => clearTimeout(t);
        return;
      }
      const send = () => {
        const cur = currentPath();
        trackAdoptionsPathChange(cur.path, { alertId: cur.alertId, name: cur.name });
      };
      send();
      unsub = navigationRef.addListener('state', send);
    };
    start();
    return () => unsub();
  }, []);

  return null;
}
