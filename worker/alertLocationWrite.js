// Escritura opcional de alerts.location_reference.
// No es identidad GEO. PRAGMA: si la columna no está, el INSERT sigue.
// NUNCA ejecuta ALTER TABLE.

import {
  ALERT_LOCATION_REFERENCE_COLUMN,
  persistableAlertLocationReference,
} from '../lib/alertLocationReference.ts';

export async function alertsHasLocationReferenceColumn(env) {
  const cacheKey = '_alertsLocationReference';
  if (env[cacheKey] != null) return env[cacheKey];
  let present = false;
  try {
    const res = await env.DB.prepare('PRAGMA table_info(alerts)').all();
    const names = new Set((res.results || []).map((r) => String(r.name)));
    present = names.has(ALERT_LOCATION_REFERENCE_COLUMN);
  } catch (_) {
    present = false;
  }
  env[cacheKey] = present;
  return present;
}

export async function locationReferenceInsertFragment(env, raw) {
  const value = persistableAlertLocationReference(raw);
  if (value == null) return { columns: '', placeholders: '', values: [] };
  const has = await alertsHasLocationReferenceColumn(env);
  if (!has) return { columns: '', placeholders: '', values: [] };
  return { columns: `, ${ALERT_LOCATION_REFERENCE_COLUMN}`, placeholders: ', ?', values: [value] };
}
