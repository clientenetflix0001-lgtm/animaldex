// ============================================================
// Qué se puede afirmar de una resolución de lugar.
// ============================================================
// Módulo puro, sin expo-location ni cliente HTTP, para que la regla se pueda
// revisar y probar sin levantar nada.
// ============================================================

import type { GeoCandidate, GeoPlace, PlaceResolution } from './geoplace/types.ts';

/**
 * El único candidato que puede preseleccionarse sin preguntar. Devuelve null
 * salvo que el resolvedor haya dicho explícitamente que no hace falta
 * confirmar Y haya exactamente un candidato dentro del área oficial.
 */
export function unambiguousPlace(resolution: PlaceResolution): GeoPlace | null {
  if (resolution.requiresConfirmation) return null;
  if (resolution.confidence !== 'high') return null;
  if (resolution.boundaryRisk) return null;
  const inArea = resolution.candidates.filter((c: GeoCandidate) => c.withinResolvedArea);
  if (inArea.length !== 1) return null;
  return inArea[0].place;
}
