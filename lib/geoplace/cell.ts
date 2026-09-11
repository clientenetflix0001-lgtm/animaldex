// ============================================================
// Celdas de coordenada.
// ============================================================
// La coordenada exacta del usuario NO sale de Animaldex. Antes de consultar al
// proveedor oficial se redondea al centro de una celda de ~1 km. Eso cumple dos
// cosas a la vez: no se transmite la posición precisa, y muchos usuarios de una
// misma zona comparten clave de caché.
//
// Contrapartida: una celda puede cruzar un límite administrativo. El resolvedor
// trata ese caso como riesgo de borde y no afirma una localidad (ver resolve.ts).
// ============================================================

import { validGeoPoint } from './normalize.ts';

/** Lado aproximado de la celda, en km. */
export const GEO_CELL_KM = 1;

const KM_PER_DEG_LAT = 111.32;
const DEG = Math.PI / 180;

export type GeoCell = {
  /** Clave estable: `<km>:<latIdx>:<lngIdx>`. No contiene la coordenada original. */
  key: string;
  km: number;
  /** Centro de la celda. Es lo único que se envía upstream. */
  centerLat: number;
  centerLng: number;
  /** Distancia máxima posible entre un punto de la celda y su centro. */
  radiusKm: number;
};

/**
 * Cuantiza un punto a una celda determinista. El paso de longitud se calcula a
 * partir de la banda de latitud ya cuantizada, así que dos puntos de la misma
 * celda producen exactamente la misma clave y el mismo centro.
 */
export function geoCell(lat: unknown, lng: unknown, km: number = GEO_CELL_KM): GeoCell | null {
  if (!validGeoPoint(lat, lng)) return null;
  const size = km > 0 ? km : GEO_CELL_KM;
  const latStep = size / KM_PER_DEG_LAT;

  const latIdx = Math.round((lat as number) / latStep);
  const centerLat = latIdx * latStep;

  // Cerca de los polos el coseno tiende a 0 y el paso explotaría; se acota.
  const cos = Math.max(Math.cos(centerLat * DEG), 0.01);
  const lngStep = latStep / cos;
  const lngIdx = Math.round((lng as number) / lngStep);
  const centerLng = lngIdx * lngStep;

  return {
    key: `${size}:${latIdx}:${lngIdx}`,
    km: size,
    centerLat: Number(centerLat.toFixed(6)),
    centerLng: Number(centerLng.toFixed(6)),
    // Media diagonal de la celda: el peor caso de desplazamiento.
    radiusKm: (size * Math.SQRT2) / 2,
  };
}

/** Redondea para logs y respuestas: nunca se registra la coordenada precisa. */
export function coarseCoord(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
