// ============================================================
// Aliases geográficos heredados.
// ============================================================
// Traducen el texto que la app viene guardando hasta hoy al catálogo oficial.
// Los 88 nombres del catálogo viejo (lib/localities.ts) se compararon contra el
// oficial: 70 coinciden exacto y 18 no. Esos 18 son los que cubre este módulo.
//
// REGLA: un alias considera el contexto territorial. Un nombre ambiguo sigue
// siendo ambiguo hasta tener contexto suficiente. Nunca se elige en silencio.
// ============================================================

import {
  admin1CodeByName,
  admin1Name,
  contextAdmin1Code,
  placeById,
  placesByExactName,
  placesInAdmin1,
  searchPlaces,
} from './catalog.ts';
import { normalizeGeoText } from './normalize.ts';
import type { GeoContext, GeoPlace } from './types.ts';

/**
 * Nombres de nivel 1 tal como los escribe la app hoy, mapeados al código
 * oficial. Solo hace falta para lo que no coincide literal: el único caso real
 * es Tierra del Fuego, cuyo nombre oficial incluye la Antártida. Las variantes
 * de CABA se agregan porque aparecen escritas de varias formas.
 */
export const ADMIN1_ALIASES: Record<string, string> = {
  'tierra del fuego': '94',
  'tierra del fuego antartida e islas del atlantico sur': '94',
  caba: '02',
  'capital federal': '02',
  'ciudad de buenos aires': '02',
  'ciudad autonoma de buenos aires': '02',
  'provincia de buenos aires': '06',
  pba: '06',
  // `buenos aires` como valor de la columna `province` significa la provincia.
  // Como NOMBRE DE LOCALIDAD es ambiguo, y eso se resuelve aparte.
  'buenos aires': '06',
};

/** Código oficial de nivel 1 a partir de un nombre heredado. */
export function resolveAdmin1Code(name: unknown): string | null {
  const normalized = normalizeGeoText(name);
  if (!normalized) return null;
  return admin1CodeByName(normalized) || ADMIN1_ALIASES[normalized] || null;
}

type AliasRule = {
  id: string;
  /** Texto normalizado que dispara la regla. */
  match: string;
  /** Si está presente, la regla solo aplica dentro de ese nivel 1. */
  admin1Code?: string;
  /** Destino, como id del proveedor. */
  target?: string;
  /** Marca el nombre como irreductiblemente ambiguo a nivel localidad. */
  ambiguous?: boolean;
  /** Resuelve solo el nivel 1, no la localidad. */
  admin1Only?: string;
  note: string;
};

/**
 * Reglas explícitas. Las once del patrón `"<X> Capital"` no están acá: las
 * cubre una regla genérica basada en datos, más abajo.
 */
export const ALIAS_RULES: AliasRule[] = [
  {
    id: 'ar-salta-cerrillos',
    match: 'cerrillos',
    admin1Code: '66',
    target: '66035010',
    note: 'El catálogo viejo guardaba el nombre del departamento. La localidad oficial es San José de los Cerrillos. '
      + 'Sin contexto de provincia queda ambiguo porque existe Los Cerrillos en Córdoba.',
  },
  {
    id: 'ar-salta-metan',
    match: 'metan',
    admin1Code: '66',
    target: '66112040',
    note: 'Nombre corto del departamento. La localidad oficial es San José de Metán.',
  },
  {
    id: 'ar-salta-oran',
    match: 'oran',
    admin1Code: '66',
    target: '66126070',
    note: 'Nombre corto del departamento. La localidad oficial es San Ramón de la Nueva Orán.',
  },
  {
    id: 'ar-caba',
    match: 'caba',
    admin1Only: '02',
    note: 'El catálogo oficial divide CABA en comunas, así que a nivel localidad es ambiguo. '
      + 'El nivel 1 sí queda resuelto.',
  },
  {
    id: 'ar-capital-federal',
    match: 'capital federal',
    admin1Only: '02',
    note: 'Igual que CABA: resuelve el nivel 1, no la localidad.',
  },
  {
    id: 'ar-ciudad-autonoma-de-buenos-aires',
    match: 'ciudad autonoma de buenos aires',
    admin1Only: '02',
    note: 'Igual que CABA: resuelve el nivel 1, no la localidad.',
  },
  {
    id: 'ar-san-lorenzo-ambiguo',
    match: 'san lorenzo',
    ambiguous: true,
    note: 'Cinco localidades en el país y DOS dentro de Salta (dpto Capital y dpto Rosario de la Frontera). '
      + 'Ni con provincia alcanza: hace falta departamento o coordenada.',
  },
  {
    id: 'ar-yerba-buena-ambiguo',
    match: 'yerba buena',
    admin1Code: '90',
    ambiguous: true,
    note: 'Dos localidades llamadas Yerba Buena dentro de Tucumán.',
  },
  {
    id: 'ar-buenos-aires-localidad-ambiguo',
    match: 'buenos aires',
    ambiguous: true,
    note: 'Como nombre de localidad no distingue CABA de la provincia ni de La Plata.',
  },
];

