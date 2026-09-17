/**
 * Referencia manual de Crear Alerta (barrio/calle/punto).
 *
 * NO es identidad GEO. No entra al catálogo, no se geocodifica y no
 * reemplaza placeId / municipio / departamento. No filtra, no detecta
 * y no decide push.
 */

export const ALERT_LOCATION_REFERENCE_MAX = 120;
export const ALERT_LOCATION_REFERENCE_LABEL = 'Barrio, calle o referencia (opcional)';
export const ALERT_LOCATION_REFERENCE_PLACEHOLDER =
  'Ej: B° Tres Cerritos, Av. Bicentenario o cerca de la plaza';

export const ALERT_LOCATION_REFERENCE_COLUMN = 'location_reference';
export const ALERT_LOCATION_REFERENCE_D1_COLUMN = 'location_reference TEXT';

export function sanitizeAlertLocationReference(raw: string | null | undefined): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ALERT_LOCATION_REFERENCE_MAX);
}

export function persistableAlertLocationReference(raw: string | null | undefined): string | null {
  return sanitizeAlertLocationReference(raw) || null;
}

function present(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  return text ? text : undefined;
}

/** Línea de municipio/departamento. Nunca mezcla la referencia. */
export function municipalityLocationLine(
  locality?: string | null,
  province?: string | null
): string | undefined {
  const parts = [present(locality), present(province)].filter(Boolean) as string[];
  return parts.length ? parts.join(', ') : undefined;
}

/**
 * Display del flyer: municipio en la primera línea, referencia en la segunda.
 * Si no hay municipio, no se usa la referencia como ubicación.
 */
export function flyerLocationWithReference(
  locality?: string | null,
  province?: string | null,
  reference?: string | null
): string | undefined {
  const main = municipalityLocationLine(locality, province);
  if (!main) return undefined;
  const extra = sanitizeAlertLocationReference(reference);
  return extra ? `${main}\n${extra}` : main;
}

export function alertLocationDisplayLines(
  locality?: string | null,
  reference?: string | null
): string[] {
  const lines: string[] = [];
  const loc = present(locality);
  if (loc) lines.push(loc);
  const extra = sanitizeAlertLocationReference(reference);
  if (extra) lines.push(extra);
  return lines;
}

export function alertGeoFieldsWithReference<T extends Record<string, unknown>>(input: {
  locality: string;
  province?: string | null;
  placeId?: string | null;
  admin1Code?: string | null;
  admin2Code?: string | null;
  lat?: number | null;
  lon?: number | null;
  locationReference?: string | null;
  extra?: T;
}): {
  locality: string;
  province?: string;
  placeId: string | null;
  admin1Code: string | null;
  admin2Code: string | null;
  lat: number | null;
  lon: number | null;
  locationReference: string | null;
} & T {
  const extra = (input.extra ?? {}) as T;
  return {
    ...extra,
    locality: input.locality,
    province: input.province || undefined,
    placeId: input.placeId ?? null,
    admin1Code: input.admin1Code ?? null,
    admin2Code: input.admin2Code ?? null,
    lat: input.lat ?? null,
    lon: input.lon ?? null,
    locationReference: persistableAlertLocationReference(input.locationReference),
  };
}
