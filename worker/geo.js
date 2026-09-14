// ============================================================
// Animaldex — endpoint geográfico del Worker.
// ============================================================
// La app NUNCA llama a Georef directamente. Pasa por acá porque:
//   - la cuota oficial de Georef es 10/s, 40/min, 2000/h y 10.000/día, así que
//     hace falta una caché compartida entre todos los usuarios;
//   - el redondeo a celda debe ocurrir del lado del servidor para que la
//     coordenada exacta del usuario no viaje a un tercero;
//   - la política de "no adivinar" tiene que estar en un solo lugar.
//
// Flujo: coordenada -> celda de ~1 km -> caché -> Georef v2.1 /ubicacion ->
// provincia + departamento oficiales -> catálogo Animaldex -> candidatos.
//
// La app entra por `lib/placeLocate.ts`, que llama a `db.geoResolveCoords`.
// ============================================================

import { geoCell, coarseCoord, GEO_CELL_KM } from '../lib/geoplace/cell.ts';
import { placeFromCoords } from '../lib/geoplace/resolve.ts';
import {
  GEO_ATTRIBUTION,
  GEO_CATALOG_VERSION,
  GEO_COUNTRY_CODE,
  GEO_PROVIDER,
  geoCatalogMeta,
  placeById,
  searchPlaces,
} from '../lib/geoplace/catalog.ts';
import { validGeoPoint } from '../lib/geoplace/normalize.ts';

// v1.0 está anunciada como discontinuada: la versión queda fijada.
const GEOREF_BASE = 'https://apis.datos.gob.ar/georef/api/v2.1';
const GEOREF_TIMEOUT_MS = 4000;

/** Los límites administrativos cambian muy poco: TTL largo. */
export const GEO_AREA_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Subir esto invalida la caché de áreas sin tocar la versión del catálogo. */
export const GEO_AREA_CACHE_VERSION = 'v1';

/**
 * Guarda grueso contra un pico de consumo de cuota. Es por isolate, no global:
 * un límite realmente global necesitaría estado durable y queda fuera de esta
 * fase. La defensa principal es la caché, no este contador.
 */
const UPSTREAM_MAX_PER_MINUTE = 20;
const MEMORY_CACHE_MAX = 500;

const memoryCache = new Map();
let upstreamWindowStart = 0;
let upstreamWindowCount = 0;

function memoryGet(key) {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return hit.area;
}

function memorySet(key, area) {
  if (memoryCache.size >= MEMORY_CACHE_MAX) {
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) memoryCache.delete(oldest);
  }
  memoryCache.set(key, { area, expiresAt: Date.now() + GEO_AREA_CACHE_TTL_SECONDS * 1000 });
}

function cacheUrl(cellKey) {
  // URL sintética: la Cache API necesita una request http(s) como clave.
  // Incluye la versión del catálogo y de la caché para invalidar por versionado.
  const version = encodeURIComponent(`${GEO_CATALOG_VERSION}|${GEO_AREA_CACHE_VERSION}`);
  return `https://geo.animaldex.internal/area/${version}/${encodeURIComponent(cellKey)}`;
}

async function edgeCacheGet(cellKey) {
  if (typeof caches === 'undefined' || !caches.default) return null;
  try {
    const hit = await caches.default.match(new Request(cacheUrl(cellKey)));
    if (!hit) return null;
    const body = await hit.json();
    return body && body.admin1Code ? body : null;
  } catch (_) {
    return null;
  }
}

