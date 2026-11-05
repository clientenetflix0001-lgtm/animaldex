// ============================================================
// Animaldex Adopciones web — localidades habilitadas.
// ============================================================
// Puro: lo usan la app web, el Worker y los tests. El slug de la URL
// (`/adopciones/saltacapital`) nunca es identidad: la identidad es `placeId`.
// Para sumar una localidad alcanza con agregar una entrada.
//
// cf-pages-worker.src.js tiene una copia mínima (no puede importar TS):
// mantener sincronizado.
// ============================================================

export const ADOPTIONS_SEGMENT = 'adopciones';

export type AdoptionLocality = {
  slug: string;
  placeId: string;
  /** Nombre visible. */
  locality: string;
  province: string;
  admin1Code: string;
  admin2Code: string;
};

export const ADOPTION_LOCALITIES: readonly AdoptionLocality[] = [
  {
    slug: 'saltacapital',
    placeId: 'AR:georef:66028050',
    locality: 'Salta Capital',
    province: 'Salta',
    admin1Code: '66',
    admin2Code: '66028',
  },
];

export const DEFAULT_ADOPTION_SLUG = 'saltacapital';

export function adoptionLocalityBySlug(slug: unknown): AdoptionLocality | null {
  const key = String(slug || '').trim().toLowerCase();
  return ADOPTION_LOCALITIES.find((l) => l.slug === key) || null;
}

/** Subrutas fijas de una localidad. No pueden ser ids de alerta. */
export const ADOPTION_SUBPATHS = ['publicar', 'mis-publicaciones'] as const;
export type AdoptionSubpath = (typeof ADOPTION_SUBPATHS)[number];

export function adoptionWallPath(slug: string): string {
  return `/${ADOPTIONS_SEGMENT}/${slug}`;
}

export function adoptionPostPath(slug: string, alertId: string): string {
  return `/${ADOPTIONS_SEGMENT}/${slug}/${encodeURIComponent(alertId)}`;
}

export function adoptionSubPath(slug: string, sub: AdoptionSubpath): string {
  return `/${ADOPTIONS_SEGMENT}/${slug}/${sub}`;
}

export type AdoptionRoute =
  | { screen: 'AdoptionsWall'; params: { city: string } }
  | { screen: 'AdoptionPost'; params: { city: string; alertId: string } }
  | { screen: 'AdoptionPublish'; params: { city: string } }
  | { screen: 'AdoptionMine'; params: { city: string } };

/**
 * `/adopciones/<slug>[/<sub|id>]` → pantalla. Devuelve null para slugs que no
 * están habilitados, para que no se muestre un muro vacío de una localidad
 * inexistente.
 */
export function resolveAdoptionPath(parts: string[]): AdoptionRoute | null {
  if (parts[0] !== ADOPTIONS_SEGMENT) return null;
  const place = adoptionLocalityBySlug(parts[1]);
  if (!place) return null;
  const city = place.slug;
  if (parts.length === 2) return { screen: 'AdoptionsWall', params: { city } };
  if (parts.length !== 3) return null;
  const seg = decodeURIComponent(parts[2] || '').trim();
  if (!seg) return null;
  if (seg === 'publicar') return { screen: 'AdoptionPublish', params: { city } };
  if (seg === 'mis-publicaciones') return { screen: 'AdoptionMine', params: { city } };
  if (seg === 'gestionar') return { screen: 'AdoptionsWall', params: { city } };
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(seg)) return null;
  return { screen: 'AdoptionPost', params: { city, alertId: seg } };
}
