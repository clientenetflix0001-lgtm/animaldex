// ============================================================
// Modelo geográfico único de Animaldex.
// ============================================================
// Regla de identidad: el nombre mostrado NUNCA es el identificador. La identidad
// es `placeId`, cualificado por país y proveedor, para que agregar otro país sea
// sumar un adapter y no rehacer Alertas, Mercado, Adopciones, Páginas ni Feed.
//
// `admin1` y `admin2` son niveles administrativos GENÉRICOS. En Argentina hoy
// significan provincia y departamento, pero nada en el modelo depende de eso:
// usá ADMIN_LEVEL_LABELS para etiquetar según el país.
// ============================================================

/** Nivel administrativo 1 y 2, con etiqueta dependiente del país. */
export type AdminLevelLabels = { admin1: string; admin2: string };

export const ADMIN_LEVEL_LABELS: Record<string, AdminLevelLabels> = {
  AR: { admin1: 'Provincia', admin2: 'Departamento' },
};

export function adminLevelLabels(countryCode: string): AdminLevelLabels {
  return ADMIN_LEVEL_LABELS[countryCode] || { admin1: 'Región', admin2: 'Subdivisión' };
}

/**
 * Un lugar del catálogo normalizado. Es la única forma válida de una ubicación
 * administrativa persistible.
 */
export type GeoPlace = {
  /** Identidad cualificada: `<countryCode>:<provider>:<providerPlaceId>`. Ej. `AR:georef:66028050`. */
  placeId: string;
  countryCode: string;
  provider: string;
  /** Identificador del lugar en el proveedor. Para AR, el id INDEC de localidad censal. */
  providerPlaceId: string;
  /** Solo para mostrar. Nunca para comparar ni filtrar. */
  localityName: string;
  admin1Code: string;
  admin1Name: string;
  admin2Code: string;
  admin2Name: string;
  /**
   * Gobierno local. Falta en ~33% del catálogo argentino, incluso en localidades
   * cabecera. Es SOLO señal de ranking: usarlo como filtro excluyente descarta
   * la respuesta correcta (ver el caso Cerrillos en los tests).
   */
  governmentLocalCode?: string | null;
  governmentLocalName?: string | null;
  /** Centroide del lugar. Público: sirve para ordenar por cercanía sin exponer al usuario. */
  centroidLat: number;
  centroidLng: number;
};

/**
 * Área administrativa resuelta por contención de polígono en el proveedor
 * oficial. admin1 y admin2 son confiables; governmentLocal puede venir nulo.
 */
export type AdministrativeArea = {
  countryCode: string;
  provider: string;
  admin1Code: string;
  admin1Name: string;
  admin2Code: string;
  admin2Name: string;
  governmentLocalCode?: string | null;
  governmentLocalName?: string | null;
};

/**
 * `high` sólo cuando hay un único candidato inequívoco dentro del área oficial y
 * no hay riesgo de borde. Todo lo demás exige confirmación humana (Fase 3).
 */
export type GeoConfidence = 'high' | 'medium' | 'low';

export type GeoCandidate = {
  place: GeoPlace;
  /** Distancia al punto consultado, o null si se resolvió sin coordenadas. */
  distanceKm: number | null;
  /** true si el candidato pertenece al área administrativa oficial resuelta. */
  withinResolvedArea: boolean;
  /** true si además coincide el gobierno local. Señal de ranking, no de filtro. */
  governmentLocalMatch: boolean;
};

export type GeoResolutionSource =
  /** Área obtenida del proveedor oficial por contención de polígono. */
  | 'official'
  /** Sin red o sin área oficial: candidatos por centroide cercano del catálogo local. */
  | 'offline-fallback';

export type GeoResolutionReason =
  | 'single-candidate'
  | 'corroborated-nearest'
  | 'clear-nearest'
  | 'multiple-candidates'
  | 'boundary-risk'
  | 'area-without-places'
  | 'offline-fallback'
  | 'no-candidates';

/** Resultado de resolver coordenadas. Nunca afirma un lugar por su cuenta. */
export type PlaceResolution = {
  administrativeArea: AdministrativeArea | null;
  candidates: GeoCandidate[];
  confidence: GeoConfidence;
  /** Si es true, la UI debe pedir confirmación antes de persistir (Fase 3). */
  requiresConfirmation: boolean;
  source: GeoResolutionSource;
  /**
   * true cuando el punto puede estar cerca de un límite administrativo: la celda
   * de redondeo podría cruzarlo, o el lugar más cercano pertenece a otra área.
   */
  boundaryRisk: boolean;
  /**
   * true cuando el gobierno local del candidato principal coincide con el que
   * resolvió el proveedor por polígono. Es corroboración oficial, y por eso el
   * único camino a `high` cuando el área tiene más de una localidad. Un gobierno
   * local nulo en el candidato nunca cuenta como evidencia en contra.
   */
  governmentLocalCorroborated: boolean;
  reason: GeoResolutionReason;
};

export type GeoTextMatchTier =
  | 'exact'
  | 'alias'
  | 'starts-with'
  | 'word'
  | 'token-prefix'
  | 'substring';

export type GeoTextMatch = {
  place: GeoPlace;
  tier: GeoTextMatchTier;
  distanceKm: number | null;
};

/** Resultado de una búsqueda por texto. `ambiguous` obliga a desambiguar en UI. */
export type GeoSearchResult = {
  query: string;
  normalizedQuery: string;
  matches: GeoTextMatch[];
  /** Cantidad de lugares cuyo nombre normalizado es exactamente la consulta. */
  exactCount: number;
  /** true si no hay un único ganador claro. Nunca elegir en silencio. */
  ambiguous: boolean;
  truncated: boolean;
};

/** Contexto territorial conocido, para desambiguar texto y aliases. */
export type GeoContext = {
  countryCode?: string;
  admin1Code?: string | null;
  /** Nombre de nivel 1 tal como está guardado hoy (ej. la columna `province`). */
  admin1Name?: string | null;
  admin2Code?: string | null;
  nearLat?: number | null;
  nearLng?: number | null;
};

export type GeoCatalogMeta = {
  geoCatalogVersion: string;
  countryCode: string;
  provider: string;
  source: string;
  sourceUrl: string;
  sourceVersion: string;
  sourceDataset: string;
  license: string;
  licenseUrl: string;
  /** Texto de atribución CC BY 4.0. Obligatorio en cualquier UI que muestre estos datos. */
  attribution: string;
  modified: boolean;
  modificationNote: string;
  generatedAt: string;
  counts: { places: number; admin1: number; admin2: number; governmentLocal: number };
};

/**
 * Fila compacta del snapshot:
 * [providerPlaceId, localityName, admin1Code, admin2Code, governmentLocalCode|null, lat, lng]
 *
 * Se guarda como tupla y no como objeto para no repetir las claves 4022 veces.
 */
export type GeoCatalogRow = [
  string,
  string,
  string,
  string,
  string | null,
  number,
  number,
];

/** Snapshot generado por scripts/geo/build-catalog.mjs. No editar a mano. */
export type GeoCatalogSnapshot = GeoCatalogMeta & {
  admin1: Record<string, string>;
  admin2: Record<string, string>;
  governmentLocal: Record<string, string>;
  placeFields: string[];
  places: GeoCatalogRow[];
};
