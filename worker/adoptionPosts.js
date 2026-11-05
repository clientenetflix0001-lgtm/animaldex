// ============================================================
// Animaldex Adopciones web — publicaciones sobre la tabla `alerts`.
// ============================================================
// No es un tercer sistema: cada publicación es una fila de `alerts` con
// type = 'adoption'. Lo nuevo son tres columnas opcionales
// (migrations/018_adoption_web_lifecycle.sql). Publicar exige sesión.
//
// Mientras la migración no esté aplicada:
//   - el muro funciona (lee alertas de adopción como hoy);
//   - publicar y pausar responden 503;
//   - ningún feed existente cambia (los filtros de vigencia solo se agregan
//     cuando las columnas existen).
//
// Las filas antiguas tienen las columnas en NULL: no vencen ni se pausan.
// Este módulo no ejecuta ALTER TABLE.
// ============================================================

import { randomBytes } from 'node:crypto';
import { adoptionLocalityBySlug, DEFAULT_ADOPTION_SLUG } from '../lib/adoptionLocalities.ts';
import {
  ADOPTION_CYCLE_MS,
  ADOPTION_REPORT_HIDE_THRESHOLD,
  IMAGE_DELETE_BATCH_SIZE,
  IMAGE_DELETE_LEASE_MS,
  IMAGE_DELETE_MAX_ATTEMPTS,
  IMAGE_DELETE_MAX_PASSES,
  imageDeleteBackoffMs,
  parseAdoptionMediaKind,
} from '../lib/adoptionLifecycle.ts';
import { parseProtectorAdoptionContact } from '../lib/adoptionContact.ts';
import { geoInsertFragment } from './geoWrite.js';
import { validateImageUpload } from './imageUpload.js';

const LIFECYCLE_COLUMNS = ['media_kind', 'expires_at', 'paused_at'];
const IMAGE_DELETE_TABLE = 'adoption_image_deletions';
const SCHEMA_RECHECK_MS = 60 * 1000;
const WALL_SPECIES = new Set(['perro', 'gato', 'otro']);
const LIFECYCLE_UNAVAILABLE = 'Esta función todavía no está habilitada.';
const NOT_OWNER = 'Esa publicación no es tuya';
const NOT_FOUND = 'Publicación no encontrada';

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

function requestIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || '';
}

function cityPlace(body) {
  return adoptionLocalityBySlug(body.citySlug || DEFAULT_ADOPTION_SLUG);
}

const CF_IMAGE_URL_RE = /^https:\/\/imagedelivery\.net\/[^/]+\/([^/]+)\//;

function cloudflareImage(row) {
  if (!row || !row.media_kind) return null;
  const imageUrl = String(row.image || '');
  const match = imageUrl.match(CF_IMAGE_URL_RE);
  if (!match) return null;
  return { alertId: row.id || null, imageUrl, imageId: match[1] };
}

function dedupeImages(images) {
  const out = [];
  const seen = new Set();
  for (const image of images) {
    if (!image || seen.has(image.imageId)) continue;
    seen.add(image.imageId);
    out.push(image);
  }
  return out;
}

function pendingImageStatement(env, image, now) {
  const id = `imgdel-${now}-${randomBytes(4).toString('hex')}`;
  return env.DB.prepare(
    `INSERT INTO ${IMAGE_DELETE_TABLE}
       (id, image_url, image_id, alert_id, status, attempts, next_attempt_at, last_error, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 0, ?, NULL, ?, ?)`
  ).bind(id, image.imageUrl, image.imageId, image.alertId, now, now, now);
}

function queueUnavailable() {
  const err = new Error('IMAGE_DELETE_QUEUE_UNAVAILABLE');
  err.code = 'IMAGE_DELETE_QUEUE_UNAVAILABLE';
  return err;
}

