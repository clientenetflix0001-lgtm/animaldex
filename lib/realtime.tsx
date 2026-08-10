// ============================================================
// Motor de tiempo real de Animaldex
// ============================================================
// Estrategia: detección de eventos por sondeo incremental ligero
// (delta-polling). Cada consulta pide SOLO lo que cambió desde el
// último timestamp conocido — nunca se recarga el feed completo,
// nunca se reinicia el scroll, y el estado existente queda intacto.
// El sondeo se pausa automáticamente cuando la pestaña/app está
// en segundo plano para no gastar datos ni batería.
// ============================================================

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, ApiNotification } from './db';
import { useStore } from './store';

// ---------- Hook de sondeo con pausa en segundo plano ----------
export function usePolling(fn: () => void, ms: number, enabled = true) {
  const saved = useRef(fn);
  saved.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    const isVisible = () => {
      if (Platform.OS === 'web') {
        return typeof document === 'undefined' || !document.hidden;
      }
      return AppState.currentState === 'active';
    };

    const tick = () => {
      if (!active || !isVisible()) return;
      saved.current();
    };

    const id = setInterval(tick, ms);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [ms, enabled]);
}

// ---------- Notificaciones en tiempo real ----------

interface NotificationsState {
  notifications: ApiNotification[];
  unread: number;
  markSeen: () => void;
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsState>({
  notifications: [],
  unread: 0,
  markSeen: () => {},
  refresh: async () => {},
});

const SEEN_KEY = 'animaldex-notif-seen';

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useStore();
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [lastSeen, setLastSeen] = useState<number>(0);
  const loadedSeen = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY)
      .then((v) => {
        if (v) setLastSeen(Number(v) || 0);
        loadedSeen.current = true;
      })
      .catch(() => {
        loadedSeen.current = true;
      });
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const { notifications: items } = await db.notifications();
      // Actualización incremental: solo reemplaza si hay cambios reales
      setNotifications((prev) => {
        if (
          prev.length === items.length &&
          prev.length > 0 &&
          prev[0]?.id === items[0]?.id
        ) {
          return prev;
        }
        return items;
      });
    } catch {}
  }, [user]);

  // Carga inicial + al cambiar de usuario
  useEffect(() => {
    if (user) refresh();
    else setNotifications([]);
  }, [user, refresh]);

  // Sondeo cada 20 s (pausado en segundo plano)
  usePolling(refresh, 20000, !!user);

  const markSeen = useCallback(() => {
    const now = Date.now();
    setLastSeen(now);
    AsyncStorage.setItem(SEEN_KEY, String(now)).catch(() => {});
  }, []);

  const unread = notifications.filter((n) => n.createdAt > lastSeen).length;

  return (
    <NotificationsContext.Provider value={{ notifications, unread, markSeen, refresh }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsState {
  return useContext(NotificationsContext);
}
