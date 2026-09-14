// ============================================================
// Animaldex — Modo del filtro de localidad en Alertas.
// ============================================================
// Puro: sin AsyncStorage, sin GPS, sin React Native. Distingue si el
// filtro se obtuvo con "Usar mi ubicación actual" o se eligió a mano
// para explorar otro lugar.
// ============================================================

export type AlertsLocalitySource = 'auto' | 'manual';

export type AlertsLocalityIdentity = {
  placeId?: string | null;
  locality: string;
  province: string | null;
};

/** Guardados viejos sin `source` se tratan como automáticos. */
export function parseAlertsLocalitySource(raw: unknown): AlertsLocalitySource {
  return raw === 'manual' ? 'manual' : 'auto';
}

export function shouldRefreshAlertsLocalityOnEnter(source: AlertsLocalitySource): boolean {
  return source === 'auto';
}

/**
 * True cuando la detección actual apunta a otro municipio/departamento
 * que el filtro mostrado. Compara `placeId` si ambos lo tienen.
 */
export function alertsLocalityNeedsReplace(
  displayed: AlertsLocalityIdentity | null,
  detected: AlertsLocalityIdentity
): boolean {
  if (!displayed) return true;
  if (displayed.placeId && detected.placeId) return displayed.placeId !== detected.placeId;
  return (
    displayed.locality !== detected.locality || (displayed.province || '') !== (detected.province || '')
  );
}
