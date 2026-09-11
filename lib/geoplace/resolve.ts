// ============================================================
// Resolución central de ubicaciones.
// ============================================================
// Dos entradas, un solo modelo de salida:
//   - texto  -> resolvePlaceFromText()  (búsqueda manual y migración de legacy)
//   - GPS    -> placeFromCoords()       (área oficial + candidatos del catálogo)
//
// Nada de acá inventa un lugar. Cuando hay más de una posibilidad se devuelven
// candidatos y `requiresConfirmation`, y la confirmación humana la hace la UI
// en Fase 3.
//
// ANCLAJE TERRITORIAL: provincia + departamento (admin1 + admin2). El gobierno
// local es SOLO señal de ranking. Filtrar por gobierno local descarta la
// respuesta correcta cuando la localidad cabecera lo tiene nulo, que pasa en el
// 33% del catálogo: ver el test de regresión de Cerrillos.
// ============================================================

import { resolveAdmin1Code, resolveGeoAlias } from './aliases.ts';
import {
  contextAdmin1Code,
  placeById,
  placesByExactName,
  placesInAdmin2,
  allPlaces,
  searchPlaces,
} from './catalog.ts';
import { geoCell, type GeoCell } from './cell.ts';
import { geoDistanceKm, normalizeGeoText, validGeoPoint } from './normalize.ts';
import type {
  AdministrativeArea,
  GeoCandidate,
  GeoConfidence,
  GeoContext,
  GeoPlace,
  PlaceResolution,
} from './types.ts';

/** Cuántos candidatos se devuelven como máximo. */
export const GEO_MAX_CANDIDATES = 8;

/**
 * Un candidato se considera claramente mejor si está al menos esta distancia
 * más cerca que el siguiente. Por debajo de eso se pide confirmación.
 */
export const GEO_CLEAR_WINNER_GAP_KM = 3;

/** Más lejos que esto, el centroide dejó de ser una pista razonable. */
export const GEO_MAX_PLAUSIBLE_KM = 60;

// ------------------------------------------------------------
// Texto
// ------------------------------------------------------------

export type TextResolution = {
  /** El lugar, solo si quedó uno inequívoco. */
  place: GeoPlace | null;
  candidates: GeoPlace[];
  ambiguous: boolean;
  via: 'exact' | 'alias' | 'search' | 'admin1-only' | 'none';
  /** Nivel 1 resuelto aunque no se haya podido resolver la localidad (CABA). */
  admin1Code: string | null;
  aliasRuleId?: string;
};

/**
 * Resuelve texto contra el catálogo, con aliases heredados y contexto
 * territorial. El texto es una consulta, nunca una identidad.
 */
export function resolvePlaceFromText(text: unknown, context?: GeoContext | null): TextResolution {
  const normalized = normalizeGeoText(text);
  // El contexto heredado trae el nombre que escribe la app, no el oficial:
  // "Tierra del Fuego" no coincide con "Tierra del Fuego, Antártida e Islas del
  // Atlántico Sur", así que hay que pasar por los aliases de nivel 1.
  const admin1Code = contextAdmin1Code(context) || resolveAdmin1Code(context?.admin1Name);
  const none: TextResolution = {
    place: null, candidates: [], ambiguous: false, via: 'none', admin1Code,
  };
  if (!normalized) return none;

  // 1. Los aliases se consultan primero: son los que saben que "Cerrillos" no
  //    es una localidad y que "San Lorenzo" no se puede resolver por nombre.
  const alias = resolveGeoAlias(normalized, context);
  if (alias) {
    if (alias.kind === 'place') {
      return { place: alias.place, candidates: [alias.place], ambiguous: false, via: 'alias', admin1Code, aliasRuleId: alias.ruleId };
    }
    if (alias.kind === 'admin1') {
      return { place: null, candidates: [], ambiguous: true, via: 'admin1-only', admin1Code: alias.admin1Code, aliasRuleId: alias.ruleId };
    }
    return {
      place: null,
      candidates: alias.candidates.slice(0, GEO_MAX_CANDIDATES),
      ambiguous: true,
      via: 'alias',
      admin1Code,
      aliasRuleId: alias.ruleId,
    };
  }

  // 2. Nombre exacto, acotado por el contexto si lo hay.
  const exact = placesByExactName(normalized);
  const scopedExact = admin1Code ? exact.filter((p) => p.admin1Code === admin1Code) : exact;
  if (scopedExact.length === 1) {
    return { place: scopedExact[0], candidates: scopedExact, ambiguous: false, via: 'exact', admin1Code };
  }
  if (scopedExact.length > 1) {
    return { place: null, candidates: scopedExact.slice(0, GEO_MAX_CANDIDATES), ambiguous: true, via: 'exact', admin1Code };
  }

  // 3. Búsqueda. Solo se acepta como resolución si deja un único candidato.
  const search = searchPlaces(normalized, {
    admin1Code: admin1Code || undefined,
    nearLat: context?.nearLat ?? null,
    nearLng: context?.nearLng ?? null,
    limit: GEO_MAX_CANDIDATES,
  });
  if (!search.matches.length) return none;
  const candidates = search.matches.map((m) => m.place);
  if (candidates.length === 1 && !search.truncated) {
    return { place: candidates[0], candidates, ambiguous: false, via: 'search', admin1Code };
  }
  return { place: null, candidates, ambiguous: true, via: 'search', admin1Code };
}

