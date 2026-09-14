// ============================================================
// Identidad territorial de una consulta.
// ============================================================
// Es lo que la app manda al Worker cuando pregunta "qué hay por acá". Desde
// Fase 5 los seis filtros territoriales comparan esto y no el nombre mostrado.
//
// Tres ámbitos, del más preciso al más amplio:
//
//   locality  placeId de un GeoPlace que la persona eligió o confirmó.
//   admin2    departamento. El ámbito al que se degrada cuando el GPS resolvió
//             el área oficial pero no puede afirmar una localidad: admin1 y
//             admin2 vienen de contención de polígono y son confiables, la
//             localidad dentro del departamento no.
//   admin1    provincia.
//
// El nombre mostrado NUNCA viaja como identidad. Viaja aparte, sólo para que
// las versiones anteriores del Worker sigan entendiendo la consulta.
// ============================================================

import { admin1Name, admin2Name, placeById } from './catalog.ts';
import type { AdministrativeArea, GeoPlace } from './types.ts';

export type TerritoryScope = 'locality' | 'admin2' | 'admin1';

export type Territory = {
  /** Sólo en ámbito `locality`. */
  placeId: string | null;
  admin1Code: string | null;
  admin2Code: string | null;
  scope: TerritoryScope;
};

export function territoryFromPlace(place: GeoPlace): Territory {
  return {
    placeId: place.placeId,
    admin1Code: place.admin1Code,
    admin2Code: place.admin2Code,
    scope: 'locality',
  };
}

/**
 * Identidad de localidad a partir de un `placeId` guardado. Devuelve null si el
 * catálogo no lo reconoce: un id de otra versión no puede filtrar.
 */
export function territoryFromPlaceId(placeId: unknown): Territory | null {
  const place = placeById(placeId);
  return place ? territoryFromPlace(place) : null;
}

/**
 * Identidad a nivel departamento, para cuando hay área oficial pero no una
 * localidad confirmada. Deliberadamente sin `placeId`: no se elige ninguna de
 * las localidades del departamento.
 */
export function territoryFromArea(area: AdministrativeArea): Territory | null {
  if (!area?.admin2Code || !admin2Name(area.admin2Code)) return null;
  return {
    placeId: null,
    admin1Code: area.admin1Code || null,
    admin2Code: area.admin2Code,
    scope: 'admin2',
  };
}

/** Identidad a nivel provincia. */
export function territoryFromAdmin1(admin1Code: string): Territory | null {
  if (!admin1Code || !admin1Name(admin1Code)) return null;
  return { placeId: null, admin1Code, admin2Code: null, scope: 'admin1' };
}

/**
 * Relee una identidad guardada (caché de AsyncStorage) validándola contra el
 * catálogo. Un snapshot viejo, de otra versión del catálogo o manipulado no
 * puede convertirse en un filtro: se descarta.
 */
export function parseTerritory(raw: unknown): Territory | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const scope = row.scope;

  if (scope === 'locality' || (!scope && row.placeId)) {
    return territoryFromPlaceId(row.placeId);
  }
  if (scope === 'admin2') {
    const admin2Code = typeof row.admin2Code === 'string' ? row.admin2Code : '';
    if (!admin2Name(admin2Code)) return null;
    const admin1Code = typeof row.admin1Code === 'string' ? row.admin1Code : '';
    return {
      placeId: null,
      admin2Code,
      admin1Code: admin1Name(admin1Code) ? admin1Code : null,
      scope: 'admin2',
    };
  }
  if (scope === 'admin1') {
    const admin1Code = typeof row.admin1Code === 'string' ? row.admin1Code : '';
    return territoryFromAdmin1(admin1Code);
  }
  return null;
}

/** Campos que viajan en el cuerpo del request. */
export type TerritoryQuery = {
  placeId?: string;
  admin1Code?: string;
  admin2Code?: string;
  territoryScope?: TerritoryScope;
};

/**
 * Traduce una identidad a los campos del request. Se omite lo que no aplica
 * para no mandar `null` donde el Worker espera ausencia.
 */
export function territoryQuery(territory: Territory | null | undefined): TerritoryQuery {
  if (!territory) return {};
  const out: TerritoryQuery = { territoryScope: territory.scope };
  if (territory.scope === 'locality' && territory.placeId) out.placeId = territory.placeId;
  if (territory.admin1Code) out.admin1Code = territory.admin1Code;
  if (territory.admin2Code) out.admin2Code = territory.admin2Code;
  return out;
}

/** Nombre del lugar cuando la identidad es de localidad. Sólo para mostrar. */
export function territoryLocalityName(territory: Territory | null | undefined): string | null {
  if (!territory || territory.scope !== 'locality') return null;
  return placeById(territory.placeId)?.localityName ?? null;
}
