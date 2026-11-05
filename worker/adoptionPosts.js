// ============================================================
// Animaldex Adopciones web — publicaciones sobre la tabla `alerts`.
// ============================================================
// No es un tercer sistema: cada publicación es una fila de `alerts` con
// type = 'adoption'. Lo nuevo son cuatro columnas opcionales
// (migrations/018_adoption_web_lifecycle.sql) y la tabla de tokens de
// gestión de publicaciones sin cuenta.
//
// Mientras la migración no esté aplicada:
//   - el muro funciona (lee alertas de adopción como hoy);
//   - publicar, pausar y la gestión sin cuenta responden 503;
//   - ningún feed existente cambia (los filtros de vigencia solo se agregan
//     cuando las columnas existen).
//
// Las filas antiguas tienen las columnas en NULL: no vencen ni se pausan.
// Este módulo no ejecuta ALTER TABLE.
// ============================================================

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { adoptionLocalityBySlug, DEFAULT_ADOPTION_SLUG } from '../lib/adoptionLocalities.ts';
import {
  ADOPTION_CYCLE_MS,
  ADOPTION_REPORT_HIDE_THRESHOLD,
  DEFAULT_TURNSTILE_HOSTNAMES,
  GUEST_ADOPTION_TTL_MS,
  GUEST_CLEANUP_BATCH_SIZE,
  GUEST_POSTS_GLOBAL_PER_HOUR,
  GUEST_POSTS_PER_IP_PER_DAY,
  GUEST_RATE_RETENTION_MS,
  TURNSTILE_ACTION,
  parseAdoptionMediaKind,
} from '../lib/adoptionLifecycle.ts';
import { parseProtectorAdoptionContact } from '../lib/adoptionContact.ts';
import { geoInsertFragment } from './geoWrite.js';
import { validateImageUpload } from './imageUpload.js';

const LIFECYCLE_COLUMNS = ['media_kind', 'is_guest', 'expires_at', 'paused_at'];
const GUEST_TOKENS_TABLE = 'adoption_guest_tokens';
const GUEST_RATE_TABLE = 'adoption_guest_rate';
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const SCHEMA_RECHECK_MS = 60 * 1000;
const WALL_SPECIES = new Set(['perro', 'gato', 'otro']);
const LIFECYCLE_UNAVAILABLE = 'Esta función todavía no está habilitada.';
const GUEST_UNAVAILABLE = 'Publicar sin cuenta todavía no está habilitado. Iniciá sesión para publicar.';
const NOT_OWNER = 'Esa publicación no es tuya';
const NOT_FOUND = 'Publicación no encontrada';
const MANAGE_INVALID = 'El enlace de gestión no es válido o la publicación ya no existe.';

// ---------- Esquema (sin ALTER) ----------

async function cachedSchemaCheck(env, key, probe) {
  const hit = env[key];
  if (hit && (hit.ok || Date.now() - hit.at < SCHEMA_RECHECK_MS)) return hit.ok;
  let ok = false;
  try {
    ok = await probe();
  } catch (_) {
    ok = false;
  }
  env[key] = { ok, at: Date.now() };
  return ok;
}

/** true cuando las cuatro columnas de ciclo de vida existen en `alerts`. */
export function adoptionLifecycleReady(env) {
  return cachedSchemaCheck(env, '_adoptionLifecycleColumns', async () => {
    const res = await env.DB.prepare('PRAGMA table_info(alerts)').all();
    const names = new Set((res.results || []).map((r) => String(r.name)));
    return LIFECYCLE_COLUMNS.every((c) => names.has(c));
  });
}

function tableReady(env, table) {
  return cachedSchemaCheck(env, `_adoptionTable_${table}`, async () => {
    const res = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .bind(table)
      .all();
    return (res.results || []).length > 0;
  });
}

/**
 * Condición de visibilidad para cualquier listado de alertas. Vacía cuando las
 * columnas no existen, así los feeds actuales no cambian antes de migrar.
 * Filas antiguas (NULL) siempre pasan.
 */