const CAPITAL_SUFFIX = ' capital';

export type AliasResolution =
  /** Un único lugar oficial. */
  | { kind: 'place'; place: GeoPlace; ruleId: string }
  /** Solo se pudo resolver el nivel 1 administrativo. */
  | { kind: 'admin1'; admin1Code: string; admin1Name: string; ruleId: string }
  /** Hay varios destinos posibles: la UI debe desambiguar (Fase 3). */
  | { kind: 'ambiguous'; candidates: GeoPlace[]; ruleId: string; needs: 'admin1' | 'admin2' }
  | null;

function uniquePlaces(places: (GeoPlace | null)[]): GeoPlace[] {
  const seen = new Set<string>();
  const out: GeoPlace[] = [];
  for (const place of places) {
    if (!place || seen.has(place.placeId)) continue;
    seen.add(place.placeId);
    out.push(place);
  }
  return out;
}

/** Candidatos plausibles para un texto: coincidencia exacta o por palabra completa. */
function textCandidates(normalized: string, admin1Code: string | null): GeoPlace[] {
  const exact = placesByExactName(normalized);
  const scoped = admin1Code ? exact.filter((p) => p.admin1Code === admin1Code) : exact;
  if (scoped.length) return scoped;
  const search = searchPlaces(normalized, { admin1Code: admin1Code || undefined, limit: 25 });
  return search.matches
    .filter((m) => m.tier === 'exact' || m.tier === 'word')
    .map((m) => m.place);
}

/**
 * Aplica los aliases heredados sobre un texto, con el contexto territorial que
 * haya. Devuelve null cuando ninguna regla aplica; en ese caso el llamador
 * sigue con la búsqueda normal.
 */
export function resolveGeoAlias(text: unknown, context?: GeoContext | null): AliasResolution {
  const normalized = normalizeGeoText(text);
  if (!normalized) return null;

  const ctxAdmin1 = contextAdmin1Code(context) || resolveAdmin1Code(context?.admin1Name);
  const rules = ALIAS_RULES.filter((rule) => rule.match === normalized);

  // 1. Ambigüedad declarada. Gana sobre todo lo demás: no se elige en silencio.
  const ambiguousRule = rules.find((rule) => rule.ambiguous
    && (!rule.admin1Code || rule.admin1Code === ctxAdmin1));
  if (ambiguousRule) {
    return {
      kind: 'ambiguous',
      candidates: textCandidates(normalized, ctxAdmin1),
      ruleId: ambiguousRule.id,
      needs: ctxAdmin1 ? 'admin2' : 'admin1',
    };
  }

  // 2. Regla con contexto de nivel 1 coincidente.
  const scoped = rules.find((rule) => rule.target && rule.admin1Code && rule.admin1Code === ctxAdmin1);
  if (scoped?.target) {
    const place = placeById(scoped.target);
    if (place) return { kind: 'place', place, ruleId: scoped.id };
  }

  // 3. Reglas que solo resuelven el nivel 1 (CABA y variantes).
  const adminOnly = rules.find((rule) => rule.admin1Only);
  if (adminOnly?.admin1Only) {
    return {
      kind: 'admin1',
      admin1Code: adminOnly.admin1Only,
      admin1Name: admin1Name(adminOnly.admin1Only) || '',
      ruleId: adminOnly.id,
    };
  }

  // 4. Regla genérica "<X> Capital", basada en datos y no en una lista fija:
  //    vale si dentro de esa jurisdicción hay exactamente una localidad que se
  //    llama igual que la jurisdicción.
  if (normalized.endsWith(CAPITAL_SUFFIX)) {
    const base = normalized.slice(0, -CAPITAL_SUFFIX.length).trim();
    const admin1Code = ctxAdmin1 || resolveAdmin1Code(base);
    if (admin1Code) {
      const label = normalizeGeoText(admin1Name(admin1Code));
      const target = base || label;
      const hits = placesInAdmin1(admin1Code).filter((p) => normalizeGeoText(p.localityName) === target);
      if (hits.length === 1) return { kind: 'place', place: hits[0], ruleId: 'ar-generic-capital' };
      if (hits.length > 1) {
        return { kind: 'ambiguous', candidates: [...hits], ruleId: 'ar-generic-capital', needs: 'admin2' };
      }
    }
  }

  // 5. Hay reglas para el texto pero ninguna aplica al contexto dado. Solo se
  //    resuelve si el catálogo deja un único candidato plausible; si no, ambiguo.
  const unscoped = rules.filter((rule) => rule.target);
  if (unscoped.length) {
    const candidates = uniquePlaces([
      ...unscoped.map((rule) => placeById(rule.target as string)),
      ...textCandidates(normalized, ctxAdmin1),
    ]);
    if (candidates.length === 1) {
      return { kind: 'place', place: candidates[0], ruleId: unscoped[0].id };
    }
    return {
      kind: 'ambiguous',
      candidates,
      ruleId: unscoped[0].id,
      needs: ctxAdmin1 ? 'admin2' : 'admin1',
    };
  }

  return null;
}
