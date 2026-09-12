// ============================================================
// Animaldex — escritura de la identidad territorial normalizada.
// ============================================================
// Fase 3 empieza a guardar el GeoPlace elegido por el usuario junto a los
// campos de texto que ya existían. Dos reglas gobiernan este módulo:
//
//   1. NO SE CONFÍA EN EL CLIENTE. El único dato que se acepta es el placeId;
//      la provincia y el departamento se derivan del catálogo del servidor.
//      Un placeId que no exista se descarta, no se guarda "como venga".
//
//   2. NO SE ASUME EL ESQUEMA. Las columnas se detectan con PRAGMA
//      table_info y, si todavía no están, la escritura sigue funcionando sin
//      ellas. Así el Worker puede desplegarse antes o después de aplicar
//      migrations/015 sin coordinar ambas cosas y sin que nada se rompa.
//      Este módulo NUNCA ejecuta ALTER TABLE.
// ============================================================

import { placeById } from '../lib/geoplace/catalog.ts';

/** Columnas aditivas de identidad territorial, en orden fijo. */
export const GEO_WRITE_COLUMNS = ['place_id', 'admin1_code', 'admin2_code'];

const EMPTY_PLACE = { placeId: null, admin1Code: null, admin2Code: null };

/**
 * Valida el placeId recibido contra el catálogo oficial.
 *
 * Los códigos admin1/admin2 que manda el cliente se ignoran a propósito: se
 * leen del catálogo para que no puedan quedar inconsistentes con el placeId.
 */
export function normalizeIncomingPlace(body) {
  const raw = body && body.placeId;
  if (raw == null || raw === '') return EMPTY_PLACE;
  const place = placeById(String(raw).slice(0, 80));
  if (!place) return EMPTY_PLACE;
  return {
    placeId: place.placeId,
    admin1Code: place.admin1Code,
    admin2Code: place.admin2Code,
  };
}

/** true si el cliente mandó un placeId que el catálogo no reconoce. */
export function placeIdRejected(body) {
  const raw = body && body.placeId;
  if (raw == null || raw === '') return false;
  return !placeById(String(raw).slice(0, 80));
}

/**
 * Qué columnas de geo existen hoy en la tabla. Se cachea por isolate en `env`
 * porque el esquema no cambia durante la vida de un Worker.
 */
export async function geoColumns(env, table) {
  const cacheKey = `_geoColumns_${table}`;
  if (env[cacheKey]) return env[cacheKey];
  let present = [];
  try {
    const res = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
    const names = new Set((res.results || []).map((r) => String(r.name)));
    present = GEO_WRITE_COLUMNS.filter((c) => names.has(c));
  } catch (_) {
    present = [];
  }
  env[cacheKey] = present;
  return present;
}

function valueFor(column, place) {
  if (column === 'place_id') return place.placeId;
  if (column === 'admin1_code') return place.admin1Code;
  return place.admin2Code;
}

/**
 * Fragmento para un INSERT: nombres de columna, placeholders y valores, todo
 * vacío cuando las columnas todavía no existen.
 */
export async function geoInsertFragment(env, table, place) {
  const columns = await geoColumns(env, table);
  if (!columns.length) return { columns: '', placeholders: '', values: [] };
  return {
    columns: `, ${columns.join(', ')}`,
    placeholders: `, ${columns.map(() => '?').join(', ')}`,
    values: columns.map((c) => valueFor(c, place)),
  };
}

/**
 * Fragmento para un UPDATE. `place.placeId === null` significa "el usuario no
 * eligió nada en esta edición", así que se conserva lo guardado con COALESCE
 * en vez de borrarlo.
 */
export async function geoUpdateFragment(env, table, place) {
  const columns = await geoColumns(env, table);
  if (!columns.length) return { sql: '', values: [] };
  if (!place.placeId) return { sql: '', values: [] };
  return {
    sql: `, ${columns.map((c) => `${c} = ?`).join(', ')}`,
    values: columns.map((c) => valueFor(c, place)),
  };
}