export async function alertVisibilitySql(env, alias, now) {
  if (!(await adoptionLifecycleReady(env))) return { sql: '', values: [] };
  return {
    sql: ` AND (${alias}.expires_at IS NULL OR ${alias}.expires_at > ?) AND ${alias}.paused_at IS NULL`,
    values: [now],
  };
}

/** Una publicación sin cuenta vencida deja de existir para el público. */
export function guestPostGone(row, now) {
  return !!(row && Number(row.is_guest) === 1 && row.expires_at != null && Number(row.expires_at) <= now);
}

// ---------- Utilidades ----------

function sha256Hex(s) {
  return createHash('sha256').update(String(s)).digest('hex');
}

function newManageToken() {
  return randomBytes(32).toString('base64url');
}

function tokenMatches(token, storedHash) {
  const a = Buffer.from(sha256Hex(token), 'hex');
  const b = Buffer.from(String(storedHash || ''), 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function requestIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || '';
}

/** La IP nunca se guarda en claro. */
function ipHash(env, ip) {
  const salt = env.GUEST_HASH_SALT || env.TURNSTILE_SECRET_KEY || 'animaldex';
  return sha256Hex(`${salt}|${ip || 'unknown'}`);
}

/** Entero positivo de una variable del Worker, con tope; si no, el valor por defecto. */
function positiveIntVar(raw, fallback, max) {
  const n = Number.parseInt(String(raw ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
}

export function guestLimits(env) {
  return {
    perIpPerDay: positiveIntVar(env.GUEST_POSTS_PER_IP_PER_DAY, GUEST_POSTS_PER_IP_PER_DAY, 1000),
    globalPerHour: positiveIntVar(env.GUEST_POSTS_GLOBAL_PER_HOUR, GUEST_POSTS_GLOBAL_PER_HOUR, 100000),
  };
}

export function turnstileAllowedHostnames(env) {
  const list = String(env.TURNSTILE_ALLOWED_HOSTNAMES || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : [...DEFAULT_TURNSTILE_HOSTNAMES];
}

/**
 * Valida el token con siteverify. Exige: success, hostname dentro de la lista
 * autorizada y la acción de este formulario. Ante cualquier error, rechaza.
 */
export async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET_KEY) return { ok: false, unavailable: true };
  const t = typeof token === 'string' ? token : '';
  if (!t || t.length > 2048 || !/^\S+$/.test(t)) return { ok: false };
  try {
    const form = new FormData();
    form.append('secret', env.TURNSTILE_SECRET_KEY);
    form.append('response', t);
    if (ip) form.append('remoteip', ip);
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    if (!resp.ok) return { ok: false };
    const data = await resp.json().catch(() => ({}));
    if (data.success !== true) return { ok: false };
    const hostname = String(data.hostname || '').toLowerCase();
    if (!turnstileAllowedHostnames(env).includes(hostname)) return { ok: false };
    if (data.action !== TURNSTILE_ACTION) return { ok: false };
    return { ok: true };
  } catch (_) {
    return { ok: false };
  }
}

/**
 * Reserva un lugar en el registro de límites antes de subir nada. La fila se
 * inserta primero y después se cuenta, así dos pedidos simultáneos no pasan
 * los dos. Si se supera el límite, la propia fila se retira. Eliminar una
 * publicación no toca este registro.
 */
async function reserveGuestSlot(env, deps, ipKey, now) {
  const limits = guestLimits(env);
  const id = `gr-${now}-${randomBytes(6).toString('hex')}`;
  await deps.d1(env, `INSERT INTO ${GUEST_RATE_TABLE} (id, ip_hash, created_at) VALUES (?, ?, ?)`, [id, ipKey, now]);
  const [mine, global] = await Promise.all([
    deps.d1(env, `SELECT COUNT(*) AS n FROM ${GUEST_RATE_TABLE} WHERE ip_hash = ? AND created_at > ?`, [ipKey, now - DAY_MS]),
    deps.d1(env, `SELECT COUNT(*) AS n FROM ${GUEST_RATE_TABLE} WHERE created_at > ?`, [now - HOUR_MS]),
  ]);
  let error = null;
  if (Number(mine[0]?.n || 0) > limits.perIpPerDay) {
    const n = limits.perIpPerDay;
    error = `Llegaste al límite de ${n} ${n === 1 ? 'publicación' : 'publicaciones'} sin cuenta en 24 horas. Volvé a intentar mañana o creá una cuenta para publicar más.`;
  } else if (Number(global[0]?.n || 0) > limits.globalPerHour) {
    error = 'Hay muchas publicaciones en este momento. Probá de nuevo en un rato.';
  }
  if (error) {
    await deps.d1(env, `DELETE FROM ${GUEST_RATE_TABLE} WHERE id = ?`, [id]).catch(() => {});
    return { ok: false, error };
  }
  return { ok: true };
}

function cityPlace(body) {
  return adoptionLocalityBySlug(body.citySlug || DEFAULT_ADOPTION_SLUG);
}

function lifecycleFields(row) {
  return {
    mediaKind: parseAdoptionMediaKind(row.media_kind),
    isGuest: Number(row.is_guest) === 1,
    expiresAt: row.expires_at != null ? Number(row.expires_at) : null,
    pausedAt: row.paused_at != null ? Number(row.paused_at) : null,
  };
}

const CF_IMAGE_URL_RE = /^https:\/\/imagedelivery\.net\/[^/]+\/([^/]+)\//;

/**
 * Borra de Cloudflare Images las imágenes que ya ninguna fila usa. Se llama
 * después de borrar las filas: si otra alerta o post comparte la URL, la
 * imagen se conserva.
 */
async function deleteUnusedImages(env, deps, urls) {
  const candidates = [...new Set(urls.map((u) => String(u || '')).filter((u) => CF_IMAGE_URL_RE.test(u)))];
  if (!candidates.length || !env.CF_ACCOUNT_ID || !env.CF_IMAGES_TOKEN) return;
  const ph = candidates.map(() => '?').join(',');
  const used = new Set();
  try {
    for (const r of await deps.d1(env, `SELECT image FROM alerts WHERE image IN (${ph})`, candidates)) used.add(r.image);
    if (await tableReady(env, 'posts')) {
      for (const r of await deps.d1(env, `SELECT image FROM posts WHERE image IN (${ph})`, candidates)) used.add(r.image);
    }
  } catch (_) {
    return;
  }
  for (const url of candidates) {
    if (used.has(url)) continue;
    const imageId = url.match(CF_IMAGE_URL_RE)[1];
    try {
      await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1/${imageId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${env.CF_IMAGES_TOKEN}` },
      });
    } catch (_) {}
  }
}

/**
 * Borra publicaciones de adopción con sus likes, comentarios, denuncias y
 * token, en una sola transacción D1. El registro de límites no se toca.
 * Solo se borran imágenes subidas por esta sección (media_kind no nulo).
 */
async function deleteAdoptionRows(env, deps, rows) {
  if (!rows.length) return;
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => '?').join(',');
  const statements = [
    env.DB.prepare(`DELETE FROM alert_likes WHERE alert_id IN (${ph})`).bind(...ids),
    env.DB.prepare(`DELETE FROM alert_comments WHERE alert_id IN (${ph})`).bind(...ids),
  ];
  if (await tableReady(env, 'content_reports')) {
    statements.push(env.DB.prepare(`DELETE FROM content_reports WHERE target_type = 'alert' AND target_id IN (${ph})`).bind(...ids));
  }
  if (await tableReady(env, GUEST_TOKENS_TABLE)) {
    statements.push(env.DB.prepare(`DELETE FROM ${GUEST_TOKENS_TABLE} WHERE alert_id IN (${ph})`).bind(...ids));
  }
  statements.push(env.DB.prepare(`DELETE FROM alerts WHERE id IN (${ph})`).bind(...ids));
  await env.DB.batch(statements);
  await deleteUnusedImages(env, deps, rows.filter((r) => r.media_kind).map((r) => r.image));
}

function deleteAdoptionRow(env, deps, row) {
  return deleteAdoptionRows(env, deps, [row]);
}

async function loadOne(env, deps, alertId, viewerId) {
  const rows = await deps.d1(env, `${deps.ALERT_SELECT} WHERE a.id = ?`, [alertId]);
  if (!rows[0]) return null;
  const [alert] = await deps.attachLikedFlags(env, rows, viewerId);
  return { row: rows[0], alert };
}

async function guestTokenRow(env, deps, alertId, token) {
  if (!(await tableReady(env, GUEST_TOKENS_TABLE))) return null;
  const rows = await deps.d1(env, `SELECT * FROM ${GUEST_TOKENS_TABLE} WHERE alert_id = ? LIMIT 1`, [alertId]);
  if (!rows[0] || !tokenMatches(token, rows[0].token_hash)) return null;
  return rows[0];
}

function cleanToken(raw) {
  const s = String(raw || '');
  return /^[A-Za-z0-9_-]{32,128}$/.test(s) ? s : '';
}

// ---------- Acciones públicas (antes del control de sesión) ----------

/**
 * deps: { d1, json, clean, authUser, ALERT_SELECT, attachLikedFlags,
 *         requestTerritoryCondition, uploadCheckedImage }
 */
export async function handlePublicAdoptionAction(env, request, body, action, now, deps) {
  const { json, clean } = deps;

  if (action === 'adoptionWall') {
    const place = cityPlace(body);
    if (!place) return json({ error: 'Localidad no habilitada' }, 404);
    const territorial = await deps.requestTerritoryCondition(
      env,
      'alerts',
      'a',
      { placeId: place.placeId, territoryScope: 'locality' },
      place.locality,
      place.province
    );
    if (!territorial) return json({ error: 'Localidad no habilitada' }, 404);
    const before = Number(body.before) || now + 1000;
    const limit = Math.min(Number(body.limit) || 12, 30);
    const viewerId = await deps.authUser(request, env, body);
    const visibility = await alertVisibilitySql(env, 'a', now);
    const reported = (await tableReady(env, 'content_reports'))
      ? ` AND (SELECT COUNT(DISTINCT cr.user_id) FROM content_reports cr
               WHERE cr.target_type = 'alert' AND cr.target_id = a.id) < ${ADOPTION_REPORT_HIDE_THRESHOLD}`
      : '';
    const rows = await deps.d1(
      env,
      `${deps.ALERT_SELECT} WHERE ${territorial.sql}
         AND a.type = 'adoption'
         AND (a.status IS NULL OR a.status = 'active')
         AND a.resolved_at IS NULL
         ${visibility.sql}
         ${reported}
         AND COALESCE(a.renewed_at, a.created_at) < ?
       ORDER BY COALESCE(a.renewed_at, a.created_at) DESC
       LIMIT ?`,
      [...territorial.values, ...visibility.values, before, limit + 1]
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const alerts = await deps.attachLikedFlags(env, page, viewerId);
    return json({ ok: true, alerts, hasMore, locality: place.locality });
  }

  if (action === 'createAdoptionPost') {
    const place = cityPlace(body);
    if (!place) return json({ error: 'Localidad no habilitada' }, 400);
    if (!(await adoptionLifecycleReady(env))) return json({ error: LIFECYCLE_UNAVAILABLE }, 503);
    if (!env.CF_ACCOUNT_ID || !env.CF_IMAGES_TOKEN) return json({ error: 'La carga de imágenes no está disponible' }, 503);

    const mediaKind = parseAdoptionMediaKind(body.mediaKind);
    if (!mediaKind) return json({ error: 'Elegí cómo publicar' }, 400);

    const userId = await deps.authUser(request, env, body);
    const ip = requestIp(request);
    const ipKey = ipHash(env, ip);
    const isGuest = !userId;

    if (isGuest) {
      if (!(await tableReady(env, GUEST_TOKENS_TABLE)) || !(await tableReady(env, GUEST_RATE_TABLE))) {
        return json({ error: GUEST_UNAVAILABLE }, 503);
      }
      const human = await verifyTurnstile(env, body.turnstileToken, ip);
      if (human.unavailable) return json({ error: GUEST_UNAVAILABLE }, 503);
      if (!human.ok) return json({ error: 'No pudimos verificar que no seas un robot. Probá de nuevo.' }, 403);
      const slot = await reserveGuestSlot(env, deps, ipKey, now);
      if (!slot.ok) return json({ error: slot.error }, 429);
    }
    if (deps.uploadLimited(userId || 'guest', ip, now)) {
      return json({ error: 'Demasiadas imágenes seguidas. Esperá un momento.' }, 429);
    }

    let petName = null;
    let species = 'otro';
    let sex = null;
    let description = '';
    let contactWhatsapp = null;
    let contactPhone = null;
    if (mediaKind === 'photo') {
      petName = clean(body.petName, 40) || null;
      const sp = clean(body.species, 20);
      species = WALL_SPECIES.has(sp) ? sp : 'perro';
      sex = body.sex === 'macho' || body.sex === 'hembra' ? body.sex : null;
      description = clean(body.description, 600);
      const contact = parseProtectorAdoptionContact('protector', body.contactWhatsapp, body.contactPhone);
      if (!contact.ok) return json({ error: contact.error || 'Agregá un WhatsApp o teléfono de contacto' }, 400);
      contactWhatsapp = contact.whatsapp;
      contactPhone = contact.phone;
    }

    // La imagen viaja con la publicación y se sube acá: no quedan imágenes
    // huérfanas en Cloudflare si el formulario se abandona.
    const checked = validateImageUpload(body.image);
    if (!checked.ok) return json({ error: checked.error }, checked.status);
    const uploaded = await deps.uploadCheckedImage(env, checked);
    if (!uploaded.ok) return json({ error: uploaded.error }, 502);

    const id = `alert-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const authorId = isGuest ? `guest:${randomBytes(12).toString('hex')}` : userId;
    const expiresAt = now + (isGuest ? GUEST_ADOPTION_TTL_MS : ADOPTION_CYCLE_MS);
    const geo = await geoInsertFragment(env, 'alerts', {
      placeId: place.placeId,
      admin1Code: place.admin1Code,
      admin2Code: place.admin2Code,
    });
    try {
      await deps.d1(
        env,
        `INSERT INTO alerts (id, user_id, type, status, pet_name, species, breed, description, image, locality, province, country, event_date, created_at, renewed_at, sex, contact_whatsapp, contact_phone, media_kind, is_guest, expires_at, paused_at${geo.columns})
         VALUES (?, ?, 'adoption', 'active', ?, ?, '', ?, ?, ?, ?, 'AR', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL${geo.placeholders})`,
        [id, authorId, petName, species, description, uploaded.url, place.locality, place.province, now, now, now, sex, contactWhatsapp, contactPhone, mediaKind, isGuest ? 1 : 0, expiresAt, ...geo.values]
      );
    } catch (e) {
      await deleteUnusedImages(env, deps, [uploaded.url]);
      throw e;
    }

    let manageToken = null;
    if (isGuest) {
      manageToken = newManageToken();
      await deps.d1(
        env,
        `INSERT INTO ${GUEST_TOKENS_TABLE} (alert_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)`,
        [id, sha256Hex(manageToken), now, expiresAt]
      );
    }
    const loaded = await loadOne(env, deps, id, userId);
    // El token se devuelve una única vez, solo a quien publicó.
    return json({ ok: true, alert: loaded && loaded.alert, manageToken, expiresAt });
  }

  if (action === 'guestAdoptionStatus' || action === 'guestAdoptionDelete') {
    const alertId = clean(body.alertId, 80);
    const token = cleanToken(body.token);
    if (!alertId || !token) return json({ error: MANAGE_INVALID }, 404);
    const tok = await guestTokenRow(env, deps, alertId, token);
    if (!tok) return json({ error: MANAGE_INVALID }, 404);
    const loaded = await loadOne(env, deps, alertId, null);
    if (!loaded || Number(loaded.row.is_guest) !== 1) return json({ error: MANAGE_INVALID }, 404);
    if (action === 'guestAdoptionDelete') {
      await deleteAdoptionRow(env, deps, loaded.row);
      return json({ ok: true, deleted: true });
    }
    if (guestPostGone(loaded.row, now)) return json({ error: MANAGE_INVALID }, 404);
    return json({ ok: true, alert: loaded.alert, ...lifecycleFields(loaded.row) });
  }

  return null;
}

// ---------- Acciones con sesión ----------

export async function handleAuthAdoptionAction(env, body, action, now, userId, deps) {
  const { json, clean } = deps;

  if (action === 'myAdoptionPosts') {
    const rows = await deps.d1(
      env,
      `${deps.ALERT_SELECT} WHERE a.user_id = ? AND a.type = 'adoption'
       ORDER BY COALESCE(a.renewed_at, a.created_at) DESC
       LIMIT 50`,
      [userId]
    );
    const alerts = await deps.attachLikedFlags(env, rows, userId);
    return json({ ok: true, alerts });
  }

  if (
    action === 'pauseAdoptionPost' ||
    action === 'resumeAdoptionPost' ||
    action === 'renewAdoptionPost' ||
    action === 'deleteAdoptionPost'
  ) {
    const alertId = clean(body.alertId, 80);
    if (!alertId) return json({ error: 'Falta la publicación' }, 400);
    const owned = await deps.d1(env, 'SELECT * FROM alerts WHERE id = ?', [alertId]);
    const row = owned[0];
    if (!row || row.type !== 'adoption') return json({ error: NOT_FOUND }, 404);
    if (row.user_id !== userId) return json({ error: NOT_OWNER }, 403);

    if (action === 'deleteAdoptionPost') {
      await deleteAdoptionRow(env, deps, row);
      return json({ ok: true });
    }

    if (!(await adoptionLifecycleReady(env))) return json({ error: LIFECYCLE_UNAVAILABLE }, 503);
    if (row.resolved_at || row.status === 'resolved') return json({ error: 'La publicación ya fue finalizada' }, 400);
    const expired = row.expires_at != null && Number(row.expires_at) <= now;

    if (action === 'pauseAdoptionPost') {
      if (row.expires_at == null) return json({ error: 'Esta publicación se administra desde Mis alertas.' }, 400);
      if (expired) return json({ error: 'La publicación ya está vencida. Renovala para volver a mostrarla.' }, 400);
      await deps.d1(env, 'UPDATE alerts SET paused_at = ? WHERE id = ? AND paused_at IS NULL', [now, alertId]);
    } else if (action === 'resumeAdoptionPost') {
      if (expired) return json({ error: 'La publicación está vencida. Renovala para volver a mostrarla.' }, 400);
      await deps.d1(env, 'UPDATE alerts SET paused_at = NULL WHERE id = ?', [alertId]);
    } else {
      if (row.expires_at == null) {
        // Alerta de adopción anterior a esta sección: misma regla que renewAlert.
        const last = row.renewed_at || row.created_at;
        if (now - last < ADOPTION_CYCLE_MS) return json({ error: 'Todavía no pasaron 7 días desde la última renovación.' }, 400);
        await deps.d1(env, 'UPDATE alerts SET renewed_at = ?, renewal_notified_at = NULL, paused_at = NULL WHERE id = ?', [now, alertId]);
      } else {
        if (!expired) return json({ error: 'Podrás renovarla cuando termine el ciclo de 7 días.' }, 400);
        await deps.d1(
          env,
          'UPDATE alerts SET renewed_at = ?, renewal_notified_at = NULL, expires_at = ?, paused_at = NULL WHERE id = ?',
          [now, now + ADOPTION_CYCLE_MS, alertId]
        );
      }
    }
    const loaded = await loadOne(env, deps, alertId, userId);
    return json({ ok: true, alert: loaded && loaded.alert });
  }

  if (action === 'reportAlert') {
    const alertId = clean(body.alertId, 80);
    if (!alertId) return json({ error: 'Falta la publicación' }, 400);
    if (!(await tableReady(env, 'content_reports'))) return json({ error: LIFECYCLE_UNAVAILABLE }, 503);
    const exists = await deps.d1(env, 'SELECT id, user_id FROM alerts WHERE id = ?', [alertId]);
    if (!exists[0]) return json({ error: NOT_FOUND }, 404);
    if (exists[0].user_id === userId) return json({ error: 'No podés denunciar tu propia publicación' }, 400);
    const already = await deps.d1(
      env,
      "SELECT id FROM content_reports WHERE user_id = ? AND target_type = 'alert' AND target_id = ? LIMIT 1",
      [userId, alertId]
    );
    if (!already[0]) {
      await deps.d1(
        env,
        'INSERT INTO content_reports (id, user_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?, ?)',
        [`rpt-${now}-${Math.random().toString(36).slice(2, 8)}`, userId, 'alert', alertId, now]
      );
    }
    return json({ ok: true, reportType: 'alert', targetId: alertId });
  }

  return null;
}

/**
 * `renewAlert` (Android) sobre una publicación creada desde la sección web:
 * además de renewed_at, reinicia el ciclo. Sin efecto en filas antiguas.
 */
export async function renewAlertLifecycleSql(env, row, now) {
  if (!row || row.expires_at == null || Number(row.is_guest) === 1) return { sql: '', values: [] };
  if (!(await adoptionLifecycleReady(env))) return { sql: '', values: [] };
  return { sql: ', expires_at = ?, paused_at = NULL', values: [now + ADOPTION_CYCLE_MS] };
}

// ---------- Limpieza programada ----------

/**
 * Borra publicaciones sin cuenta vencidas (fila, likes, comentarios,
 * denuncias, token e imagen) por lotes. Nunca toca publicaciones de usuarios
 * registrados ni otras categorías. Corre en cada cron de 5 minutos (un lote)
 * y en el diario (varios lotes), así un atraso se absorbe sin pasar los
 * límites de subrequests de una invocación: cada lote son ~7 consultas D1 y
 * como máximo `batchSize` llamadas a Cloudflare Images.
 * Lo que todavía no se borró ya está oculto (alertVisibilitySql / guestPostGone).
 */
export async function cleanupExpiredGuestAdoptions(env, deps, now, opts = {}) {
  if (!(await adoptionLifecycleReady(env))) return { deleted: 0, batches: 0 };
  const batchSize = positiveIntVar(env.GUEST_CLEANUP_BATCH_SIZE, GUEST_CLEANUP_BATCH_SIZE, 50);
  const maxBatches = Math.max(1, opts.maxBatches || 1);
  const deadline = Date.now() + (opts.budgetMs || 15_000);
  let deleted = 0;
  let batches = 0;
  while (batches < maxBatches && Date.now() < deadline) {
    const rows = await deps.d1(
      env,
      `SELECT id, image, media_kind FROM alerts
       WHERE is_guest = 1 AND type = 'adoption' AND expires_at IS NOT NULL AND expires_at <= ?
       ORDER BY expires_at ASC LIMIT ?`,
      [now, batchSize]
    );
    if (!rows.length) break;
    batches += 1;
    try {
      await deleteAdoptionRows(env, deps, rows);
      deleted += rows.length;
    } catch (_) {
      break;
    }
    if (rows.length < batchSize) break;
  }
  if (opts.purgeRate && (await tableReady(env, GUEST_RATE_TABLE))) {
    await deps.d1(env, `DELETE FROM ${GUEST_RATE_TABLE} WHERE created_at < ?`, [now - GUEST_RATE_RETENTION_MS]).catch(() => {});
  }
  return { deleted, batches };
}
