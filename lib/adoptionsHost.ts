// ============================================================
// Animaldex Adopciones — hostname y paths canónicos.
// ============================================================
// La sección vive en https://adopciones.animaldex.com/saltacapital.
// animaldex.com/adopciones/... sigue existiendo: el Worker de Pages
// redirige esas rutas al subdominio. Este módulo no toca DNS.
// ============================================================

import { ADOPTIONS_SEGMENT, DEFAULT_ADOPTION_SLUG } from './adoptionLocalities.ts';

export const ADOPTIONS_HOST = 'adopciones.animaldex.com';
export const ADOPTIONS_ORIGIN = `https://${ADOPTIONS_HOST}`;

export function isAdoptionsHost(host: string | null | undefined): boolean {
  return String(host || '').trim().toLowerCase() === ADOPTIONS_HOST;
}

/**
 * Segmentos que en el subdominio NO son una localidad.
 * `entrar`, `/a/:id` y el resto de la SPA siguen resolviendo como hoy.
 */
const RESERVED_SEGMENTS = new Set([
  'p',
  'pet',
  'a',
  'm',
  'r',
  'reels',
  'alertas',
  'mercado',
  'crear',
  'mascotas',
  'actividad',
  'perfil',
  'explorar',
  'verificar',
  'escanear',
  'entrar',
  'tienda',
  'admin',
  'vender',
  'assets',
  '_expo',
  'favicon.ico',
  'robots.txt',
  'privacidad',
  'eliminar-cuenta',
  'seguridad-infantil',
  'editar-perfil',
  'editar-perfil-publico',
  'nueva-mascota',
  'crear-alerta',
  'mis-alertas',
  'mis-productos',
  'mercado-favoritos',
  'transfer',
  'well-known',
  'login',
  'register',
  'auth',
  ADOPTIONS_SEGMENT,
]);

export function isAdoptionsReservedSegment(segment: string): boolean {
  return RESERVED_SEGMENTS.has(String(segment || '').trim().toLowerCase());
}

/** Path del subdominio, sin origen: `/saltacapital` o `/saltacapital/:id`. */
export function adoptionsHostPath(slug: string, extra?: string): string {
  const city = String(slug || DEFAULT_ADOPTION_SLUG).trim() || DEFAULT_ADOPTION_SLUG;
  if (!extra) return `/${city}`;
  return `/${city}/${extra}`;
}

/** URL que se comparte. Siempre el subdominio, nunca animaldex.com/adopciones. */
export function adoptionCanonicalUrl(slug: string, alertId?: string): string {
  if (!alertId) return `${ADOPTIONS_ORIGIN}${adoptionsHostPath(slug)}`;
  return `${ADOPTIONS_ORIGIN}${adoptionsHostPath(slug, encodeURIComponent(alertId))}`;
}

/**
 * Path lógico `/adopciones/...` que ya entiende `resolveAdoptionPath`.
 * En el sitio principal solo reconoce el prefijo histórico.
 * En el subdominio, `/saltacapital` equivale a ese prefijo.
 * Devuelve null si la ruta no es de esta sección.
 */
export function toLogicalAdoptionPath(pathname: string, host?: string | null): string | null {
  const parts = String(pathname || '')
    .split('?')[0]
    .split('#')[0]
    .split('/')
    .filter(Boolean);
  if (!isAdoptionsHost(host)) {
    if (parts[0] !== ADOPTIONS_SEGMENT) return null;
    return `/${parts.join('/')}`;
  }
  if (parts.length === 0) return `/${ADOPTIONS_SEGMENT}/${DEFAULT_ADOPTION_SLUG}`;
  if (parts[0] === ADOPTIONS_SEGMENT) return `/${parts.join('/')}`;
  if (isAdoptionsReservedSegment(parts[0])) return null;
  return `/${ADOPTIONS_SEGMENT}/${parts.join('/')}`;
}

/** Quita el prefijo interno para la barra de direcciones del subdominio. */
export function stripAdoptionsPrefix(path: string): string {
  const clean = String(path || '');
  if (clean === `/${ADOPTIONS_SEGMENT}` || clean === `/${ADOPTIONS_SEGMENT}/`) {
    return `/${DEFAULT_ADOPTION_SLUG}`;
  }
  if (clean.startsWith(`/${ADOPTIONS_SEGMENT}/`)) {
    const rest = clean.slice(`/${ADOPTIONS_SEGMENT}`.length);
    return rest && rest !== '/' ? rest : `/${DEFAULT_ADOPTION_SLUG}`;
  }
  return clean;
}
