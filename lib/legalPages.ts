/** Rutas públicas HTML de privacidad / eliminación. No pasan por la SPA. */
export const LEGAL_PAGE_PATHS = ['/privacidad', '/eliminar-cuenta'] as const;

export const LEGAL_ASSET_FILES = {
  '/privacidad': '/privacidad/index.html',
  '/eliminar-cuenta': '/eliminar-cuenta/index.html',
} as const;

export function normalizeLegalPath(path: string): string {
  const raw = String(path || '').trim();
  const noQuery = raw.split('?')[0].split('#')[0];
  const clean = noQuery.replace(/\/+$/, '');
  return clean || '/';
}

export function isPublicLegalPath(path: string | null | undefined): boolean {
  const p = normalizeLegalPath(String(path || ''));
  return p === '/privacidad' || p === '/eliminar-cuenta';
}

export function legalPageAssetPath(path: string | null | undefined): string | null {
  const p = normalizeLegalPath(String(path || ''));
  if (p === '/privacidad') return LEGAL_ASSET_FILES['/privacidad'];
  if (p === '/eliminar-cuenta') return LEGAL_ASSET_FILES['/eliminar-cuenta'];
  return null;
}
