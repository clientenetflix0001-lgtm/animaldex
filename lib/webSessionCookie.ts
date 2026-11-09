// ============================================================
// Sesión web compartida entre animaldex.com y el subdominio.
// ============================================================
// AsyncStorage en web es localStorage y no cruza orígenes.
// La cookie va en Domain=.animaldex.com para que iniciar sesión
// en cualquiera de los dos hosts sirva en el otro.
// Android no tiene `document`: estas funciones no hacen nada.
// El token ya vivía en almacenamiento legible por JS; la cookie
// tiene el mismo alcance, no es HttpOnly.
// ============================================================

const COOKIE = 'animaldex_session';
const MAX_AGE_SEC = 90 * 24 * 60 * 60;

function onAnimaldexHost(): boolean {
  if (typeof document === 'undefined' || typeof location === 'undefined') return false;
  const host = String(location.hostname || '').toLowerCase();
  return host === 'animaldex.com' || host.endsWith('.animaldex.com');
}

export function readWebSessionCookie(): string | null {
  if (!onAnimaldexHost()) return null;
  const parts = String(document.cookie || '').split(';');
  for (const part of parts) {
    const item = part.trim();
    if (!item.startsWith(`${COOKIE}=`)) continue;
    const raw = item.slice(COOKIE.length + 1);
    if (!raw) return null;
    try {
      const token = decodeURIComponent(raw);
      return token.length >= 32 ? token : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function writeWebSessionCookie(token: string | null): void {
  if (!onAnimaldexHost()) return;
  const value = token ? encodeURIComponent(token) : '';
  const maxAge = token ? MAX_AGE_SEC : 0;
  document.cookie = `${COOKIE}=${value}; Path=/; Domain=.animaldex.com; Max-Age=${maxAge}; Secure; SameSite=Lax`;
}
