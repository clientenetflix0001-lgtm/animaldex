/** Formato público de handle humano/página: 3-20 caracteres, minúsculas. */
export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

/**
 * Primeros segmentos de rutas reales de Animaldex + nombres pedidos
 * (login, register, auth, feed, alerts, marketplace, api).
 * Comparación case-insensitive. Mantener sincronizado con:
 * - worker/index.js (RESERVED_PUBLIC_USERNAMES)
 * - cf-pages-worker.src.js (reserved)
 */
export const RESERVED_PUBLIC_USERNAMES: readonly string[] = [
  'p',
  'pet',
  'a',
  'm',
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
  '_expo',
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
];

const RESERVED_SET = new Set(RESERVED_PUBLIC_USERNAMES);

export function normalizePublicUsername(value: string): string {
  return String(value || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
}

export function isReservedPublicUsername(value: string): boolean {
  return RESERVED_SET.has(normalizePublicUsername(value));
}

export function isValidPublicUsername(value: string): boolean {
  const handle = normalizePublicUsername(value);
  return USERNAME_RE.test(handle) && !isReservedPublicUsername(handle);
}

type Nav = {
  navigate: (name: string, params?: object) => void;
};

/**
 * Navegación pública de cuentas humanas/páginas: siempre `/:username`.
 * Solo cae a UserProfile (interno, sin URL pública) si no hay handle.
 */
export function openHumanProfile(
  navigation: Nav,
  opts: { username?: string | null; userId?: string | null }
): void {
  const handle = normalizePublicUsername(opts.username || '');
  if (handle && handle !== 'usuario' && handle !== 'anónimo') {
    navigation.navigate('PublicProfile', { username: handle });
    return;
  }
  if (opts.userId) {
    navigation.navigate('UserProfile', { userId: opts.userId });
  }
}
