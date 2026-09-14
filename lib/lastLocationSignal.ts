// ============================================================
// Decisión de la señal de ubicación de Inicio.
// ============================================================
// Vive aparte de `lastLocationSync` a propósito: acá no hay GPS, ni red, ni
// AsyncStorage. Sólo la regla de qué se puede afirmar con lo que devolvió el
// resolvedor, que es la parte que importa revisar y probar.
//
// Inicio se ordena solo, sin que nadie lo pida, así que la regla es
// conservadora: si el resolvedor no afirma una localidad, no se elige ninguna.
// ============================================================

import { territoryFromArea, territoryFromPlace, type Territory } from './geoplace/territory.ts';
import type { GeoPlace, PlaceResolution } from './geoplace/types.ts';
import { unambiguousPlace } from './placeResolution.ts';

export type PlaceSignal = {
  /** Sólo cuando el resolvedor afirmó una localidad sin pedir confirmación. */
  place: GeoPlace | null;
  territory: Territory | null;
};

const NOTHING: PlaceSignal = { place: null, territory: null };

/**
 * Traduce el resultado de `/geo` en señal territorial.
 *
 * Tres caminos, de más a menos preciso:
 *
 *   1. hay un lugar inequívoco  -> identidad de localidad;
 *   2. hay área administrativa  -> identidad de departamento. El área sale de
 *      contención de polígono en el proveedor oficial y es confiable; cuál de
 *      sus localidades es, no. `administrativeArea` viene null en el fallback
 *      offline, así que esto no puede originarse en un centroide adivinado;
 *   3. nada de lo anterior      -> no se afirma territorio.
 */
export function placeSignalFromResolution(
  resolution: ({ ok: true } & PlaceResolution) | { ok: false; reason: string } | null | undefined
): PlaceSignal {
  if (!resolution?.ok) return NOTHING;
  const place = unambiguousPlace(resolution);
  if (place) return { place, territory: territoryFromPlace(place) };
  if (resolution.administrativeArea) {
    return { place: null, territory: territoryFromArea(resolution.administrativeArea) };
  }
  return NOTHING;
}