async function edgeCachePut(cellKey, area) {
  if (typeof caches === 'undefined' || !caches.default) return;
  try {
    await caches.default.put(
      new Request(cacheUrl(cellKey)),
      new Response(JSON.stringify(area), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${GEO_AREA_CACHE_TTL_SECONDS}`,
        },
      })
    );
  } catch (_) {
    // La caché es una optimización: si falla, se sigue.
  }
}

function upstreamBudgetAvailable(now) {
  if (now - upstreamWindowStart >= 60_000) {
    upstreamWindowStart = now;
    upstreamWindowCount = 0;
  }
  return upstreamWindowCount < UPSTREAM_MAX_PER_MINUTE;
}

/**
 * Consulta el área administrativa del CENTRO DE LA CELDA, nunca la coordenada
 * exacta del usuario.
 */
async function fetchAreaFromGeoref(cell) {
  const url = `${GEOREF_BASE}/ubicacion?lat=${cell.centerLat}&lon=${cell.centerLng}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEOREF_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const body = await res.json();
    const u = body && body.ubicacion;
    if (!u || !u.provincia || !u.provincia.id || !u.departamento || !u.departamento.id) return null;
    return {
      countryCode: GEO_COUNTRY_CODE,
      provider: GEO_PROVIDER,
      admin1Code: String(u.provincia.id),
      admin1Name: String(u.provincia.nombre || ''),
      admin2Code: String(u.departamento.id),
      admin2Name: String(u.departamento.nombre || ''),
      // Puede venir nulo. Se guarda como señal de ranking, nunca como filtro.
      governmentLocalCode: u.gobierno_local && u.gobierno_local.id ? String(u.gobierno_local.id) : null,
      governmentLocalName: u.gobierno_local && u.gobierno_local.nombre ? String(u.gobierno_local.nombre) : null,
    };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Resuelve el área de una celda: memoria, borde, upstream. En ese orden. */
export async function resolveCellArea(cell, options = {}) {
  const fromMemory = memoryGet(cell.key);
  if (fromMemory) return { area: fromMemory, cacheHit: 'memory' };

  const fromEdge = await edgeCacheGet(cell.key);
  if (fromEdge) {
    memorySet(cell.key, fromEdge);
    return { area: fromEdge, cacheHit: 'edge' };
  }

  // Solo las sesiones autenticadas pueden gastar cuota upstream. Sin sesión se
  // responde con lo que haya en caché, o con el fallback offline.
  if (!options.allowUpstream) return { area: null, cacheHit: 'miss', upstream: 'skipped-unauthenticated' };
  if (!upstreamBudgetAvailable(Date.now())) return { area: null, cacheHit: 'miss', upstream: 'skipped-budget' };

  upstreamWindowCount += 1;
  const area = await fetchAreaFromGeoref(cell);
  if (!area) return { area: null, cacheHit: 'miss', upstream: 'failed' };

  memorySet(cell.key, area);
  await edgeCachePut(cell.key, area);
  return { area, cacheHit: 'miss', upstream: 'ok' };
}

function serializeCandidate(candidate) {
  return {
    placeId: candidate.place.placeId,
    localityName: candidate.place.localityName,
    admin1Code: candidate.place.admin1Code,
    admin1Name: candidate.place.admin1Name,
    admin2Code: candidate.place.admin2Code,
    admin2Name: candidate.place.admin2Name,
    governmentLocalCode: candidate.place.governmentLocalCode || null,
    governmentLocalName: candidate.place.governmentLocalName || null,
    centroidLat: candidate.place.centroidLat,
    centroidLng: candidate.place.centroidLng,
    distanceKm: candidate.distanceKm,
    withinResolvedArea: candidate.withinResolvedArea,
    governmentLocalMatch: candidate.governmentLocalMatch,
  };
}

/**
 * POST /geo
 *   { action: 'resolveCoords', lat, lon }
 *   { action: 'searchPlaces', query, admin1Code?, limit? }
 *   { action: 'placeById', placeId }
 *   { action: 'catalog' }
 *
 * Nunca se registran ni se devuelven las coordenadas exactas recibidas: solo el
 * centro de celda, y redondeado.
 */
export async function handleGeo(request, env, json, authUser) {
  const body = await request.json().catch(() => ({}));
  const action = String((body && body.action) || '').slice(0, 40);

  if (action === 'catalog') {
    return json({ ok: true, catalog: geoCatalogMeta(), attribution: GEO_ATTRIBUTION });
  }

  if (action === 'searchPlaces') {
    const result = searchPlaces(body.query, {
      admin1Code: body.admin1Code ? String(body.admin1Code) : undefined,
      limit: Number.isFinite(body.limit) ? Math.min(25, Math.max(1, Number(body.limit))) : undefined,
    });
    return json({
      ok: true,
      query: result.query,
      ambiguous: result.ambiguous,
      exactCount: result.exactCount,
      truncated: result.truncated,
      matches: result.matches.map((m) => ({
        placeId: m.place.placeId,
        localityName: m.place.localityName,
        admin1Code: m.place.admin1Code,
        admin1Name: m.place.admin1Name,
        admin2Code: m.place.admin2Code,
        admin2Name: m.place.admin2Name,
        tier: m.tier,
      })),
      catalogVersion: GEO_CATALOG_VERSION,
      attribution: GEO_ATTRIBUTION,
    });
  }

  if (action === 'placeById') {
    const place = placeById(body.placeId);
    if (!place) return json({ error: 'Lugar desconocido' }, 404);
    return json({ ok: true, place, catalogVersion: GEO_CATALOG_VERSION, attribution: GEO_ATTRIBUTION });
  }

  if (action === 'resolveCoords') {
    const lat = Number(body.lat);
    const lon = Number(body.lon ?? body.lng);
    if (!validGeoPoint(lat, lon)) return json({ error: 'Coordenadas inválidas' }, 400);

    const cell = geoCell(lat, lon, GEO_CELL_KM);
    if (!cell) return json({ error: 'Coordenadas inválidas' }, 400);

    // La sesión es opcional: sin ella se responde desde caché o con el fallback.
    let allowUpstream = false;
    try {
      allowUpstream = !!(await authUser(request, env, body));
    } catch (_) {
      allowUpstream = false;
    }

    const { area, cacheHit, upstream } = await resolveCellArea(cell, { allowUpstream });
    const resolution = placeFromCoords({ lat, lng: lon, administrativeArea: area, cell });

    return json({
      ok: true,
      administrativeArea: resolution.administrativeArea,
      candidates: resolution.candidates.map(serializeCandidate),
      confidence: resolution.confidence,
      requiresConfirmation: resolution.requiresConfirmation,
      boundaryRisk: resolution.boundaryRisk,
      governmentLocalCorroborated: resolution.governmentLocalCorroborated,
      reason: resolution.reason,
      source: resolution.source,
      // Solo el centro de celda, y redondeado. La coordenada recibida no se devuelve.
      cell: {
        key: cell.key,
        km: cell.km,
        centerLat: coarseCoord(cell.centerLat),
        centerLng: coarseCoord(cell.centerLng),
        radiusKm: Number(cell.radiusKm.toFixed(3)),
      },
      cache: cacheHit,
      upstream: upstream || 'cached',
      catalogVersion: GEO_CATALOG_VERSION,
      attribution: GEO_ATTRIBUTION,
    });
  }

  return json({ error: 'Acción desconocida' }, 400);
}