// ------------------------------------------------------------
// Coordenadas
// ------------------------------------------------------------

function toCandidate(place: GeoPlace, lat: number | null, lng: number | null, area: AdministrativeArea | null): GeoCandidate {
  return {
    place,
    distanceKm: lat != null && lng != null
      ? Number(geoDistanceKm(lat, lng, place.centroidLat, place.centroidLng).toFixed(3))
      : null,
    withinResolvedArea: !!area && place.admin2Code === area.admin2Code,
    governmentLocalMatch: !!area?.governmentLocalCode && place.governmentLocalCode === area.governmentLocalCode,
  };
}

function sortCandidates(a: GeoCandidate, b: GeoCandidate): number {
  if (a.withinResolvedArea !== b.withinResolvedArea) return a.withinResolvedArea ? -1 : 1;
  // La distancia manda. El gobierno local NO ordena: si lo hiciera, un punto
  // caído exactamente en el centroide de la localidad cabecera quedaría detrás
  // de sus satélites cada vez que la cabecera tiene gobierno local nulo, que es
  // el caso de San José de los Cerrillos. Enterrar la respuesta correcta es tan
  // incorrecto como excluirla.
  if (a.distanceKm != null && b.distanceKm != null && a.distanceKm !== b.distanceKm) {
    return a.distanceKm - b.distanceKm;
  }
  // A igual distancia sí desempata, y solo a favor: nunca en contra de un nulo.
  if (a.governmentLocalMatch !== b.governmentLocalMatch) return a.governmentLocalMatch ? -1 : 1;
  return a.place.providerPlaceId.localeCompare(b.place.providerPlaceId);
}

/** Los N lugares más cercanos de todo el catálogo. Base del fallback offline. */
export function nearestPlaces(lat: number, lng: number, limit = GEO_MAX_CANDIDATES): GeoCandidate[] {
  const scored: GeoCandidate[] = [];
  for (const place of allPlaces()) {
    scored.push(toCandidate(place, lat, lng, null));
  }
  scored.sort((a, b) => (a.distanceKm as number) - (b.distanceKm as number));
  return scored.slice(0, limit);
}

/** El lugar más cercano del catálogo. Un solo barrido, sin ordenar 4022 filas. */
function nearestPlace(lat: number, lng: number): GeoPlace | null {
  let best: GeoPlace | null = null;
  let bestKm = Infinity;
  for (const place of allPlaces()) {
    const km = geoDistanceKm(lat, lng, place.centroidLat, place.centroidLng);
    if (km < bestKm) {
      bestKm = km;
      best = place;
    }
  }
  return best;
}

export type PlaceFromCoordsInput = {
  lat: number;
  lng: number;
  /** Área resuelta por polígono en el proveedor oficial. null si no hubo red. */
  administrativeArea?: AdministrativeArea | null;
  /** Celda usada para consultar upstream, si hubo redondeo. */
  cell?: GeoCell | null;
};

/**
 * Convierte coordenadas en candidatos de GeoPlace. No adivina: si el área
 * oficial contiene más de una localidad, o el punto puede estar cerca de un
 * límite, devuelve varios candidatos con confianza baja.
 */
