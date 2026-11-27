import { useEffect } from 'react';
import { Platform } from 'react-native';
import { navigationRef } from '../../lib/navigationRef';
import { useStore } from '../../lib/store';
import { isAdoptionsHost } from '../../lib/adoptionsHost';
import { ensureAdoptionsGa4Loaded, trackAdoptionsPageView } from '../../lib/adoptionsAnalytics';

type NavStateNode = {
  routes?: Array<{
    name?: string;
    params?: { city?: string; alertId?: string };
    state?: unknown;
  }>;
  index?: number;
};

function leafRoute(state: NavStateNode | undefined): {
  name?: string;
  params?: { city?: string; alertId?: string };
} | null {
  if (!state?.routes?.length) return null;
  const route = state.routes[state.index ?? state.routes.length - 1];
  if (route?.state) return leafRoute(route.state as NavStateNode);
  return route || null;
}

/**
 * Sincroniza navegaciones reales de la SPA con Google Analytics 4
 * exclusivamente en https://adopciones.animaldex.com.
 * Espera a authReady y al asentamiento de React Navigation para evitar
 * falsos page_view transitorios durante el arranque o cambios de estado.
 */
export function AdoptionsAnalyticsBridge() {
  const { authReady } = useStore();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!isAdoptionsHost(window.location.hostname)) return;
    ensureAdoptionsGa4Loaded();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !authReady) return;
    if (!isAdoptionsHost(window.location.hostname)) return;

    let unsubNav = () => {};
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    let tries = 0;
    let disposed = false;

    const clearTimers = () => {
      if (settleTimer != null) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
      if (readyTimer != null) {
        clearTimeout(readyTimer);
        readyTimer = null;
      }
    };

    const flush = () => {
      settleTimer = null;
      if (disposed) return;
      if (!navigationRef.isReady()) {
        if (tries++ > 40) return;
        readyTimer = setTimeout(flush, 80);
        return;
      }
      const state = navigationRef.getRootState?.() as NavStateNode | undefined;
      const leaf = leafRoute(state);
      trackAdoptionsPageView({
        pathname: window.location.pathname || '/',
        routeName: leaf?.name,
        city: leaf?.params?.city,
        alertId: leaf?.params?.alertId,
      });
    };

    const scheduleFlush = () => {
      if (disposed) return;
      if (settleTimer != null) clearTimeout(settleTimer);
      settleTimer = setTimeout(flush, 60);
    };

    const start = () => {
      if (disposed) return;
      if (!navigationRef.isReady()) {
        if (tries++ > 40) return;
        readyTimer = setTimeout(start, 80);
        return;
      }
      scheduleFlush();
      unsubNav = navigationRef.addListener('state', scheduleFlush);
    };

    start();
    window.addEventListener('popstate', scheduleFlush);

    return () => {
      disposed = true;
      clearTimers();
      unsubNav();
      window.removeEventListener('popstate', scheduleFlush);
    };
  }, [authReady]);

  return null;
}