function d1Changes(res) {
  const raw = res && res.meta ? res.meta.changes : undefined;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function clipError(raw) {
  return String(raw || 'error').replace(/\s+/g, ' ').slice(0, 300);
}

/** Cloudflare dijo, sin ambigüedad, que esa imagen no existe. */
function cloudflareImageMissing(data) {
  const err = data && Array.isArray(data.errors) ? data.errors[0] : null;
  if (!err) return false;
  return /not found|does not exist|no longer exists|already been deleted/i.test(String(err.message || ''));
}

/**
 * DELETE a Cloudflare Images. Confirma resp.ok y success.
 * 404, o un mensaje explícito de que no existe, cuenta como ya borrada.
 */
async function deleteCloudflareImage(env, imageId) {
  const resp = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1/${encodeURIComponent(imageId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${env.CF_IMAGES_TOKEN}` } }
  );
  if (resp.status === 404) return { gone: true };
  const text = await resp.text().catch(() => '');
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = null;
  }
  if (cloudflareImageMissing(data)) return { gone: true };
  if (!resp.ok || (data && data.success === false)) {
    const msg = (data && data.errors && data.errors[0] && data.errors[0].message) || text.slice(0, 180);
    return { ok: false, error: clipError(`HTTP ${resp.status}${msg ? `: ${msg}` : ''}`) };
  }
  return { ok: true };
}

/** URLs que todavía aparecen en alerts o posts. Si la consulta falla, no se borra nada. */
async function imageUrlsInUse(env, deps, urls) {
  const unique = [...new Set(urls.filter(Boolean))];
  const used = new Set();
  if (!unique.length) return used;
  const ph = unique.map(() => '?').join(',');
  for (const r of await deps.d1(env, `SELECT image FROM alerts WHERE image IN (${ph})`, unique)) used.add(r.image);
  if (await tableReady(env, 'posts')) {
    for (const r of await deps.d1(env, `SELECT image FROM posts WHERE image IN (${ph})`, unique)) used.add(r.image);
  }
  return used;
}

async function finishImageDeletion(env, imageId, now, status, lastError) {
  await env.DB.prepare(
    `UPDATE ${IMAGE_DELETE_TABLE}
     SET status = ?, last_error = ?, updated_at = ?
     WHERE image_id = ? AND status = 'pending'`
  ).bind(status, lastError, now, imageId).run();
}

async function scheduleImageRetry(env, row, now, errorText) {
  const when = now + imageDeleteBackoffMs(row.attempts);
  const error = clipError(errorText);
  await env.DB.prepare(
    `UPDATE ${IMAGE_DELETE_TABLE}
     SET attempts = ?, next_attempt_at = ?, last_error = ?, updated_at = ?
     WHERE image_id = ? AND status = 'pending'`
  ).bind(row.attempts, when, error, now, row.image_id).run();
}

/** Devuelve el intento: esta ejecución no alcanzó a llamar a Cloudflare. */
async function releaseImageClaim(env, row, now) {
  const attempts = Math.max(0, Number(row.attempts) - 1);
  await env.DB.prepare(
    `UPDATE ${IMAGE_DELETE_TABLE}
     SET attempts = ?, next_attempt_at = ?, updated_at = ?
     WHERE image_id = ? AND status = 'pending'`
  ).bind(attempts, now, now, row.image_id).run();
}

/**
 * Una pasada: toma hasta IMAGE_DELETE_BATCH_SIZE tareas vencidas, una vez
 * cada una. La reserva (next_attempt_at a futuro + attempts) evita que otro
 * cron borre la misma imagen al mismo tiempo. No reintenta dentro de la pasada.
 */
async function processImageDeletionPass(env, deps, now, deadline, imageIds) {
  const totals = { done: 0, retried: 0, errored: 0, released: 0, claimed: 0 };
  const params = [now, IMAGE_DELETE_MAX_ATTEMPTS];
  let only = '';
  if (imageIds && imageIds.length) {
    only = ` AND image_id IN (${imageIds.map(() => '?').join(',')})`;
    params.push(...imageIds);
  }
  params.push(IMAGE_DELETE_BATCH_SIZE);
  const due = await deps.d1(
    env,
    `SELECT id, image_url, image_id, attempts FROM ${IMAGE_DELETE_TABLE}
     WHERE status = 'pending' AND next_attempt_at <= ? AND attempts < ?${only}
     ORDER BY attempts DESC, next_attempt_at ASC, created_at ASC
     LIMIT ?`,
    params
  );
  const seen = new Set();
  const claimed = [];
  for (const row of due) {
    if (Date.now() >= deadline) break;
    if (seen.has(row.image_id)) continue;
    seen.add(row.image_id);
    const at = Date.now();
    // Una sola sentencia toma todas las filas de esa imagen. El segundo
    // cron concurrente no encuentra ninguna con next_attempt_at vencido.
    const res = await env.DB.prepare(
      `UPDATE ${IMAGE_DELETE_TABLE}
       SET attempts = attempts + 1, next_attempt_at = ?, updated_at = ?
       WHERE image_id = ? AND status = 'pending' AND next_attempt_at <= ? AND attempts < ?`
    ).bind(at + IMAGE_DELETE_LEASE_MS, at, row.image_id, now, IMAGE_DELETE_MAX_ATTEMPTS).run();
    const changes = d1Changes(res);
    if (changes === 0) continue;
    if (changes == null) {
      const check = await deps.d1(
        env,
        `SELECT next_attempt_at FROM ${IMAGE_DELETE_TABLE}
         WHERE image_id = ? AND status = 'pending' ORDER BY attempts DESC LIMIT 1`,
        [row.image_id]
      );
      if (!check[0] || Number(check[0].next_attempt_at) <= now) continue;
    }
    let attempts = Number(row.attempts) + 1;
    try {
      const fresh = await deps.d1(
        env,
        `SELECT MAX(attempts) AS n FROM ${IMAGE_DELETE_TABLE} WHERE image_id = ? AND status = 'pending'`,
        [row.image_id]
      );
      if (fresh[0] && Number(fresh[0].n) > attempts) attempts = Number(fresh[0].n);
    } catch (_) {}
    claimed.push({ ...row, attempts });
  }
  totals.claimed = claimed.length;
  if (!claimed.length) return totals;

  let used;
  try {
    used = await imageUrlsInUse(env, deps, claimed.map((r) => r.image_url));
  } catch (_) {
    for (const row of claimed) {
      try { await releaseImageClaim(env, row, Date.now()); } catch (_) {}
      totals.released += 1;
    }
    return totals;
  }

  for (const row of claimed) {
    const at = Date.now();
    if (at >= deadline) {
      try { await releaseImageClaim(env, row, at); } catch (_) {}
      totals.released += 1;
      continue;
    }
    if (used.has(row.image_url)) {
      await finishImageDeletion(env, row.image_id, at, 'done', null);
      totals.done += 1;
      continue;
    }
    let result;
    try {
      result = await deleteCloudflareImage(env, row.image_id);
    } catch (e) {
      result = { ok: false, error: clipError(e && e.message) };
    }
    if (result.ok || result.gone) {
      await finishImageDeletion(env, row.image_id, Date.now(), 'done', null);
      totals.done += 1;
    } else if (row.attempts >= IMAGE_DELETE_MAX_ATTEMPTS) {
      await finishImageDeletion(env, row.image_id, Date.now(), 'error', result.error);
      totals.errored += 1;
    } else {
      await scheduleImageRetry(env, row, Date.now(), result.error);
      totals.retried += 1;
    }
  }
  return totals;
}

/**
 * Procesa la cola de imágenes. Sin credenciales no consume intentos: las
 * tareas siguen pending. Como mucho dos pasadas por ejecución, cinco
 * imágenes cada una, y una sola llamada a Cloudflare por imagen.
 */
export async function processPendingImageDeletions(env, deps, now, opts = {}) {
  const empty = { done: 0, retried: 0, errored: 0, released: 0 };
  if (!(await tableReady(env, IMAGE_DELETE_TABLE))) return empty;
  if (!env.CF_ACCOUNT_ID || !env.CF_IMAGES_TOKEN) return empty;
  const deadline = Date.now() + (opts.budgetMs || 4_000);
  const maxPasses = Math.max(1, Math.min(opts.maxPasses || 1, IMAGE_DELETE_MAX_PASSES));
  const totals = { ...empty };
  for (let pass = 0; pass < maxPasses; pass += 1) {
    if (Date.now() >= deadline) break;
    const part = await processImageDeletionPass(env, deps, now, deadline, opts.imageIds);
    totals.done += part.done;
    totals.retried += part.retried;
    totals.errored += part.errored;
    totals.released += part.released;
    if (part.claimed < IMAGE_DELETE_BATCH_SIZE) break;
  }
  return totals;
}

/**
 * Borra publicaciones de adopción con sus likes, comentarios, denuncias y
 * token. La imagen se anota en adoption_image_deletions en la misma
 * transacción que el DELETE de la alerta: si el batch falla, la publicación
 * sigue y no queda una tarea suelta; si Cloudflare falla después, la
 * referencia ya está guardada. El registro de límites no se toca.
 * Sin la tabla de la migración 020 no se borra una fila que tenga imagen.
 * Solo las de esta sección (media_kind no nulo). drain true intenta el
 * borrado remoto enseguida; el cron cubre lo que quede.
 */
async function deleteAdoptionRows(env, deps, rows, opts = {}) {
  if (!rows.length) return { deleted: 0, deferred: false };
  const queueReady = await tableReady(env, IMAGE_DELETE_TABLE);
  const deletable = [];
  const images = [];
  let deferred = false;
  for (const row of rows) {
    const image = cloudflareImage(row);
    if (image && !queueReady) {
      deferred = true;
      continue;
    }
    deletable.push(row);
    if (image) images.push(image);
  }
  if (!deletable.length) {
    if (deferred && opts.drain !== false) throw queueUnavailable();
    return { deleted: 0, deferred };
  }
  const uniqueImages = dedupeImages(images);
  const ids = deletable.map((r) => r.id);
  const ph = ids.map(() => '?').join(',');
  const now = Date.now();
  const statements = uniqueImages.map((image) => pendingImageStatement(env, image, now));
  statements.push(
    env.DB.prepare(`DELETE FROM alert_likes WHERE alert_id IN (${ph})`).bind(...ids),
    env.DB.prepare(`DELETE FROM alert_comments WHERE alert_id IN (${ph})`).bind(...ids),
  );
  if (await tableReady(env, 'content_reports')) {
    statements.push(env.DB.prepare(`DELETE FROM content_reports WHERE target_type = 'alert' AND target_id IN (${ph})`).bind(...ids));
  }
  statements.push(env.DB.prepare(`DELETE FROM alerts WHERE id IN (${ph})`).bind(...ids));
  await env.DB.batch(statements);
  if (opts.drain !== false && uniqueImages.length) {
    try {
      await processPendingImageDeletions(env, deps, now, {
        maxPasses: 1,
        budgetMs: 3_000,
        imageIds: uniqueImages.map((image) => image.imageId),
      });
    } catch (_) {}
  }
  return { deleted: deletable.length, deferred };
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

  return null;
}

// ---------- Acciones con sesión ----------

export async function handleAuthAdoptionAction(env, request, body, action, now, userId, deps) {
  const { json, clean } = deps;

  if (action === 'createAdoptionPost') {
    if (!userId) return json({ error: 'Iniciá sesión para publicar.' }, 401);
    const place = cityPlace(body);
    if (!place) return json({ error: 'Localidad no habilitada' }, 400);
    if (!(await adoptionLifecycleReady(env))) return json({ error: LIFECYCLE_UNAVAILABLE }, 503);
    if (!env.CF_ACCOUNT_ID || !env.CF_IMAGES_TOKEN) return json({ error: 'La carga de imágenes no está disponible' }, 503);

    const mediaKind = parseAdoptionMediaKind(body.mediaKind);
    if (!mediaKind) return json({ error: 'Elegí cómo publicar' }, 400);
    if (deps.uploadLimited(userId, requestIp(request), now)) {
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
    const expiresAt = now + ADOPTION_CYCLE_MS;
    const geo = await geoInsertFragment(env, 'alerts', {
      placeId: place.placeId,
      admin1Code: place.admin1Code,
      admin2Code: place.admin2Code,
    });
    try {
      await deps.d1(
        env,
        `INSERT INTO alerts (id, user_id, type, status, pet_name, species, breed, description, image, locality, province, country, event_date, created_at, renewed_at, sex, contact_whatsapp, contact_phone, media_kind, expires_at, paused_at${geo.columns})
         VALUES (?, ?, 'adoption', 'active', ?, ?, '', ?, ?, ?, ?, 'AR', ?, ?, ?, ?, ?, ?, ?, ?, NULL${geo.placeholders})`,
        [id, userId, petName, species, description, uploaded.url, place.locality, place.province, now, now, now, sex, contactWhatsapp, contactPhone, mediaKind, expiresAt, ...geo.values]
      );
    } catch (e) {
      const image = cloudflareImage({ media_kind: mediaKind, image: uploaded.url });
      if (image && (await tableReady(env, IMAGE_DELETE_TABLE))) {
        try {
          const at = Date.now();
          await env.DB.batch([pendingImageStatement(env, image, at)]);
          await processPendingImageDeletions(env, deps, at, { maxPasses: 1, budgetMs: 3_000, imageIds: [image.imageId] });
        } catch (_) {}
      } else if (image && env.CF_ACCOUNT_ID && env.CF_IMAGES_TOKEN) {
        try { await deleteCloudflareImage(env, image.imageId); } catch (_) {}
      }
      throw e;
    }

    const loaded = await loadOne(env, deps, id, userId);
    return json({ ok: true, alert: loaded && loaded.alert, expiresAt });
  }

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
      try {
        await deleteAdoptionRow(env, deps, row);
      } catch (e) {
        if (e && e.code === 'IMAGE_DELETE_QUEUE_UNAVAILABLE') return json({ error: 'Eliminar la publicación todavía no está habilitado.' }, 503);
        throw e;
      }
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
  if (!row || row.expires_at == null) return { sql: '', values: [] };
  if (!(await adoptionLifecycleReady(env))) return { sql: '', values: [] };
  return { sql: ', expires_at = ?, paused_at = NULL', values: [now + ADOPTION_CYCLE_MS] };
}
