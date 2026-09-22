// Escritura opcional de alerts.breed_id.
// PRAGMA: si la columna no está, el INSERT sigue. NUNCA ejecuta ALTER TABLE.

import { ALERT_BREED_ID_COLUMN, persistableBreedId } from '../lib/breeds.ts';

export async function alertsHasBreedIdColumn(env) {
  const cacheKey = '_alertsBreedId';
  if (env[cacheKey] != null) return env[cacheKey];
  let present = false;
  try {
    const res = await env.DB.prepare('PRAGMA table_info(alerts)').all();
    const names = new Set((res.results || []).map((r) => String(r.name)));
    present = names.has(ALERT_BREED_ID_COLUMN);
  } catch (_) {
    present = false;
  }
  env[cacheKey] = present;
  return present;
}

export async function breedIdInsertFragment(env, raw, species) {
  const value = persistableBreedId(raw, species);
  const has = await alertsHasBreedIdColumn(env);
  if (!has) return { columns: '', placeholders: '', values: [], breedId: value };
  return {
    columns: `, ${ALERT_BREED_ID_COLUMN}`,
    placeholders: ', ?',
    values: [value],
    breedId: value,
  };
}
