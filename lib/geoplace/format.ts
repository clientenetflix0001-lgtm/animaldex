// ============================================================
// Etiquetas de lugares para la UI.
// ============================================================
// Puro y sin dependencias de React Native: lo usan el PlacePicker y los tests.
//
// CC BY 4.0: cualquier pantalla que muestre estos datos tiene que mostrar la
// atribución. `GEO_ATTRIBUTION` está en catalog.ts y se expone acá para que el
// componente que renderiza lugares tenga todo en un solo import.
// ============================================================

import { GEO_ATTRIBUTION } from './catalog.ts';
import { normalizeGeoText } from './normalize.ts';
import { adminLevelLabels, type GeoPlace } from './types.ts';

export { GEO_ATTRIBUTION };

/**
 * Contexto territorial que desambigua dos lugares del mismo nombre.
 *
 *   San Lorenzo (dpto Capital, Salta)        -> 'Capital, Salta'
 *   San Lorenzo (dpto San Lorenzo, Santa Fe) -> 'Santa Fe'
 *
 * Cuando el nivel 2 se llama igual que la localidad, repetirlo no aporta nada
 * y queda ruidoso, así que se muestra sólo el nivel 1.
 */
export function placeContextLabel(place: GeoPlace): string {
  const admin1 = place.admin1Name || '';
  const admin2 = place.admin2Name || '';
  if (!admin2) return admin1;
  if (normalizeGeoText(admin2) === normalizeGeoText(place.localityName)) return admin1;
  if (normalizeGeoText(admin2) === normalizeGeoText(admin1)) return admin1;
  return admin1 ? `${admin2}, ${admin1}` : admin2;
}

/** Una línea completa: `San Lorenzo · Capital, Salta`. */
export function placeFullLabel(place: GeoPlace): string {
  const context = placeContextLabel(place);
  return context ? `${place.localityName} · ${context}` : place.localityName;
}

/** Etiqueta del nivel 2 según el país, para textos tipo "Departamento: X". */
export function admin2Label(place: GeoPlace): string {
  return adminLevelLabels(place.countryCode).admin2;
}

/**
 * Distancia para mostrar. GRUESA A PROPÓSITO: una distancia fina a un centroide
 * público permitiría deducir dónde está el usuario, así que se informa por
 * tramos y nunca con decimales.
 *
 *   0.4 -> 'Muy cerca'   3.2 -> 'A menos de 5 km'   47 -> 'A más de 25 km'
 */
export function coarseDistanceLabel(distanceKm: number | null | undefined): string | null {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return null;
  if (distanceKm < 2) return 'Muy cerca';
  if (distanceKm < 5) return 'A menos de 5 km';
  if (distanceKm < 15) return 'A menos de 15 km';
  if (distanceKm < 25) return 'A menos de 25 km';
  return 'A más de 25 km';
}