export function placeFromCoords(input: PlaceFromCoordsInput): PlaceResolution {
  const { lat, lng } = input;
  if (!validGeoPoint(lat, lng)) {
    return {
      administrativeArea: null,
      candidates: [],
      confidence: 'low',
      requiresConfirmation: true,
      source: 'offline-fallback',
      boundaryRisk: false,
      governmentLocalCorroborated: false,
      reason: 'no-candidates',
    };
  }

  const area = input.administrativeArea || null;
  const cell = input.cell || geoCell(lat, lng);

  // PRIVACIDAD: las distancias se miden desde el CENTRO DE LA CELDA, no desde
  // el punto real. Devolver distancias exactas a centroides públicos permitiría
  // trilaterar la posición del usuario con metro de precisión a partir de tres
  // candidatos, lo que anularía el redondeo a celda. El costo es menos de 1 km
  // de error, muy por debajo del umbral con el que se pide confirmación.
  const anchorLat = cell ? cell.centerLat : lat;
  const anchorLng = cell ? cell.centerLng : lng;

  // Sin área oficial no hay contención de polígono: solo se puede sugerir por
  // cercanía de centroide, y eso nunca se da por confirmado.
  if (!area) {
    const candidates = nearestPlaces(anchorLat, anchorLng);
    return {
      administrativeArea: null,
      candidates,
      confidence: 'low',
      requiresConfirmation: true,
      source: 'offline-fallback',
      boundaryRisk: true,
      governmentLocalCorroborated: false,
      reason: candidates.length ? 'offline-fallback' : 'no-candidates',
    };
  }

  // Conjunto de candidatos = departamento oficial. Nunca acotado por gobierno local.
  const inArea = placesInAdmin2(area.admin2Code).map((p) => toCandidate(p, anchorLat, anchorLng, area));
  inArea.sort(sortCandidates);

  // Riesgo de borde: el lugar más cercano de TODO el catálogo pertenece a otra
  // área, o la celda de redondeo es lo bastante grande como para cruzar el
  // límite frente a la distancia que separa al mejor candidato del siguiente.
  const globalNearest = nearestPlace(anchorLat, anchorLng);
  const nearestOutside = globalNearest && globalNearest.admin2Code !== area.admin2Code
    ? globalNearest
    : null;
  const cellRadius = cell?.radiusKm ?? 0;
  const best = inArea[0] || null;
  const second = inArea[1] || null;
  const gapKm = best && second && best.distanceKm != null && second.distanceKm != null
    ? second.distanceKm - best.distanceKm
    : Infinity;
  const boundaryRisk = !!nearestOutside || (!!best && gapKm <= cellRadius);

  // El candidato de otra área se incluye marcado, para que la UI pueda
  // ofrecerlo cuando el punto está pegado a un límite. Nunca primero, pero
  // tampoco recortado: en un borde es justo el que importa, así que se le
  // reserva el último lugar en vez de dejar que lo desplace el área entera.
  const outside = nearestOutside && !inArea.some((c) => c.place.placeId === nearestOutside.placeId)
    ? toCandidate(nearestOutside, anchorLat, anchorLng, area)
    : null;
  const trimmed = outside
    ? [...inArea.slice(0, GEO_MAX_CANDIDATES - 1), outside]
    : inArea.slice(0, GEO_MAX_CANDIDATES);

  if (!inArea.length) {
    return {
      administrativeArea: area,
      candidates: trimmed,
      confidence: 'low',
      requiresConfirmation: true,
      source: 'official',
      boundaryRisk,
      governmentLocalCorroborated: false,
      reason: 'area-without-places',
    };
  }

  const plausible = (best?.distanceKm ?? Infinity) <= GEO_MAX_PLAUSIBLE_KM;
  const clearWinner = gapKm >= GEO_CLEAR_WINNER_GAP_KM;
  const corroborated = !!best?.governmentLocalMatch;

  let confidence: GeoConfidence = 'low';
  let reason: PlaceResolution['reason'] = 'multiple-candidates';

  if (boundaryRisk) {
    reason = 'boundary-risk';
  } else if (inArea.length === 1) {
    confidence = plausible ? 'high' : 'low';
    reason = 'single-candidate';
  } else if (clearWinner && plausible) {
    // Con varias localidades en el área, la cercanía sola no alcanza: el
    // centroide más cercano acierta bastante menos de lo que parece. Solo la
    // coincidencia de gobierno local, que el proveedor resolvió por polígono y
    // no por distancia, justifica no preguntar.
    confidence = corroborated ? 'high' : 'medium';
    reason = corroborated ? 'corroborated-nearest' : 'clear-nearest';
  }

  return {
    administrativeArea: area,
    candidates: trimmed,
    confidence,
    // Solo la confianza alta evita preguntar. Todo lo demás se confirma.
    requiresConfirmation: confidence !== 'high',
    source: 'official',
    boundaryRisk,
    governmentLocalCorroborated: corroborated,
    reason,
  };
}

/** Reexport de conveniencia: identidad por placeId. */
export { placeById, searchPlaces };
