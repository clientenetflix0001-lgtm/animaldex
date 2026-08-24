// ============================================================
// Animaldex — Cloudflare Worker (backend real, tiempo real)
// ============================================================
// Sustituye a las funciones serverless de Vercel (que no se estaban
// desplegando correctamente). Corre en la red de Cloudflare, con
// acceso NATIVO a D1 (sin HTTP intermedio → mucho más rápido) y
// llega directo a Cloudflare Images. Mismo esquema de contraseñas
// (scrypt) para no invalidar las cuentas ya creadas.
// ============================================================

import { scryptSync, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import {
  argentinaDateParts,
  birthdayIdempotencyKey,
  birthdayMatchParams,
  birthdayNotificationCopy,
  evaluatePersonalPetBirthday,
} from '../lib/petBirthday.ts';
import {
  EXPO_PUSH_BATCH_MAX,
  EXPO_PUSH_RECEIPTS_URL,
  EXPO_PUSH_SEND_URL,
  assignPushToken,
  birthdayPushIdempotencyKey,
  birthdayPushMessage,
  isExpoPushToken,
  locationPushIdempotencyKey,
  locationPushMessage,
  mergeNotificationPrefs,
  prefAllows,
  tokensToDisableFromReceipts,
  tokensToDisableFromTickets,
} from '../lib/pushPolicy.ts';

// ---------- Helpers D1 ----------
async function d1(env, sql, params = []) {
  const res = await env.DB.prepare(sql).bind(...params).all();
  return res.results || [];
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

const POST_CAPTION_MAX = 1000;
const ALLOWED_POST_BACKGROUNDS = new Set([
  'orange-gradient-01',
  'pink-gradient-01',
  'blue-gradient-01',
  'teal-gradient-01',
  'sunset-gradient-01',
  'purple-gradient-01',
  'forest-gradient-01',
  'night-gradient-01',
  'solid-coral-01',
  'solid-teal-01',
  'solid-navy-01',
  'animaldex-paws-01',
]);

const clean = (s, max = 300) => String(s == null ? '' : s).slice(0, max).trim();

// Usuarios con permiso para generar chapitas QR (links de invitación).
// Solo estos usernames pueden usar las acciones createTag/listTags.
const ADMIN_USERNAMES = ['lucasfuentes'];

// ---------- Envío genérico de SMS vía Twilio (reutilizado por varios endpoints) ----------
async function sendTwilioSms(env, toPhone, body) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_PHONE_NUMBER) {
    return { ok: false, provider: 'demo', reason: 'Twilio no configurado' };
  }
  try {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: toPhone, From: env.TWILIO_PHONE_NUMBER, Body: body }).toString(),
    });
    const respJson = await resp.json();
    if (!resp.ok) return { ok: false, provider: 'twilio', reason: respJson.message || 'error Twilio' };
    return { ok: true, provider: 'twilio', sid: respJson.sid };
  } catch (e) {
    return { ok: false, provider: 'twilio', reason: e.message };
  }
}

// ---------- Password hashing (idéntico al esquema anterior) ----------
function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString('hex');
}
const newSalt = () => randomBytes(16).toString('hex');
const newToken = () => randomBytes(32).toString('hex');

// ---------- Sesiones ----------
const SESSION_TTL = 90 * 24 * 60 * 60 * 1000; // 90 días

async function createSession(env, userId) {
  const token = newToken();
  const now = Date.now();
  await d1(env, 'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', [
    token, userId, now, now + SESSION_TTL,
  ]);
  return token;
}

async function authUser(request, env, body) {
  const header = request.headers.get('authorization');
  let token = '';
  if (header && header.startsWith('Bearer ')) token = header.slice(7);
  else if (body && body.sessionToken) token = String(body.sessionToken);
  if (!token || token.length < 32) return null;
  const rows = await d1(env, 'SELECT user_id, expires_at FROM sessions WHERE token = ?', [token]);
  if (!rows[0]) return null;
  if (Date.now() > rows[0].expires_at) {
    d1(env, 'DELETE FROM sessions WHERE token = ?', [token]).catch(() => {});
    return null;
  }
  return rows[0].user_id;
}


function profileRow(r) {
  return {
    id: r.id,
    accountId: r.account_id,
    type: r.type,
    name: r.name,
    username: r.username,
    avatar: r.avatar_url || null,
    bio: r.bio || '',
    location: r.location || '',
    phone: r.phone || '',
    createdAt: r.created_at,
  };
}

async function ensureProfilesSchema(env) {
  if (env._profilesReady) return;
  await d1(env, `CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    username TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT DEFAULT '',
    created_at INTEGER NOT NULL
  )`);
  await d1(env, 'CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username ON profiles (username)');
  await d1(env, 'CREATE INDEX IF NOT EXISTS idx_profiles_account ON profiles (account_id)');
  try {
    await env.DB.prepare('ALTER TABLE posts ADD COLUMN author_profile_id TEXT').run();
  } catch (_) {}
  try { await env.DB.prepare('ALTER TABLE posts ADD COLUMN image_w INTEGER').run(); } catch (_) {}
  try { await env.DB.prepare('ALTER TABLE posts ADD COLUMN image_h INTEGER').run(); } catch (_) {}
  try { await env.DB.prepare('ALTER TABLE posts ADD COLUMN background_id TEXT').run(); } catch (_) {}
  try { await env.DB.prepare('ALTER TABLE pets ADD COLUMN profile_id TEXT').run(); } catch (_) {}
  try { await env.DB.prepare('ALTER TABLE pets ADD COLUMN care_status TEXT').run(); } catch (_) {}
  try { await env.DB.prepare('ALTER TABLE pets ADD COLUMN sex TEXT').run(); } catch (_) {}
  try { await env.DB.prepare('ALTER TABLE pets ADD COLUMN adoption_started_at INTEGER').run(); } catch (_) {}
  try { await env.DB.prepare('ALTER TABLE pets ADD COLUMN birth_date TEXT').run(); } catch (_) {}
  try { await env.DB.prepare('ALTER TABLE pets ADD COLUMN size TEXT').run(); } catch (_) {}
  try { await env.DB.prepare('ALTER TABLE pets ADD COLUMN neutered INTEGER').run(); } catch (_) {}
  try { await env.DB.prepare('ALTER TABLE pets ADD COLUMN archived_at INTEGER').run(); } catch (_) {}
  try { await env.DB.prepare('ALTER TABLE profiles ADD COLUMN location TEXT').run(); } catch (_) {}
  try { await env.DB.prepare('ALTER TABLE profiles ADD COLUMN phone TEXT').run(); } catch (_) {}
  await d1(env, 'CREATE INDEX IF NOT EXISTS idx_pets_profile ON pets (profile_id)');
  await d1(env, 'CREATE INDEX IF NOT EXISTS idx_pets_birth_date ON pets (birth_date)');
  // Historial de adopciones completadas. Una fila = una transferencia real del
  // MISMO pet_id (no se duplica el perfil). care_status no escribe acá.
  // Futuro (no expuesto todavía):
  //   INSERT pet_transfers (...);
  //   UPDATE pets SET user_id = :nuevo, profile_id = :perfilNuevoONull WHERE id = :petId;
  //   → Mascotas baja porque ya no tiene profile_id del refugio
  //   → Adoptados sube porque hay fila en pet_transfers
  await d1(env, `CREATE TABLE IF NOT EXISTS pet_transfers (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL,
    from_profile_id TEXT NOT NULL,
    from_user_id TEXT NOT NULL,
    to_user_id TEXT NOT NULL,
    to_profile_id TEXT,
    created_at INTEGER NOT NULL
  )`);
  await d1(env, 'CREATE INDEX IF NOT EXISTS idx_pet_transfers_from ON pet_transfers (from_profile_id)');
  await d1(env, 'CREATE INDEX IF NOT EXISTS idx_pet_transfers_pet ON pet_transfers (pet_id)');
  env._profilesReady = true;
}

// Keep in sync with lib/publicHandles.ts and cf-pages-worker.src.js
const RESERVED_PUBLIC_USERNAMES = new Set([
  'p', 'pet', 'a', 'm', 'login', 'register', 'auth', 'feed', 'reels', 'alerts', 'alertas',
  'marketplace', 'mercado', 'admin', 'api', 'crear', 'actividad', 'perfil', 'explorar',
  'verificar', 'escanear', 'entrar', 'tienda', 'vender', 'user', 'users', 'assets', '_expo',
  'index', 'home', 'app', 'www', 'static', 'public', 'nueva-mascota', 'editar-perfil',
  'editar-perfil-publico', 'crear-alerta', 'mercado-favoritos', 'favicon.ico', 'robots.txt',
  'well-known',
]);

function isReservedPublicUsername(username) {
  return RESERVED_PUBLIC_USERNAMES.has(String(username || '').toLowerCase());
}

async function usernameTaken(env, username, allowAccountId, allowProfileId) {
  const handle = String(username || '').toLowerCase();
  if (isReservedPublicUsername(handle) || usernameLooksLikePhone(handle)) return true;
  const users = await d1(env, 'SELECT id FROM users WHERE LOWER(username) = ?', [handle]);
  if (users[0] && users[0].id !== allowAccountId) return true;
  const profiles = await d1(env, 'SELECT id FROM profiles WHERE LOWER(username) = ?', [handle]);
  if (profiles[0] && profiles[0].id !== allowProfileId) return true;
  const pets = await d1(env, 'SELECT id FROM pets WHERE LOWER(username) = ?', [handle]);
  return pets.length > 0;
}

async function ensureAuthSchema(env) {
  if (env._authSchemaReady) return;
  try { await env.DB.prepare('ALTER TABLE users ADD COLUMN email TEXT').run(); } catch (_) {}
  try { await env.DB.prepare('ALTER TABLE users ADD COLUMN email_verified_at INTEGER').run(); } catch (_) {}
  await d1(env, `CREATE TABLE IF NOT EXISTS otp_challenges (
    id TEXT PRIMARY KEY,
    phone TEXT NOT NULL,
    purpose TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    send_count INTEGER NOT NULL DEFAULT 0,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_sent_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    verified_at INTEGER,
    created_at INTEGER NOT NULL
  )`);
  await d1(env, 'CREATE INDEX IF NOT EXISTS idx_otp_phone_purpose ON otp_challenges (phone, purpose, created_at)');
  try {
    await env.DB.prepare(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email) WHERE email IS NOT NULL'
    ).run();
  } catch (_) {}
  try {
    await env.DB.prepare(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_verified_phone ON users (verified_phone) WHERE verified_phone IS NOT NULL'
    ).run();
  } catch (_) {}
  env._authSchemaReady = true;
}

async function ensureActivityEventsSchema(env) {
  if (env._activityEventsReady) return;
  await d1(env, `CREATE TABLE IF NOT EXISTS activity_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    user_id TEXT NOT NULL,
    pet_id TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    body TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL
  )`);
  await d1(env, 'CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_events_key ON activity_events (idempotency_key)');
  await d1(env, 'CREATE INDEX IF NOT EXISTS idx_activity_events_user ON activity_events (user_id, created_at DESC)');
  env._activityEventsReady = true;
}

async function ensurePushSchema(env) {
  if (env._pushSchemaReady) return;
  await d1(env, `CREATE TABLE IF NOT EXISTS user_push_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expo_push_token TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL,
    device_id TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  )`);
  await d1(env, 'CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user ON user_push_tokens (user_id, enabled)');
  await d1(env, `CREATE TABLE IF NOT EXISTS user_notification_prefs (
    user_id TEXT PRIMARY KEY,
    location INTEGER NOT NULL DEFAULT 1,
    birthday INTEGER NOT NULL DEFAULT 1,
    lost_pet INTEGER NOT NULL DEFAULT 1,
    adoption INTEGER NOT NULL DEFAULT 1,
    comment INTEGER NOT NULL DEFAULT 1,
    like INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  )`);
  await d1(env, `CREATE TABLE IF NOT EXISTS push_sends (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  await d1(env, `CREATE TABLE IF NOT EXISTS push_tickets (
    id TEXT PRIMARY KEY,
    expo_push_token TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  env._pushSchemaReady = true;
}

function mapPushTokenRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    expoPushToken: r.expo_push_token,
    platform: r.platform,
    deviceId: r.device_id || null,
    enabled: Number(r.enabled) === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastSeenAt: r.last_seen_at,
  };
}

async function loadNotificationPrefs(env, userId) {
  const rows = await d1(env, 'SELECT * FROM user_notification_prefs WHERE user_id = ?', [userId]);
  return mergeNotificationPrefs(rows[0] || null);
}

async function disablePushTokens(env, tokens, nowMs) {
  if (!tokens.length) return;
  for (const token of tokens) {
    await d1(env, 'UPDATE user_push_tokens SET enabled = 0, updated_at = ? WHERE expo_push_token = ?', [nowMs, token]);
  }
}

async function sendExpoPush(messages) {
  if (!messages.length) return { tickets: [], tokens: [] };
  const tokens = messages.map((m) => String(m.to || ''));
  const resp = await fetch(EXPO_PUSH_SEND_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages.length === 1 ? messages[0] : messages),
  });
  const json = await resp.json().catch(() => ({}));
  const tickets = Array.isArray(json.data) ? json.data : json.data ? [json.data] : [];
  return { tickets, tokens };
}

async function notifyUserPush(env, input) {
  const nowMs = input.nowMs || Date.now();
  await ensurePushSchema(env);
  const claim = await env.DB.prepare(
    'INSERT OR IGNORE INTO push_sends (id, type, user_id, created_at) VALUES (?, ?, ?, ?)'
  )
    .bind(input.idempotencyKey, input.type, input.userId, nowMs)
    .run();
  if (!claim || !claim.meta || claim.meta.changes < 1) return { sent: 0, skipped: 'duplicate' };

  const prefs = await loadNotificationPrefs(env, input.userId);
  if (!prefAllows(prefs, input.type)) return { sent: 0, skipped: 'pref_off' };

  const rows = await d1(
    env,
    'SELECT * FROM user_push_tokens WHERE user_id = ? AND enabled = 1',
    [input.userId]
  );
  if (!rows.length) return { sent: 0, skipped: 'no_token' };

  const messages = rows.map((r) => input.buildMessage(r.expo_push_token));
  let sent = 0;
  for (let i = 0; i < messages.length; i += EXPO_PUSH_BATCH_MAX) {
    const batch = messages.slice(i, i + EXPO_PUSH_BATCH_MAX);
    try {
      const { tickets, tokens } = await sendExpoPush(batch);
      const dead = tokensToDisableFromTickets(tickets, tokens);
      if (dead.length) await disablePushTokens(env, dead, nowMs);
      for (let t = 0; t < tickets.length; t++) {
        if (tickets[t] && tickets[t].status === 'ok' && tickets[t].id) {
          sent += 1;
          await d1(
            env,
            'INSERT OR IGNORE INTO push_tickets (id, expo_push_token, created_at) VALUES (?, ?, ?)',
            [tickets[t].id, tokens[t], nowMs]
          ).catch(() => {});
        }
      }
    } catch (_) {
      // El evento de Activity ya está persistido; no revertimos el claim.
    }
  }
  return { sent };
}

async function processPushReceipts(env, nowMs = Date.now()) {
  await ensurePushSchema(env);
  const rows = await d1(env, 'SELECT id, expo_push_token FROM push_tickets ORDER BY created_at ASC LIMIT 80');
  if (!rows.length) return { checked: 0 };
  const ids = rows.map((r) => r.id);
  const ticketToToken = {};
  rows.forEach((r) => {
    ticketToToken[r.id] = r.expo_push_token;
  });
  try {
    const resp = await fetch(EXPO_PUSH_RECEIPTS_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    const json = await resp.json().catch(() => ({}));
    const receipts = json.data || {};
    const dead = tokensToDisableFromReceipts(receipts, ticketToToken);
    if (dead.length) await disablePushTokens(env, dead, nowMs);
    for (const id of ids) {
      if (receipts[id]) {
        await d1(env, 'DELETE FROM push_tickets WHERE id = ?', [id]).catch(() => {});
      }
    }
    return { checked: ids.length, disabled: dead.length };
  } catch (_) {
    return { checked: 0 };
  }
}

async function runPersonalPetBirthdays(env, nowMs = Date.now()) {
  await ensureProfilesSchema(env);
  await ensureActivityEventsSchema(env);
  await ensurePushSchema(env);
  const today = argentinaDateParts(nowMs);
  const { monthDay, includeFeb29OnFeb28 } = birthdayMatchParams(today);
  const rows = await d1(
    env,
    `SELECT p.id, p.name, p.username, p.user_id, p.birth_date, p.emoji, p.avatar_url,
            p.profile_id, p.archived_at, pr.type AS profile_type
       FROM pets p
       LEFT JOIN profiles pr ON pr.id = p.profile_id
      WHERE p.archived_at IS NULL
        AND p.birth_date IS NOT NULL
        AND (p.profile_id IS NULL OR pr.type = 'personal')
        AND (
          substr(p.birth_date, 6, 5) = ?
          OR (? = 1 AND substr(p.birth_date, 6, 5) = '02-29')
        )`,
    [monthDay, includeFeb29OnFeb28 ? 1 : 0]
  );

  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      const decision = evaluatePersonalPetBirthday(
        {
          birthDate: row.birth_date,
          archivedAt: row.archived_at,
          profileId: row.profile_id,
          profileType: row.profile_type,
        },
        nowMs
      );
      if (!decision.notify) {
        skipped += 1;
        continue;
      }
      const key = birthdayIdempotencyKey(row.id, today.year);
      const copy = birthdayNotificationCopy(row.name, decision.years);
      const metadata = JSON.stringify({
        ownerUserId: row.user_id,
        petId: row.id,
        petUsername: row.username || null,
        petName: row.name,
        petEmoji: row.emoji || null,
        petAvatar: row.avatar_url || null,
        years: decision.years,
      });
      const res = await env.DB.prepare(
        `INSERT OR IGNORE INTO activity_events
          (id, type, user_id, pet_id, idempotency_key, title, body, metadata, created_at)
         VALUES (?, 'birthday', ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(key, row.user_id, row.id, key, copy.title, copy.body, metadata, nowMs)
        .run();
      if (res && res.meta && res.meta.changes > 0) {
        inserted += 1;
        try {
          await notifyUserPush(env, {
            userId: row.user_id,
            type: 'birthday',
            idempotencyKey: birthdayPushIdempotencyKey(row.id, today.year),
            nowMs,
            buildMessage: (token) =>
              birthdayPushMessage({
                token,
                petName: row.name,
                petId: row.id,
                petUsername: row.username || null,
                years: decision.years,
              }),
          });
        } catch (_) {}
      } else skipped += 1;
    } catch (_) {
      skipped += 1;
    }
  }
  return { considered: rows.length, inserted, skipped, date: `${today.year}-${monthDay}` };
}

async function ensurePersonalProfile(env, userId) {
  const existing = await d1(env, "SELECT * FROM profiles WHERE account_id = ? AND type = 'personal'", [userId]);
  if (existing[0]) return existing[0];
  const users = await d1(env, 'SELECT * FROM users WHERE id = ?', [userId]);
  if (!users[0]) return null;
  const u = users[0];
  let username = String(u.username || 'user').toLowerCase();
  if (await usernameTaken(env, username, userId)) {
    username = (username.slice(0, 14) + Date.now().toString(36).slice(-4)).slice(0, 20);
  }
  const id = `prf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await d1(
    env,
    'INSERT INTO profiles (id, account_id, type, name, username, avatar_url, bio, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, userId, 'personal', u.name, username, u.avatar_url || null, u.bio || '', Date.now()]
  );
  const rows = await d1(env, 'SELECT * FROM profiles WHERE id = ?', [id]);
  return rows[0];
}

async function createAccount(env, { username, name, password, email, phone }) {
  const salt = newSalt();
  const passHash = hashPassword(password, salt);
  const id = `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await d1(
    env,
    'INSERT INTO users (id, username, name, pass_hash, salt, created_at, email, email_verified_at, verified_phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, username, name, passHash, salt, Date.now(), email || null, null, phone || null]
  );
  try {
    await ensureProfilesSchema(env);
    await ensurePersonalProfile(env, id);
  } catch (_) {}
  const token = await createSession(env, id);
  const rows = await d1(env, 'SELECT * FROM users WHERE id = ?', [id]);
  return { token, user: publicUser(rows[0]) };
}

// ============================================================
// AUTH
// ============================================================

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
const EMAIL_RE = /^[a-z0-9._%+\-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const EMAIL_MAX = 254;
const PASSWORD_MIN = 6;
const AR_MOBILE_E164_RE = /^\+549\d{10}$/;
const E164_RE = /^\+[1-9]\d{8,14}$/;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_SEND_WINDOW_MS = 15 * 60 * 1000;
const OTP_RESEND_GAP_MS = 30 * 1000;
const OTP_MAX_SENDS = 3;
const OTP_MAX_ATTEMPTS = 5;
const OTP_TICKET_TTL_MS = 15 * 60 * 1000;

function digitsAndPlus(raw) {
  const s = String(raw || '').trim();
  let out = '';
  for (const ch of s) {
    if (ch === '+' && out.length === 0) out += '+';
    else if (ch >= '0' && ch <= '9') out += ch;
  }
  if (out.startsWith('00')) out = `+${out.slice(2)}`;
  return out;
}

function argentineNational10(raw) {
  let d = digitsAndPlus(raw).replace(/^\+/, '');
  if (!d) return null;
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9') && d.length === 11) d = d.slice(1);
  while (d.startsWith('0')) d = d.slice(1);
  for (const areaLen of [2, 3, 4]) {
    if (d.length > areaLen + 2 && d.slice(areaLen, areaLen + 2) === '15') {
      const candidate = d.slice(0, areaLen) + d.slice(areaLen + 2);
      if (candidate.length === 10) return candidate;
    }
  }
  if (d.length === 10) return d;
  return null;
}

function normalizeArMobile(raw) {
  const national = argentineNational10(raw);
  if (!national) return null;
  const e164 = `+549${national}`;
  return AR_MOBILE_E164_RE.test(e164) ? e164 : null;
}

function normalizePhone(raw) {
  const compact = digitsAndPlus(raw);
  if (AR_MOBILE_E164_RE.test(compact)) return compact;
  const ar = normalizeArMobile(raw);
  if (ar) return ar;
  if (E164_RE.test(compact) && compact.startsWith('+') && !compact.startsWith('+54')) return compact;
  return null;
}

function isValidEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  return email.length >= 6 && email.length <= EMAIL_MAX && EMAIL_RE.test(email);
}

function usernameLooksLikePhone(username) {
  const handle = String(username || '').trim().toLowerCase();
  if (/^\d{8,15}$/.test(handle)) return true;
  if (/^\+?\d{8,15}$/.test(handle)) return true;
  return normalizePhone(handle) != null;
}

function classifyIdentifier(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { kind: 'invalid', value: '', reason: 'empty' };
  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase();
    if (!isValidEmail(email)) return { kind: 'invalid', value: email, reason: 'email' };
    return { kind: 'email', value: email };
  }
  const phone = normalizePhone(trimmed);
  if (phone) return { kind: 'phone', value: phone };
  const username = trimmed.replace(/^@/, '').toLowerCase();
  if (USERNAME_RE.test(username) && !usernameLooksLikePhone(username)) {
    return { kind: 'username', value: username };
  }
  return { kind: 'invalid', value: trimmed, reason: 'format' };
}

function otpSecret(env) {
  return env.OTP_SECRET || '';
}

function smsConfigured(env) {
  return !!(
    otpSecret(env) &&
    env.TWILIO_ACCOUNT_SID &&
    env.TWILIO_AUTH_TOKEN &&
    env.TWILIO_PHONE_NUMBER
  );
}

function hashOtpCode(secret, phone, purpose, code) {
  return createHmac('sha256', secret).update(`otp|${purpose}|${phone}|${code}`).digest('hex');
}

function hashesEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (aa.length !== bb.length || aa.length === 0) return false;
  return timingSafeEqual(aa, bb);
}

function signPhoneTicket(secret, purpose, phone, exp) {
  const sig = createHmac('sha256', secret).update(`ticket|${purpose}|${phone}|${exp}`).digest('hex');
  return `${exp}.${sig}`;
}

function readPhoneTicket(secret, purpose, phone, ticket) {
  const parts = String(ticket || '').split('.');
  if (parts.length !== 2) return false;
  const exp = Number(parts[0]);
  if (!exp || Date.now() > exp) return false;
  const expected = signPhoneTicket(secret, purpose, phone, exp);
  return hashesEqual(expected, ticket);
}

function otpRowState(row) {
  if (!row) return null;
  return {
    sendCount: Number(row.send_count) || 0,
    attemptCount: Number(row.attempt_count) || 0,
    lastSentAt: Number(row.last_sent_at) || 0,
    expiresAt: Number(row.expires_at) || 0,
    verifiedAt: row.verified_at == null ? null : Number(row.verified_at),
    createdAt: Number(row.created_at) || 0,
  };
}

function canSendOtp(row, now) {
  if (!row || row.verifiedAt) return { ok: true };
  if (now - row.lastSentAt < OTP_RESEND_GAP_MS) {
    return { ok: false, error: 'Esperá unos segundos antes de reenviar el código.' };
  }
  if (row.createdAt + OTP_SEND_WINDOW_MS > now && row.sendCount >= OTP_MAX_SENDS) {
    return { ok: false, error: 'Demasiados envíos. Probá de nuevo más tarde.' };
  }
  return { ok: true };
}

function canAttemptOtp(row, now) {
  if (!row) return { ok: false, error: 'Solicitá un código primero.' };
  if (row.verifiedAt) return { ok: false, error: 'Ese código ya fue usado.' };
  if (now > row.expiresAt) return { ok: false, error: 'El código expiró, solicitá uno nuevo.' };
  if (row.attemptCount >= OTP_MAX_ATTEMPTS) {
    return { ok: false, error: 'Demasiados intentos. Solicitá un código nuevo.' };
  }
  return { ok: true };
}

function nextSendState(row, now) {
  const windowExpired = row ? now - row.createdAt >= OTP_SEND_WINDOW_MS : true;
  if (!row || windowExpired || row.verifiedAt) {
    return {
      sendCount: 1,
      attemptCount: 0,
      lastSentAt: now,
      expiresAt: now + OTP_TTL_MS,
      verifiedAt: null,
      createdAt: now,
      fresh: true,
    };
  }
  return {
    ...row,
    sendCount: row.sendCount + 1,
    lastSentAt: now,
    expiresAt: now + OTP_TTL_MS,
    attemptCount: 0,
    fresh: false,
  };
}

const otpSendByIp = new Map();
function otpIpLimited(ip, now) {
  const key = ip || 'unknown';
  const rec = otpSendByIp.get(key);
  if (!rec || now - rec.start >= OTP_SEND_WINDOW_MS) {
    otpSendByIp.set(key, { start: now, n: 1 });
    return false;
  }
  if (rec.n >= 8) return true;
  rec.n += 1;
  return false;
}

// Rate limit mínimo de shareLocation: 1 envío / 45s por IP + mascota (memoria, sin tabla).
const SHARE_LOCATION_WINDOW_MS = 45 * 1000;
const SHARE_LOCATION_MAX = 1;
const shareLocationByKey = new Map();
function shareLocationLimited(ip, petId, now) {
  const key = `${ip || 'unknown'}|${petId}`;
  const rec = shareLocationByKey.get(key);
  if (!rec || now - rec.start >= SHARE_LOCATION_WINDOW_MS) {
    shareLocationByKey.set(key, { start: now, n: 1 });
    return false;
  }
  if (rec.n >= SHARE_LOCATION_MAX) return true;
  rec.n += 1;
  return false;
}

function phoneLookupValues(phoneOrRaw) {
  const values = new Set();
  const compact = digitsAndPlus(phoneOrRaw);
  if (compact) values.add(compact);
  const national = argentineNational10(phoneOrRaw);
  if (national) {
    values.add(national);
    values.add(`+549${national}`);
    values.add(`+54${national}`);
  }
  const e164 = normalizePhone(phoneOrRaw);
  if (e164) values.add(e164);
  return [...values];
}

async function findUsersByPhone(env, phoneOrRaw) {
  const values = phoneLookupValues(phoneOrRaw);
  if (values.length === 0) return [];
  const ph = values.map(() => '?').join(',');
  return d1(env, `SELECT * FROM users WHERE verified_phone IN (${ph})`, values);
}

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    avatarUrl: u.avatar_url || null,
    bio: u.bio || '',
    location: u.location || '',
    verifiedPhone: u.verified_phone || null,
    email: u.email || null,
    emailVerified: !!u.email_verified_at,
    createdAt: u.created_at,
  };
}

async function handleAuth(request, env) {
  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 30);

  try {
    await ensureAuthSchema(env);
    await ensureProfilesSchema(env);

    if (action === 'register') {
      const username = clean(body.username, 20).toLowerCase();
      const name = clean(body.name, 60) || username;
      const password = String(body.password || '');
      if (!USERNAME_RE.test(username)) {
        return json({ error: 'El usuario debe tener 3-20 caracteres: letras, números, punto o guion bajo' }, 400);
      }
      if (isReservedPublicUsername(username) || usernameLooksLikePhone(username)) {
        return json({ error: 'Ese nombre de usuario no está disponible' }, 400);
      }
      if (name.length < 2) return json({ error: 'Escribe tu nombre' }, 400);
      if (password.length < PASSWORD_MIN) return json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);
      if (await usernameTaken(env, username, null)) {
        return json({ error: 'Ese nombre de usuario ya está en uso' }, 409);
      }
      const created = await createAccount(env, { username, name, password, email: null, phone: null });
      return json({ ok: true, ...created });
    }

    if (action === 'registerEmail') {
      const email = String(body.email || '').trim().toLowerCase();
      const username = clean(String(body.username || '').replace(/^@/, ''), 20).toLowerCase();
      const password = String(body.password || '');
      if (!isValidEmail(email)) return json({ error: 'Escribe un correo válido' }, 400);
      if (password.length < PASSWORD_MIN) return json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);
      if (!USERNAME_RE.test(username) || isReservedPublicUsername(username) || usernameLooksLikePhone(username)) {
        return json({ error: 'El usuario debe tener 3-20 caracteres y no puede parecer un teléfono ni una ruta del sistema' }, 400);
      }
      const existingEmail = await d1(env, 'SELECT id FROM users WHERE email IS NOT NULL AND LOWER(email) = ?', [email]);
      if (existingEmail[0]) return json({ error: 'Ese correo ya está en uso' }, 409);
      if (await usernameTaken(env, username, null)) {
        return json({ error: 'Ese nombre de usuario ya está en uso' }, 409);
      }
      const created = await createAccount(env, { username, name: username, password, email, phone: null });
      return json({ ok: true, ...created });
    }

    if (action === 'registerPhone') {
      const phone = normalizePhone(body.phone);
      const username = clean(String(body.username || '').replace(/^@/, ''), 20).toLowerCase();
      const password = String(body.password || '');
      const ticket = String(body.ticket || '');
      const secret = otpSecret(env);
      if (!phone) return json({ error: 'Número de teléfono inválido' }, 400);
      if (!secret) return json({ error: 'La verificación por SMS no está disponible' }, 503);
      if (!readPhoneTicket(secret, 'signup', phone, ticket)) {
        return json({ error: 'Verificá tu teléfono antes de crear la cuenta' }, 400);
      }
      if (password.length < PASSWORD_MIN) return json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);
      if (!USERNAME_RE.test(username) || isReservedPublicUsername(username) || usernameLooksLikePhone(username)) {
        return json({ error: 'El usuario debe tener 3-20 caracteres y no puede parecer un teléfono ni una ruta del sistema' }, 400);
      }
      const existingPhone = await findUsersByPhone(env, phone);
      if (existingPhone[0]) return json({ error: 'Ese teléfono ya está en uso' }, 409);
      if (await usernameTaken(env, username, null)) {
        return json({ error: 'Ese nombre de usuario ya está en uso' }, 409);
      }
      const created = await createAccount(env, { username, name: username, password, email: null, phone });
      return json({ ok: true, ...created });
    }

    if (action === 'checkEmail') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!isValidEmail(email)) return json({ ok: true, available: false, reason: 'invalid' });
      const rows = await d1(env, 'SELECT id FROM users WHERE email IS NOT NULL AND LOWER(email) = ?', [email]);
      return json({ ok: true, available: rows.length === 0 });
    }

    if (action === 'login') {
      const identifierRaw = body.identifier != null ? String(body.identifier) : String(body.username || '');
      const password = String(body.password || '');
      const classified = classifyIdentifier(identifierRaw);
      const invalid = { error: 'Usuario o contraseña incorrectos' };
      if (classified.kind === 'invalid') return json(invalid, 401);
      let rows = [];
      if (classified.kind === 'email') {
        rows = await d1(env, 'SELECT * FROM users WHERE email IS NOT NULL AND LOWER(email) = ?', [classified.value]);
      } else if (classified.kind === 'phone') {
        rows = await findUsersByPhone(env, classified.value);
      } else {
        rows = await d1(env, 'SELECT * FROM users WHERE LOWER(username) = ?', [classified.value]);
      }
      if (!rows[0]) return json(invalid, 401);
      const u = rows[0];
      if (hashPassword(password, u.salt) !== u.pass_hash) return json(invalid, 401);
      const token = await createSession(env, u.id);
      return json({ ok: true, token, user: publicUser(u) });
    }

    if (action === 'me') {
      const userId = await authUser(request, env, body);
      if (!userId) return json({ error: 'Sesión inválida o expirada' }, 401);
      const rows = await d1(env, 'SELECT * FROM users WHERE id = ?', [userId]);
      if (!rows[0]) return json({ error: 'Usuario no encontrado' }, 401);
      return json({ ok: true, user: publicUser(rows[0]) });
    }

    if (action === 'logout') {
      const header = request.headers.get('authorization');
      const token = header && header.startsWith('Bearer ') ? header.slice(7) : String(body.sessionToken || '');
      if (token) await d1(env, 'DELETE FROM sessions WHERE token = ?', [token]).catch(() => {});
      return json({ ok: true });
    }

    if (action === 'updateProfile') {
      const userId = await authUser(request, env, body);
      if (!userId) return json({ error: 'Sesión inválida' }, 401);
      const name = clean(body.name, 60);
      const bio = clean(body.bio, 200);
      const location = clean(body.location, 60);
      const avatarUrl = clean(body.avatarUrl, 500) || null;
      const nextUsername = body.username != null
        ? clean(String(body.username).replace(/^@/, ''), 20).toLowerCase()
        : '';
      if (nextUsername) {
        if (!USERNAME_RE.test(nextUsername)) {
          return json({ error: 'El usuario debe tener 3-20 caracteres: letras, números, punto o guion bajo' }, 400);
        }
        if (isReservedPublicUsername(nextUsername) || usernameLooksLikePhone(nextUsername)) {
          return json({ error: 'Ese nombre de usuario no está disponible' }, 400);
        }
        await ensureProfilesSchema(env);
        const personal = await ensurePersonalProfile(env, userId);
        if (await usernameTaken(env, nextUsername, userId, personal && personal.id)) {
          return json({ error: 'Ese nombre de usuario ya está en uso' }, 409);
        }
        await d1(env, 'UPDATE users SET username = ? WHERE id = ?', [nextUsername, userId]);
        if (personal) {
          await d1(
            env,
            "UPDATE profiles SET username = ? WHERE id = ? AND type = 'personal'",
            [nextUsername, personal.id]
          );
        }
      }
      await d1(
        env,
        "UPDATE users SET name = COALESCE(NULLIF(?, ''), name), bio = ?, location = ?, avatar_url = COALESCE(?, avatar_url) WHERE id = ?",
        [name, bio, location, avatarUrl, userId]
      );
      const rows = await d1(env, 'SELECT * FROM users WHERE id = ?', [userId]);
      return json({ ok: true, user: publicUser(rows[0]) });
    }

    return json({ error: 'Acción desconocida' }, 400);
  } catch (e) {
    return json({ error: `Auth: ${e.message}` }, 502);
  }
}

// ============================================================
// DB (datos: feed, posts, mascotas, tiempo real...)
// ============================================================

function postRow(r) {
  return {
    id: r.id,
    userId: r.user_id,
    petId: r.pet_id,
    image: r.image,
    imageWidth: r.image_w ?? null,
    imageHeight: r.image_h ?? null,
    caption: r.caption,
    createdAt: r.created_at,
    likeCount: r.like_count || 0,
    commentCount: r.comment_count || 0,
    petName: r.pet_name || null,
    petEmoji: r.pet_emoji || null,
    petAvatar: r.pet_avatar || null,
    petSpecies: r.pet_species || null,
    petUsername: r.pet_username || null,
    username: r.username || null,
    userName: r.user_name || null,
    authorProfileId: r.author_profile_id || null,
    authorProfileType: r.author_profile_type || null,
    authorProfileName: r.author_profile_name || null,
    authorProfileUsername: r.author_profile_username || null,
    authorProfileAvatar: r.author_profile_avatar || null,
    backgroundId: r.background_id || null,
  };
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
function daysInMonth(year, month) {
  if (month < 1 || month > 12) return 0;
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}
function parseBirthDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}
function isValidBirthDate(value, nowMs = Date.now()) {
  const parsed = parseBirthDate(value);
  if (!parsed) return false;
  const { year, month, day } = parsed;
  const now = new Date(nowMs);
  if (year < 1980 || year > now.getFullYear()) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return date.getTime() <= today.getTime();
}
function ageFromBirthDate(value, nowMs = Date.now()) {
  if (!isValidBirthDate(value, nowMs)) return '';
  const parsed = parseBirthDate(value);
  const now = new Date(nowMs);
  let years = now.getFullYear() - parsed.year;
  let months = now.getMonth() + 1 - parsed.month;
  let days = now.getDate() - parsed.day;
  if (days < 0) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return '';
  if (years >= 1) return years === 1 ? '1 año' : `${years} años`;
  if (months >= 1) return months === 1 ? '1 mes' : `${months} meses`;
  if (days <= 1) return 'Recién nacido';
  return `${days} días`;
}
function normalizeSpecies(raw) {
  const s = clean(raw, 20).toLowerCase();
  if (s === 'perro' || s === 'gato' || s === 'otro') return s;
  if (s === 'conejo' || s === 'loro' || s === 'hámster' || s === 'hamster') return s === 'hamster' ? 'hámster' : s;
  return '';
}
function normalizeSize(raw) {
  const s = clean(raw, 20).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (s === 'pequeno' || s === 'mediano' || s === 'grande') return s;
  return '';
}
function normalizeNeutered(value) {
  if (value === true || value === 1 || value === '1' || value === 'si' || value === 'sí' || value === 'true') return 1;
  if (value === false || value === 0 || value === '0' || value === 'no' || value === 'false') return 0;
  return null;
}
function emojiForSpecies(species) {
  if (species === 'perro') return '🐶';
  if (species === 'gato') return '🐱';
  if (species === 'conejo') return '🐰';
  if (species === 'loro') return '🦜';
  if (species === 'hámster') return '🐹';
  return '🐾';
}

function slugHandle(name) {
  const base = String(name || 'pet').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16);
  return (base.length >= 3 ? base : (base + 'pet')).slice(0, 16);
}
function petRow(r) {
  const birthDate = r.birth_date || null;
  const computedAge = ageFromBirthDate(birthDate);
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    username: r.username || null,
    species: r.species,
    breed: r.breed || '',
    age: computedAge || r.age || '',
    bio: r.bio || '',
    emoji: r.emoji || '🐾',
    avatarUrl: r.avatar_url || null,
    createdAt: r.created_at,
    profileId: r.profile_id || null,
    careStatus: r.care_status || null,
    sex: r.sex || null,
    birthDate,
    size: r.size || null,
    neutered: r.neutered == null ? null : Number(r.neutered) === 1,
    adoptionStartedAt: r.adoption_started_at || null,
    archivedAt: r.archived_at || null,
  };
}

async function findOwnedPet(env, petId, userId) {
  const id = clean(petId, 80);
  if (!id) return null;
  const rows = await d1(env, 'SELECT * FROM pets WHERE (id = ? OR LOWER(username) = LOWER(?)) AND user_id = ? LIMIT 1', [id, id, userId]);
  return rows[0] || null;
}

const POST_SELECT = `
  SELECT p.*,
    (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
    (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
    pet.name AS pet_name, pet.emoji AS pet_emoji, pet.avatar_url AS pet_avatar, pet.species AS pet_species, pet.username AS pet_username,
    u.username AS username, u.name AS user_name,
    ap.id AS author_profile_id, ap.type AS author_profile_type, ap.name AS author_profile_name,
    ap.username AS author_profile_username, ap.avatar_url AS author_profile_avatar,
    p.image_w, p.image_h
  FROM posts p
  LEFT JOIN pets pet ON pet.id = p.pet_id
  LEFT JOIN users u ON u.id = p.user_id
  LEFT JOIN profiles ap ON ap.id = p.author_profile_id
`;

// ============================================================
// ALERTAS (animales perdidos/encontrados) — feed independiente,
// filtrado por localidad. Estructura pensada para poder agregar
// después: avistamientos, "mascota recuperada", coincidencias,
// notificaciones, radio de búsqueda y mapa — sin migrar datos.
// ============================================================

function alertRow(r, viewerLiked) {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type, // 'lost' | 'found' (futuro: 'sighting', 'reunited')
    status: r.status, // 'active' (futuro: 'resolved')
    petName: r.pet_name || null,
    species: r.species,
    breed: r.breed || '',
    description: r.description || '',
    image: r.image,
    locality: r.locality,
    province: r.province || '',
    country: r.country || 'AR',
    lat: r.lat ?? null,
    lon: r.lon ?? null,
    eventDate: r.event_date ?? null,
    createdAt: r.created_at,
    likeCount: r.like_count || 0,
    commentCount: r.comment_count || 0,
    isLiked: !!viewerLiked,
    username: r.username || null,
    userName: r.user_name || null,
    userAvatar: r.user_avatar || null,
  };
}

const ALERT_SELECT = `
  SELECT a.*,
    (SELECT COUNT(*) FROM alert_likes al WHERE al.alert_id = a.id) AS like_count,
    (SELECT COUNT(*) FROM alert_comments ac WHERE ac.alert_id = a.id) AS comment_count,
    u.username AS username, u.name AS user_name, u.avatar_url AS user_avatar
  FROM alerts a
  LEFT JOIN users u ON u.id = a.user_id
`;

// Marca isLiked en un array de filas de alerta ya resueltas, para un
// viewer opcional (puede ser null si no hay sesión).
async function attachLikedFlags(env, rows, viewerId) {
  if (!viewerId || rows.length === 0) return rows.map((r) => alertRow(r, false));
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => '?').join(',');
  const liked = await d1(env, `SELECT alert_id FROM alert_likes WHERE user_id = ? AND alert_id IN (${ph})`, [viewerId, ...ids]);
  const likedSet = new Set(liked.map((l) => l.alert_id));
  return rows.map((r) => alertRow(r, likedSet.has(r.id)));
}

// ============================================================
// MERCADO (productos y servicios) — cada usuario que publica
// obtiene automáticamente una "mini-tienda" (su propio perfil +
// sus publicaciones + reseñas agregadas), sin tabla de tiendas
// separada. Precio en "Patitas" (unidad interna, sin billetera
// real todavía). Preparado para agregar más adelante: pedidos,
// pagos, envíos y publicidad destacada (columna `featured`).
// ============================================================

function listingRow(r, viewerFavorited) {
  let images = [];
  try {
    images = JSON.parse(r.images || '[]');
  } catch {}
  return {
    id: r.id,
    userId: r.user_id,
    kind: r.kind, // 'product' | 'service'
    title: r.title,
    category: r.category,
    description: r.description || '',
    pricePatitas: r.price_patitas || 0,
    priceArs: r.price_ars ?? null,
    stock: r.stock ?? null,
    deliveryMethod: r.delivery_method || null,
    modality: r.modality || null,
    availability: r.availability || null,
    images,
    locality: r.locality,
    province: r.province || '',
    country: r.country || 'AR',
    lat: r.lat ?? null,
    lon: r.lon ?? null,
    status: r.status,
    featured: !!r.featured,
    viewsCount: r.views_count || 0,
    createdAt: r.created_at,
    favoriteCount: r.favorite_count || 0,
    commentCount: r.comment_count || 0,
    isFavorited: !!viewerFavorited,
    username: r.username || null,
    userName: r.user_name || null,
    userAvatar: r.user_avatar || null,
    sellerRating: r.seller_rating != null ? Math.round(r.seller_rating * 10) / 10 : null,
    sellerReviewCount: r.seller_review_count || 0,
  };
}

const LISTING_SELECT = `
  SELECT l.*,
    (SELECT COUNT(*) FROM listing_favorites f WHERE f.listing_id = l.id) AS favorite_count,
    (SELECT COUNT(*) FROM listing_comments c WHERE c.listing_id = l.id) AS comment_count,
    u.username AS username, u.name AS user_name, u.avatar_url AS user_avatar,
    (SELECT AVG(rating) FROM seller_reviews sr WHERE sr.seller_user_id = l.user_id) AS seller_rating,
    (SELECT COUNT(*) FROM seller_reviews sr WHERE sr.seller_user_id = l.user_id) AS seller_review_count
  FROM listings l
  LEFT JOIN users u ON u.id = l.user_id
`;

async function attachFavoritedFlags(env, rows, viewerId) {
  if (!viewerId || rows.length === 0) return rows.map((r) => listingRow(r, false));
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => '?').join(',');
  const favs = await d1(env, `SELECT listing_id FROM listing_favorites WHERE user_id = ? AND listing_id IN (${ph})`, [viewerId, ...ids]);
  const favSet = new Set(favs.map((f) => f.listing_id));
  return rows.map((r) => listingRow(r, favSet.has(r.id)));
}

async function handleDb(request, env) {
  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 40);
  const now = Date.now();

  try {
    await ensureAuthSchema(env);
    await ensureProfilesSchema(env);
    await ensureActivityEventsSchema(env);
    await ensurePushSchema(env);

    if (action === 'checkProfileUsername') {
      const username = clean(body.username, 20).toLowerCase();
      if (isReservedPublicUsername(username)) return json({ ok: true, available: false, reason: 'reserved' });
      if (!USERNAME_RE.test(username) || usernameLooksLikePhone(username)) {
        return json({ ok: true, available: false, reason: 'invalid' });
      }
      const taken = await usernameTaken(env, username, null);
      return json({ ok: true, available: !taken });
    }

    if (action === 'publicProfile') {
      const profileId = clean(body.profileId, 80);
      const username = clean(body.username, 20).toLowerCase();
      if (username && isReservedPublicUsername(username)) {
        return json({ error: 'Perfil no encontrado' }, 404);
      }
      let rows = profileId
        ? await d1(env, 'SELECT * FROM profiles WHERE id = ?', [profileId])
        : username
          ? await d1(env, 'SELECT * FROM profiles WHERE LOWER(username) = ?', [username])
          : [];
      if (!rows[0] && username && !profileId) {
        const users = await d1(env, 'SELECT * FROM users WHERE LOWER(username) = ?', [username]);
        if (!users[0]) return json({ error: 'Perfil no encontrado' }, 404);
        const u = users[0];
        const viewerId = await authUser(request, env, body);
        const [pets, followers, following] = await Promise.all([
          d1(env, 'SELECT * FROM pets WHERE user_id = ? AND archived_at IS NULL ORDER BY created_at ASC', [u.id]),
          d1(env, "SELECT COUNT(*) AS n FROM follows WHERE target_type = 'user' AND target_id = ?", [u.id]),
          viewerId
            ? d1(env, "SELECT 1 FROM follows WHERE user_id = ? AND target_type = 'user' AND target_id = ? LIMIT 1", [viewerId, u.id])
            : Promise.resolve([]),
        ]);
        return json({
          ok: true,
          profile: {
            id: `personal-${u.id}`,
            accountId: u.id,
            type: 'personal',
            name: u.name,
            username: u.username,
            avatar: u.avatar_url || null,
            bio: u.bio || '',
            location: u.location || '',
            phone: '',
            createdAt: u.created_at,
          },
          pets: pets.map(petRow),
          transferredPets: [],
          stats: {
            pets: pets.length,
            adoption: 0,
            adopted: 0,
            recovering: 0,
            followers: followers[0]?.n || 0,
          },
          isOwner: viewerId === u.id,
          isFollowing: following.length > 0,
        });
      }
      if (!rows[0]) return json({ error: 'Perfil no encontrado' }, 404);
      const pr = rows[0];
      const viewerId = await authUser(request, env, body);
      // Mascotas = todas las asociadas HOY a este perfil (profile_id),
      // sin importar care_status. Adoptados = transferencias históricas.
      const [pets, petCount, adopted, recovering, transferred, followers, following] = await Promise.all([
        d1(env, 'SELECT * FROM pets WHERE profile_id = ? AND archived_at IS NULL ORDER BY created_at DESC', [pr.id]),
        d1(env, 'SELECT COUNT(*) AS n FROM pets WHERE profile_id = ? AND archived_at IS NULL', [pr.id]),
        d1(env, 'SELECT COUNT(*) AS n FROM pet_transfers WHERE from_profile_id = ?', [pr.id]),
        d1(env, "SELECT COUNT(*) AS n FROM pets WHERE profile_id = ? AND archived_at IS NULL AND care_status = 'en_recuperacion'", [pr.id]),
        d1(
          env,
          `SELECT p.* FROM pet_transfers t
           JOIN pets p ON p.id = t.pet_id
           WHERE t.from_profile_id = ?
           ORDER BY t.created_at DESC`,
          [pr.id]
        ),
        d1(env, "SELECT COUNT(*) AS n FROM follows WHERE target_type = 'profile' AND target_id = ?", [pr.id]),
        viewerId
          ? d1(env, "SELECT 1 FROM follows WHERE user_id = ? AND target_type = 'profile' AND target_id = ? LIMIT 1", [viewerId, pr.id])
          : Promise.resolve([]),
      ]);
      const petsN = petCount[0]?.n || 0;
      const recoveringN = recovering[0]?.n || 0;
      return json({
        ok: true,
        profile: profileRow(pr),
        pets: pets.map(petRow),
        transferredPets: transferred.map(petRow),
        stats: {
          pets: petsN,
          adoption: Math.max(0, petsN - recoveringN),
          adopted: adopted[0]?.n || 0,
          recovering: recoveringN,
          followers: followers[0]?.n || 0,
        },
        isOwner: viewerId === pr.account_id,
        isFollowing: following.length > 0,
      });
    }

    if (action === 'profilePosts') {
      const profileId = clean(body.profileId, 80);
      if (!profileId) return json({ error: 'Falta el perfil' }, 400);
      const rows = await d1(env, `${POST_SELECT} WHERE p.author_profile_id = ? ORDER BY p.created_at DESC LIMIT 60`, [profileId]);
      return json({ ok: true, posts: rows.map(postRow) });
    }

    // ---------- Lecturas públicas ----------

    if (action === 'health') {
      await d1(env, 'SELECT 1');
      return json({ ok: true, provider: 'd1-worker' });
    }

    if (action === 'feed') {
      const before = Number(body.before) || now + 1000;
      const limit = Math.min(Number(body.limit) || 10, 30);
      const rows = await d1(env, `${POST_SELECT} WHERE p.created_at < ? ORDER BY p.created_at DESC LIMIT ?`, [before, limit]);
      return json({ ok: true, posts: rows.map(postRow) });
    }

    if (action === 'petPosts') {
      const petId = clean(body.petId, 80);
      const found = await d1(env, 'SELECT id FROM pets WHERE id = ? OR LOWER(username) = LOWER(?) LIMIT 1', [petId, petId]);
      const realId = found[0]?.id || petId;
      const rows = await d1(env, `${POST_SELECT} WHERE p.pet_id = ? ORDER BY p.created_at DESC LIMIT 60`, [realId]);
      return json({ ok: true, posts: rows.map(postRow) });
    }

    if (action === 'userPosts') {
      const targetId = clean(body.targetUserId, 80);
      const rows = await d1(env, `${POST_SELECT} WHERE p.user_id = ? ORDER BY p.created_at DESC LIMIT 60`, [targetId]);
      return json({ ok: true, posts: rows.map(postRow) });
    }

    if (action === 'postDetail') {
      const postId = clean(body.postId, 80);
      const [posts, comments] = await Promise.all([
        d1(env, `${POST_SELECT} WHERE p.id = ?`, [postId]),
        d1(
          env,
          `SELECT c.*, u.username, u.name AS user_name, u.avatar_url
           FROM comments c LEFT JOIN users u ON u.id = c.user_id
           WHERE c.post_id = ? ORDER BY c.created_at ASC LIMIT 200`,
          [postId]
        ),
      ]);
      if (!posts[0]) return json({ error: 'Publicación no encontrada' }, 404);
      return json({
        ok: true,
        post: postRow(posts[0]),
        comments: comments.map((c) => ({
          id: c.id, userId: c.user_id, username: c.username || 'usuario', userName: c.user_name || 'Usuario',
          avatarUrl: c.avatar_url || null, text: c.text, createdAt: c.created_at,
        })),
      });
    }

    if (action === 'userProfile') {
      const targetId = clean(body.targetUserId, 80);
      const [users, pets, postCount, followerCount, profiles] = await Promise.all([
        d1(env, 'SELECT id, username, name, avatar_url, bio, location, verified_phone, created_at FROM users WHERE id = ?', [targetId]),
        d1(env, 'SELECT * FROM pets WHERE user_id = ? AND archived_at IS NULL ORDER BY created_at ASC', [targetId]),
        d1(env, 'SELECT COUNT(*) AS n FROM posts WHERE user_id = ?', [targetId]),
        d1(env, "SELECT COUNT(*) AS n FROM follows WHERE target_type = 'user' AND target_id = ?", [targetId]),
        d1(env, "SELECT * FROM profiles WHERE account_id = ? AND type != 'personal' ORDER BY created_at ASC", [targetId]),
      ]);
      if (!users[0]) return json({ error: 'Usuario no encontrado' }, 404);
      const u = users[0];
      return json({
        ok: true,
        user: { id: u.id, username: u.username, name: u.name, avatarUrl: u.avatar_url || null, bio: u.bio || '', location: u.location || '', verifiedPhone: u.verified_phone || null },
        pets: pets.map(petRow),
        profiles: profiles.map(profileRow),
        stats: { posts: postCount[0].n, followers: followerCount[0].n },
      });
    }

    if (action === 'petProfile') {
      const petId = clean(body.petId, 80);
      const pets = await d1(env, 'SELECT * FROM pets WHERE id = ? OR LOWER(username) = LOWER(?) LIMIT 1', [petId, petId]);
      if (!pets[0]) return json({ error: 'Mascota no encontrada' }, 404);
      const pet = pets[0];
      const [owners, postCount, followerCount, shelterRows] = await Promise.all([
        d1(env, 'SELECT id, username, name, avatar_url FROM users WHERE id = ?', [pet.user_id]),
        d1(env, 'SELECT COUNT(*) AS n FROM posts WHERE pet_id = ?', [pet.id]),
        d1(env, "SELECT COUNT(*) AS n FROM follows WHERE target_type = 'pet' AND target_id = ?", [pet.id]),
        pet.profile_id
          ? d1(env, "SELECT * FROM profiles WHERE id = ? AND type = 'protector'", [pet.profile_id])
          : Promise.resolve([]),
      ]);
      return json({
        ok: true,
        pet: petRow(pet),
        owner: owners[0] ? { id: owners[0].id, username: owners[0].username, name: owners[0].name, avatarUrl: owners[0].avatar_url || null } : null,
        shelter: shelterRows[0] ? profileRow(shelterRows[0]) : null,
        stats: { posts: postCount[0].n, followers: followerCount[0].n },
      });
    }

    if (action === 'search') {
      const q = `%${clean(body.q, 40).toLowerCase()}%`;
      const [pets, users] = await Promise.all([
        d1(env, 'SELECT * FROM pets WHERE archived_at IS NULL AND (LOWER(name) LIKE ? OR LOWER(breed) LIKE ? OR LOWER(species) LIKE ?) LIMIT 20', [q, q, q]),
        d1(env, 'SELECT id, username, name, avatar_url FROM users WHERE LOWER(username) LIKE ? OR LOWER(name) LIKE ? LIMIT 20', [q, q]),
      ]);
      return json({ ok: true, pets: pets.map(petRow), users: users.map((u) => ({ id: u.id, username: u.username, name: u.name, avatarUrl: u.avatar_url || null })) });
    }

    if (action === 'checkPetUsername') {
      const username = clean(body.username, 20).toLowerCase();
      if (!USERNAME_RE.test(username)) return json({ ok: true, available: false, reason: 'invalid' });
      const excludeId = clean(body.excludePetId, 80);
      const rows = excludeId
        ? await d1(env, 'SELECT id FROM pets WHERE (LOWER(username) = ? OR LOWER(name) = ?) AND id != ? AND LOWER(username) != LOWER(?)', [username, username, excludeId, excludeId])
        : await d1(env, 'SELECT id FROM pets WHERE LOWER(username) = ? OR LOWER(name) = ?', [username, username]);
      return json({ ok: true, available: rows.length === 0 });
    }
    if (action === 'featuredPets') {
      const rows = await d1(env, 'SELECT * FROM pets WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 20');
      return json({ ok: true, pets: rows.map(petRow) });
    }

    if (action === 'comments') {
      const postId = clean(body.postId, 80);
      const rows = await d1(
        env,
        `SELECT c.*, u.username, u.name AS user_name, u.avatar_url
         FROM comments c LEFT JOIN users u ON u.id = c.user_id
         WHERE c.post_id = ? ORDER BY c.created_at ASC LIMIT 200`,
        [postId]
      );
      return json({
        ok: true,
        comments: rows.map((c) => ({
          id: c.id, userId: c.user_id, username: c.username || 'usuario', userName: c.user_name || 'Usuario',
          avatarUrl: c.avatar_url || null, text: c.text, createdAt: c.created_at,
        })),
      });
    }

    // ---------- Tiempo real (lecturas incrementales) ----------

    if (action === 'updates') {
      const since = Number(body.since) || 0;
      const exclude = clean(body.excludeUserId, 80);
      const rows = await d1(env, 'SELECT COUNT(*) AS n, MAX(created_at) AS latest FROM posts WHERE created_at > ? AND user_id != ?', [since, exclude]);
      return json({ ok: true, newPosts: rows[0].n, latest: rows[0].latest || since });
    }

    if (action === 'feedSince') {
      const since = Number(body.since) || 0;
      const exclude = clean(body.excludeUserId, 80);
      const rows = await d1(env, `${POST_SELECT} WHERE p.created_at > ? AND p.user_id != ? ORDER BY p.created_at DESC LIMIT 30`, [since, exclude]);
      return json({ ok: true, posts: rows.map(postRow) });
    }

    if (action === 'postUpdates') {
      const postId = clean(body.postId, 80);
      const since = Number(body.since) || 0;
      const [counts, newComments] = await Promise.all([
        d1(env, 'SELECT (SELECT COUNT(*) FROM likes WHERE post_id = ?) AS likes, (SELECT COUNT(*) FROM comments WHERE post_id = ?) AS comments', [postId, postId]),
        d1(env, `SELECT c.*, u.username, u.name AS user_name, u.avatar_url FROM comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.post_id = ? AND c.created_at > ? ORDER BY c.created_at ASC LIMIT 50`, [postId, since]),
      ]);
      return json({
        ok: true,
        likeCount: counts[0].likes,
        commentCount: counts[0].comments,
        newComments: newComments.map((c) => ({
          id: c.id, userId: c.user_id, username: c.username || 'usuario', userName: c.user_name || 'Usuario',
          avatarUrl: c.avatar_url || null, text: c.text, createdAt: c.created_at,
        })),
      });
    }

    if (action === 'counts') {
      const ids = Array.isArray(body.postIds) ? body.postIds.slice(0, 30).map((x) => clean(x, 80)).filter(Boolean) : [];
      if (ids.length === 0) return json({ ok: true, counts: {} });
      const ph = ids.map(() => '?').join(',');
      const [likeRows, commentRows] = await Promise.all([
        d1(env, `SELECT post_id, COUNT(*) AS n FROM likes WHERE post_id IN (${ph}) GROUP BY post_id`, ids),
        d1(env, `SELECT post_id, COUNT(*) AS n FROM comments WHERE post_id IN (${ph}) GROUP BY post_id`, ids),
      ]);
      const counts = {};
      ids.forEach((id) => (counts[id] = { likes: 0, comments: 0 }));
      likeRows.forEach((r) => (counts[r.post_id] = { ...counts[r.post_id], likes: r.n }));
      commentRows.forEach((r) => (counts[r.post_id] = { ...(counts[r.post_id] || { likes: 0 }), comments: r.n }));
      return json({ ok: true, counts });
    }

    // ---------- Alertas (animales perdidos/encontrados) ----------
    // Lectura pública, filtrada por localidad; la sesión es opcional
    // (si viene token, se marca isLiked correctamente por usuario).
    if (action === 'alertsFeed') {
      const locality = clean(body.locality, 100);
      if (!locality) return json({ error: 'Falta la localidad' }, 400);
      const before = Number(body.before) || now + 1000;
      const limit = Math.min(Number(body.limit) || 10, 30);
      const viewerId = await authUser(request, env, body);
      const rows = await d1(
        env,
        `${ALERT_SELECT} WHERE LOWER(a.locality) = LOWER(?) AND a.created_at < ? ORDER BY a.created_at DESC LIMIT ?`,
        [locality, before, limit + 1]
      );
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const alerts = await attachLikedFlags(env, page, viewerId);
      return json({ ok: true, alerts, hasMore });
    }

    if (action === 'alertDetail') {
      const alertId = clean(body.alertId, 80);
      const viewerId = await authUser(request, env, body);
      const rows = await d1(env, `${ALERT_SELECT} WHERE a.id = ?`, [alertId]);
      if (!rows[0]) return json({ error: 'Alerta no encontrada' }, 404);
      const [alert] = await attachLikedFlags(env, rows, viewerId);
      return json({ ok: true, alert });
    }

    if (action === 'alertComments') {
      const alertId = clean(body.alertId, 80);
      const rows = await d1(
        env,
        `SELECT c.*, u.username, u.name AS user_name, u.avatar_url
         FROM alert_comments c LEFT JOIN users u ON u.id = c.user_id
         WHERE c.alert_id = ? ORDER BY c.created_at ASC LIMIT 200`,
        [alertId]
      );
      return json({
        ok: true,
        comments: rows.map((c) => ({
          id: c.id, userId: c.user_id, username: c.username || 'usuario', userName: c.user_name || 'Usuario',
          avatarUrl: c.avatar_url || null, text: c.text, createdAt: c.created_at,
        })),
      });
    }

    // ---------- Mercado (productos y servicios) ----------
    // Lectura pública; sesión opcional (isFavorited correcto si hay token).
    // `section` ajusta el orden/filtro: 'nearby' (localidad), 'featured'
    // (destacados, con fallback a recientes), 'top_rated' (mejor valorados),
    // o el valor por defecto (recién publicados).
    if (action === 'listingsFeed') {
      const kind = body.kind === 'service' ? 'service' : 'product';
      const locality = clean(body.locality, 100);
      const category = clean(body.category, 40);
      const section = clean(body.section, 20) || 'recent';
      const q = clean(body.q, 80).toLowerCase();
      const before = Number(body.before) || now + 1000;
      const limit = Math.min(Number(body.limit) || 10, 30);
      const viewerId = await authUser(request, env, body);

      const conditions = ["l.status = 'active'", 'l.kind = ?'];
      const params = [kind];
      if (category) {
        conditions.push('l.category = ?');
        params.push(category);
      }
      if (q) {
        conditions.push('(LOWER(l.title) LIKE ? OR LOWER(l.description) LIKE ?)');
        params.push(`%${q}%`, `%${q}%`);
      }
      if (section === 'nearby' && locality) {
        conditions.push('LOWER(l.locality) = LOWER(?)');
        params.push(locality);
      }
      conditions.push('l.created_at < ?');
      params.push(before);

      let orderBy = 'l.created_at DESC';
      if (section === 'featured') orderBy = 'l.featured DESC, l.created_at DESC';
      if (section === 'top_rated') orderBy = 'seller_rating DESC, l.created_at DESC';

      const sql = `${LISTING_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY ${orderBy} LIMIT ?`;
      params.push(limit + 1);
      const rows = await d1(env, sql, params);
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const listings = await attachFavoritedFlags(env, page, viewerId);
      return json({ ok: true, listings, hasMore });
    }

    if (action === 'listingDetail') {
      const listingId = clean(body.listingId, 80);
      const viewerId = await authUser(request, env, body);
      const rows = await d1(env, `${LISTING_SELECT} WHERE l.id = ?`, [listingId]);
      if (!rows[0]) return json({ error: 'Publicación no encontrada' }, 404);
      const [listing] = await attachFavoritedFlags(env, rows, viewerId);
      return json({ ok: true, listing });
    }

    if (action === 'listingComments') {
      const listingId = clean(body.listingId, 80);
      const rows = await d1(
        env,
        `SELECT c.*, u.username, u.name AS user_name, u.avatar_url
         FROM listing_comments c LEFT JOIN users u ON u.id = c.user_id
         WHERE c.listing_id = ? ORDER BY c.created_at ASC LIMIT 200`,
        [listingId]
      );
      return json({
        ok: true,
        comments: rows.map((c) => ({
          id: c.id, userId: c.user_id, username: c.username || 'usuario', userName: c.user_name || 'Usuario',
          avatarUrl: c.avatar_url || null, text: c.text, createdAt: c.created_at,
        })),
      });
    }

    if (action === 'listingView') {
      const listingId = clean(body.listingId, 80);
      if (listingId) await d1(env, 'UPDATE listings SET views_count = views_count + 1 WHERE id = ?', [listingId]).catch(() => {});
      return json({ ok: true });
    }

    if (action === 'sellerProfile') {
      const targetId = clean(body.targetUserId, 80);
      const [users, productCount, serviceCount, reviewStats, followerCount] = await Promise.all([
        d1(env, 'SELECT id, username, name, avatar_url, bio, location FROM users WHERE id = ?', [targetId]),
        d1(env, "SELECT COUNT(*) AS n FROM listings WHERE user_id = ? AND kind = 'product' AND status = 'active'", [targetId]),
        d1(env, "SELECT COUNT(*) AS n FROM listings WHERE user_id = ? AND kind = 'service' AND status = 'active'", [targetId]),
        d1(env, 'SELECT AVG(rating) AS avg_rating, COUNT(*) AS n FROM seller_reviews WHERE seller_user_id = ?', [targetId]),
        d1(env, "SELECT COUNT(*) AS n FROM follows WHERE target_type = 'user' AND target_id = ?", [targetId]),
      ]);
      if (!users[0]) return json({ error: 'Vendedor no encontrado' }, 404);
      const u = users[0];
      return json({
        ok: true,
        seller: { id: u.id, username: u.username, name: u.name, avatarUrl: u.avatar_url || null, bio: u.bio || '', location: u.location || '' },
        stats: {
          products: productCount[0].n,
          services: serviceCount[0].n,
          rating: reviewStats[0].avg_rating != null ? Math.round(reviewStats[0].avg_rating * 10) / 10 : null,
          reviewCount: reviewStats[0].n,
          followers: followerCount[0].n,
        },
      });
    }

    if (action === 'sellerListings') {
      const targetId = clean(body.targetUserId, 80);
      const kind = body.kind === 'service' ? 'service' : 'product';
      const viewerId = await authUser(request, env, body);
      const rows = await d1(
        env,
        `${LISTING_SELECT} WHERE l.user_id = ? AND l.kind = ? AND l.status = 'active' ORDER BY l.created_at DESC LIMIT 60`,
        [targetId, kind]
      );
      const listings = await attachFavoritedFlags(env, rows, viewerId);
      return json({ ok: true, listings });
    }

    if (action === 'sellerReviews') {
      const targetId = clean(body.targetUserId, 80);
      const rows = await d1(
        env,
        `SELECT sr.*, u.username, u.name AS user_name, u.avatar_url
         FROM seller_reviews sr LEFT JOIN users u ON u.id = sr.reviewer_user_id
         WHERE sr.seller_user_id = ? ORDER BY sr.created_at DESC LIMIT 100`,
        [targetId]
      );
      return json({
        ok: true,
        reviews: rows.map((r) => ({
          id: r.id, rating: r.rating, text: r.text || '', createdAt: r.created_at,
          username: r.username || 'usuario', userName: r.user_name || 'Usuario', avatarUrl: r.avatar_url || null,
        })),
      });
    }

    // ---------- Chapitas QR (links de invitación para registrar mascotas) ----------
    // Público: cualquiera que escanee una chapita puede consultar su estado,
    // incluso sin haber iniciado sesión todavía (primera vez que se escanea).
    if (action === 'tagStatus') {
      const code = Number(body.code);
      if (!Number.isInteger(code)) return json({ error: 'Código inválido' }, 400);
      const rows = await d1(env, 'SELECT * FROM pet_tags WHERE code = ?', [code]);
      if (!rows[0]) return json({ ok: true, exists: false });
      const tag = rows[0];
      if (tag.status === 'claimed' && tag.pet_id) {
        const pets = await d1(env, 'SELECT * FROM pets WHERE id = ?', [tag.pet_id]);
        return json({ ok: true, exists: true, status: 'claimed', pet: pets[0] ? petRow(pets[0]) : null });
      }
      return json({ ok: true, exists: true, status: 'unclaimed' });
    }

    // ---------- Compartir ubicación (público, con consentimiento GPS del visitante) ----------
    // El navegador siempre pide permiso visible antes de dar la ubicación;
    // este endpoint solo recibe el resultado YA consentido y lo envía por SMS
    // al dueño de la mascota (su teléfono verificado).
    if (action === 'shareLocation') {
      const petRef = clean(body.petId, 80);
      const lat = Number(body.lat);
      const lon = Number(body.lon);
      const accuracy = body.accuracy != null ? Number(body.accuracy) : null;
      if (!petRef || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        return json({ error: 'Faltan datos de ubicación' }, 400);
      }
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        return json({ error: 'Coordenadas inválidas' }, 400);
      }

      const pets = await d1(
        env,
        'SELECT id, name, user_id FROM pets WHERE id = ? OR LOWER(username) = LOWER(?) LIMIT 1',
        [petRef, petRef]
      );
      if (!pets[0]) return json({ error: 'Mascota no encontrada' }, 404);
      const pet = pets[0];

      const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || '';
      if (shareLocationLimited(ip, pet.id, now)) {
        return json({ error: 'Esperá un momento antes de volver a compartir la ubicación.' }, 429);
      }

      const owners = await d1(env, 'SELECT id, name, verified_phone FROM users WHERE id = ?', [pet.user_id]);
      const owner = owners[0];

      const id = `loc-${now}-${Math.random().toString(36).slice(2, 8)}`;
      let status = 'no_phone';
      let smsResult = null;

      if (owner && owner.verified_phone) {
        const mapsUrl = `https://maps.google.com/?q=${lat},${lon}`;
        const precision = accuracy ? ` (precisión ±${Math.round(accuracy)}m)` : '';
        const msg = `🐾 Animaldex: alguien compartió su ubicación en el perfil de ${pet.name}${precision}.\n📍 ${mapsUrl}`;
        smsResult = await sendTwilioSms(env, owner.verified_phone, msg);
        status = smsResult.ok ? 'sent' : smsResult.provider === 'demo' ? 'demo' : 'failed';
      }

      await d1(
        env,
        'INSERT INTO location_shares (id, pet_id, owner_id, lat, lon, accuracy, sms_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, pet.id, pet.user_id, lat, lon, accuracy, status, now]
      );

      try {
        await notifyUserPush(env, {
          userId: pet.user_id,
          type: 'location',
          idempotencyKey: locationPushIdempotencyKey(id),
          nowMs: now,
          buildMessage: (token) =>
            locationPushMessage({
              token,
              petName: pet.name,
              petId: pet.id,
              shareId: id,
            }),
        });
      } catch (_) {}

      return json({ ok: true, status, notified: status === 'sent' });
    }

    // ---------- Escrituras (requieren sesión) ----------

    const userId = await authUser(request, env, body);
    if (!userId) return json({ error: 'Inicia sesión para continuar' }, 401);

    if (action === 'registerPushToken') {
      const expoPushToken = clean(body.expoPushToken, 200);
      const platform = clean(body.platform, 20) || 'android';
      const deviceId = clean(body.deviceId, 80) || null;
      if (!isExpoPushToken(expoPushToken)) return json({ error: 'Token de push inválido' }, 400);
      const existing = await d1(env, 'SELECT * FROM user_push_tokens WHERE expo_push_token = ?', [expoPushToken]);
      const planned = assignPushToken(mapPushTokenRow(existing[0]) || null, {
        userId,
        expoPushToken,
        platform,
        deviceId,
        now,
        newId: `ptok-${now}-${Math.random().toString(36).slice(2, 8)}`,
      });
      if (planned.action === 'insert') {
        await d1(
          env,
          `INSERT INTO user_push_tokens
            (id, user_id, expo_push_token, platform, device_id, enabled, created_at, updated_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
          [
            planned.row.id,
            planned.row.userId,
            planned.row.expoPushToken,
            planned.row.platform,
            planned.row.deviceId,
            planned.row.createdAt,
            planned.row.updatedAt,
            planned.row.lastSeenAt,
          ]
        );
      } else {
        await d1(
          env,
          `UPDATE user_push_tokens
              SET user_id = ?, platform = ?, device_id = ?, enabled = 1, updated_at = ?, last_seen_at = ?
            WHERE expo_push_token = ?`,
          [planned.row.userId, planned.row.platform, planned.row.deviceId, planned.row.updatedAt, planned.row.lastSeenAt, expoPushToken]
        );
      }
      return json({ ok: true, action: planned.action });
    }

    if (action === 'unregisterPushToken') {
      const expoPushToken = clean(body.expoPushToken, 200);
      if (!isExpoPushToken(expoPushToken)) return json({ ok: true });
      await d1(
        env,
        'UPDATE user_push_tokens SET enabled = 0, updated_at = ? WHERE expo_push_token = ? AND user_id = ?',
        [now, expoPushToken, userId]
      );
      return json({ ok: true });
    }

    // Vincula una chapita QR (todavía sin asignar) a una mascota del usuario
    // autenticado. Se usa justo después de crear la mascota en el flujo de
    // "escaneé una chapita → me registro → registro a mi mascota".
    if (action === 'claimTag') {
      const code = Number(body.code);
      const petId = clean(body.petId, 80);
      if (!Number.isInteger(code)) return json({ error: 'Código inválido' }, 400);
      const tags = await d1(env, 'SELECT * FROM pet_tags WHERE code = ?', [code]);
      if (!tags[0]) return json({ error: 'Chapita no encontrada' }, 404);
      if (tags[0].status === 'claimed') return json({ error: 'Esta chapita ya fue asignada a una mascota' }, 409);
      const pets = await d1(env, 'SELECT id FROM pets WHERE id = ? AND user_id = ?', [petId, userId]);
      if (!pets[0]) return json({ error: 'Esa mascota no es tuya' }, 403);
      await d1(
        env,
        "UPDATE pet_tags SET status = 'claimed', pet_id = ?, claimed_by_user_id = ?, claimed_at = ? WHERE code = ?",
        [petId, userId, now, code]
      );
      return json({ ok: true });
    }

    // Panel de administrador: solo ADMIN_USERNAMES puede generar y listar chapitas.
    if (action === 'createTag' || action === 'listTags') {
      const admins = await d1(env, 'SELECT username FROM users WHERE id = ?', [userId]);
      const username = admins[0]?.username || '';
      if (!ADMIN_USERNAMES.includes(username)) return json({ error: 'No autorizado' }, 403);

      if (action === 'createTag') {
        const maxRows = await d1(env, 'SELECT MAX(code) AS m FROM pet_tags');
        const nextCode = (maxRows[0].m || 0) + 1;
        await d1(env, 'INSERT INTO pet_tags (code, status, created_by, created_at) VALUES (?, ?, ?, ?)', [
          nextCode, 'unclaimed', userId, now,
        ]);
        return json({ ok: true, code: nextCode });
      }

      // listTags
      const rows = await d1(
        env,
        `SELECT t.*, p.name AS pet_name, p.emoji AS pet_emoji, p.avatar_url AS pet_avatar
         FROM pet_tags t LEFT JOIN pets p ON p.id = t.pet_id
         ORDER BY t.code DESC`
      );
      return json({
        ok: true,
        tags: rows.map((r) => ({
          code: r.code,
          status: r.status,
          petId: r.pet_id || null,
          petName: r.pet_name || null,
          petEmoji: r.pet_emoji || null,
          petAvatar: r.pet_avatar || null,
          createdAt: r.created_at,
          claimedAt: r.claimed_at || null,
        })),
      });
    }

    if (action === 'myState') {
      const [likes, saves, follows, pets] = await Promise.all([
        d1(env, 'SELECT post_id FROM likes WHERE user_id = ?', [userId]),
        d1(env, 'SELECT post_id FROM saves WHERE user_id = ?', [userId]),
        d1(env, 'SELECT target_type, target_id FROM follows WHERE user_id = ?', [userId]),
        d1(env, 'SELECT * FROM pets WHERE user_id = ? AND archived_at IS NULL ORDER BY created_at ASC', [userId]),
      ]);
      return json({
        ok: true,
        state: {
          likedPosts: likes.map((r) => r.post_id),
          savedPosts: saves.map((r) => r.post_id),
          followedPets: follows.filter((r) => r.target_type === 'pet').map((r) => r.target_id),
          followedUsers: follows.filter((r) => r.target_type === 'user').map((r) => r.target_id),
          myPets: pets.map(petRow),
        },
      });
    }

    if (action === 'like') {
      const postId = clean(body.postId, 80);
      if (body.value) await d1(env, 'INSERT OR IGNORE INTO likes (user_id, post_id, created_at) VALUES (?, ?, ?)', [userId, postId, now]);
      else await d1(env, 'DELETE FROM likes WHERE user_id = ? AND post_id = ?', [userId, postId]);
      const count = await d1(env, 'SELECT COUNT(*) AS n FROM likes WHERE post_id = ?', [postId]);
      return json({ ok: true, likeCount: count[0].n });
    }

    if (action === 'save') {
      const postId = clean(body.postId, 80);
      if (body.value) await d1(env, 'INSERT OR IGNORE INTO saves (user_id, post_id, created_at) VALUES (?, ?, ?)', [userId, postId, now]);
      else await d1(env, 'DELETE FROM saves WHERE user_id = ? AND post_id = ?', [userId, postId]);
      return json({ ok: true });
    }

    if (action === 'savedPosts') {
      const rows = await d1(env, `${POST_SELECT} WHERE p.id IN (SELECT post_id FROM saves WHERE user_id = ?) ORDER BY p.created_at DESC LIMIT 60`, [userId]);
      return json({ ok: true, posts: rows.map(postRow) });
    }

    if (action === 'follow') {
      const targetType = body.targetType === 'user' ? 'user' : body.targetType === 'profile' ? 'profile' : 'pet';
      const targetId = clean(body.targetId, 80);
      if (body.value) await d1(env, 'INSERT OR IGNORE INTO follows (user_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?)', [userId, targetType, targetId, now]);
      else await d1(env, 'DELETE FROM follows WHERE user_id = ? AND target_type = ? AND target_id = ?', [userId, targetType, targetId]);
      return json({ ok: true });
    }

    if (action === 'comment') {
      const postId = clean(body.postId, 80);
      const text = clean(body.text, 500);
      if (!text) return json({ error: 'Comentario vacío' }, 400);
      const id = `c-${now}-${Math.random().toString(36).slice(2, 8)}`;
      await d1(env, 'INSERT INTO comments (id, post_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)', [id, postId, userId, text, now]);
      return json({ ok: true, id, createdAt: now });
    }

    // ---------- Alertas: escrituras (requieren sesión) ----------

    if (action === 'createAlert') {
      const type = body.type === 'found' ? 'found' : 'lost';
      const petName = clean(body.petName, 40);
      const species = clean(body.species, 20) || 'perro';
      const breed = clean(body.breed, 60);
      const description = clean(body.description, 600);
      const image = clean(body.image, 2000);
      const locality = clean(body.locality, 100);
      const province = clean(body.province, 100);
      const country = clean(body.country, 10) || 'AR';
      const lat = body.lat != null && Number.isFinite(Number(body.lat)) ? Number(body.lat) : null;
      const lon = body.lon != null && Number.isFinite(Number(body.lon)) ? Number(body.lon) : null;
      const eventDate = body.eventDate != null && Number.isFinite(Number(body.eventDate)) ? Number(body.eventDate) : now;

      if (!image) return json({ error: 'Falta la foto del animal' }, 400);
      if (image.startsWith('data:')) return json({ error: 'La imagen debe subirse primero a Cloudflare' }, 400);
      if (!description) return json({ error: 'Agrega una descripción' }, 400);
      if (!locality) return json({ error: 'Falta la localidad del hecho' }, 400);

      const id = `alert-${now}-${Math.random().toString(36).slice(2, 8)}`;
      await d1(
        env,
        `INSERT INTO alerts (id, user_id, type, status, pet_name, species, breed, description, image, locality, province, country, lat, lon, event_date, created_at)
         VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, userId, type, petName || null, species, breed, description, image, locality, province || null, country, lat, lon, eventDate, now]
      );
      const rows = await d1(env, `${ALERT_SELECT} WHERE a.id = ?`, [id]);
      const [alert] = await attachLikedFlags(env, rows, userId);
      return json({ ok: true, alert });
    }

    if (action === 'alertLike') {
      const alertId = clean(body.alertId, 80);
      if (body.value) await d1(env, 'INSERT OR IGNORE INTO alert_likes (user_id, alert_id, created_at) VALUES (?, ?, ?)', [userId, alertId, now]);
      else await d1(env, 'DELETE FROM alert_likes WHERE user_id = ? AND alert_id = ?', [userId, alertId]);
      const count = await d1(env, 'SELECT COUNT(*) AS n FROM alert_likes WHERE alert_id = ?', [alertId]);
      return json({ ok: true, likeCount: count[0].n });
    }

    if (action === 'alertComment') {
      const alertId = clean(body.alertId, 80);
      const text = clean(body.text, 500);
      if (!text) return json({ error: 'Comentario vacío' }, 400);
      const id = `ac-${now}-${Math.random().toString(36).slice(2, 8)}`;
      await d1(env, 'INSERT INTO alert_comments (id, alert_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)', [id, alertId, userId, text, now]);
      return json({ ok: true, id, createdAt: now });
    }

    // ---------- Mercado: escrituras (requieren sesión) ----------

    if (action === 'createListing') {
      const kind = body.kind === 'service' ? 'service' : 'product';
      const title = clean(body.title, 100);
      const category = clean(body.category, 40) || 'otros';
      const description = clean(body.description, 1000);
      const pricePatitas = Math.max(0, Math.round(Number(body.pricePatitas) || 0));
      const priceArs =
        body.priceArs != null && Number.isFinite(Number(body.priceArs)) ? Math.max(0, Math.round(Number(body.priceArs))) : null;
      const stock =
        body.stock != null && Number.isFinite(Number(body.stock)) ? Math.max(0, Math.round(Number(body.stock))) : null;
      const deliveryMethod = clean(body.deliveryMethod, 20) || null;
      const modality = clean(body.modality, 20) || null;
      const availability = clean(body.availability, 200) || null;
      const images = Array.isArray(body.images) ? body.images.slice(0, 6).map((x) => clean(x, 2000)).filter(Boolean) : [];
      const locality = clean(body.locality, 100);
      const province = clean(body.province, 100);
      const lat = body.lat != null && Number.isFinite(Number(body.lat)) ? Number(body.lat) : null;
      const lon = body.lon != null && Number.isFinite(Number(body.lon)) ? Number(body.lon) : null;

      if (!title) return json({ error: 'Ponle un nombre a tu publicación' }, 400);
      if (images.length === 0) return json({ error: 'Agrega al menos una foto' }, 400);
      if (images.some((i) => i.startsWith('data:'))) return json({ error: 'Las imágenes deben subirse primero a Cloudflare' }, 400);
      if (!description) return json({ error: 'Agrega una descripción' }, 400);
      if (!locality) return json({ error: 'Falta la ubicación' }, 400);
      if (pricePatitas <= 0) return json({ error: 'Ingresa un precio en Patitas' }, 400);

      const id = `listing-${now}-${Math.random().toString(36).slice(2, 8)}`;
      await d1(
        env,
        `INSERT INTO listings (id, user_id, kind, title, category, description, price_patitas, price_ars, stock, delivery_method, modality, availability, images, locality, province, country, lat, lon, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [id, userId, kind, title, category, description, pricePatitas, priceArs, stock, deliveryMethod, modality, availability, JSON.stringify(images), locality, province || null, 'AR', lat, lon, now]
      );
      const rows = await d1(env, `${LISTING_SELECT} WHERE l.id = ?`, [id]);
      const [listing] = await attachFavoritedFlags(env, rows, userId);
      return json({ ok: true, listing });
    }

    if (action === 'deleteListing') {
      const listingId = clean(body.listingId, 80);
      const rows = await d1(env, 'SELECT id FROM listings WHERE id = ? AND user_id = ?', [listingId, userId]);
      if (!rows[0]) return json({ error: 'Esa publicación no es tuya' }, 403);
      await d1(env, "UPDATE listings SET status = 'removed', updated_at = ? WHERE id = ?", [now, listingId]);
      return json({ ok: true });
    }

    if (action === 'listingFavorite') {
      const listingId = clean(body.listingId, 80);
      if (body.value) await d1(env, 'INSERT OR IGNORE INTO listing_favorites (user_id, listing_id, created_at) VALUES (?, ?, ?)', [userId, listingId, now]);
      else await d1(env, 'DELETE FROM listing_favorites WHERE user_id = ? AND listing_id = ?', [userId, listingId]);
      const count = await d1(env, 'SELECT COUNT(*) AS n FROM listing_favorites WHERE listing_id = ?', [listingId]);
      return json({ ok: true, favoriteCount: count[0].n });
    }

    if (action === 'myFavoriteListings') {
      const rows = await d1(
        env,
        `${LISTING_SELECT} WHERE l.id IN (SELECT listing_id FROM listing_favorites WHERE user_id = ?) AND l.status = 'active' ORDER BY l.created_at DESC LIMIT 60`,
        [userId]
      );
      const listings = await attachFavoritedFlags(env, rows, userId);
      return json({ ok: true, listings });
    }

    if (action === 'listingComment') {
      const listingId = clean(body.listingId, 80);
      const text = clean(body.text, 500);
      if (!text) return json({ error: 'Escribe tu consulta' }, 400);
      const id = `lc-${now}-${Math.random().toString(36).slice(2, 8)}`;
      await d1(env, 'INSERT INTO listing_comments (id, listing_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)', [id, listingId, userId, text, now]);
      return json({ ok: true, id, createdAt: now });
    }

    if (action === 'sellerReview') {
      const targetUserId = clean(body.targetUserId, 80);
      const rating = Math.min(5, Math.max(1, Math.round(Number(body.rating) || 0)));
      const text = clean(body.text, 500);
      if (!targetUserId) return json({ error: 'Falta el vendedor' }, 400);
      if (!Number.isFinite(Number(body.rating)) || rating < 1) return json({ error: 'Selecciona una calificación' }, 400);
      if (targetUserId === userId) return json({ error: 'No puedes calificarte a ti mismo' }, 400);
      const id = `sr-${now}-${Math.random().toString(36).slice(2, 8)}`;
      await d1(
        env,
        `INSERT INTO seller_reviews (id, seller_user_id, reviewer_user_id, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(seller_user_id, reviewer_user_id) DO UPDATE SET rating = excluded.rating, text = excluded.text, created_at = excluded.created_at`,
        [id, targetUserId, userId, rating, text || null, now]
      );
      return json({ ok: true });
    }

    if (action === 'createPost') {
      const petId = clean(body.petId, 80);
      const image = clean(body.image, 2000);
      const imageWidth = Number.isInteger(body.imageWidth) && body.imageWidth > 0 ? body.imageWidth : null;
      const imageHeight = Number.isInteger(body.imageHeight) && body.imageHeight > 0 ? body.imageHeight : null;
      const caption = clean(body.caption, POST_CAPTION_MAX);
      let backgroundId = image ? null : clean(body.backgroundId, 80) || null;
      if (!image && !caption) return json({ error: 'Escribe algo o agrega una foto' }, 400);
      if (image && image.startsWith('data:')) return json({ error: 'La imagen debe subirse primero a Cloudflare' }, 400);
      if (!image) {
        if (!backgroundId || !ALLOWED_POST_BACKGROUNDS.has(backgroundId)) {
          return json({ error: 'Elegí un fondo para la publicación de texto' }, 400);
        }
      } else {
        backgroundId = null;
      }
      if (petId) {
        const pets = await d1(env, 'SELECT id FROM pets WHERE id = ? AND user_id = ?', [petId, userId]);
        if (!pets[0]) return json({ error: 'Esa mascota no es tuya' }, 403);
      }
      let authorProfileId = clean(body.authorProfileId, 80) || null;
      if (authorProfileId) {
        const owned = await d1(env, 'SELECT id FROM profiles WHERE id = ? AND account_id = ?', [authorProfileId, userId]);
        if (!owned[0]) return json({ error: 'Ese perfil no es tuyo' }, 403);
      } else {
        const personal = await ensurePersonalProfile(env, userId);
        authorProfileId = personal ? personal.id : null;
      }
      const id = `post-${now}-${Math.random().toString(36).slice(2, 8)}`;
      await d1(env, 'INSERT INTO posts (id, user_id, pet_id, image, caption, created_at, author_profile_id, image_w, image_h, background_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, userId, petId, image, caption, now, authorProfileId, imageWidth, imageHeight, backgroundId]);
      const rows = await d1(env, `${POST_SELECT} WHERE p.id = ?`, [id]);
      return json({ ok: true, post: postRow(rows[0]) });
    }

    if (action === 'listProfiles') {
      await ensurePersonalProfile(env, userId);
      const rows = await d1(env, 'SELECT * FROM profiles WHERE account_id = ? ORDER BY created_at ASC', [userId]);
      return json({ ok: true, profiles: rows.map(profileRow) });
    }

    if (action === 'createProfile') {
      const type = clean(body.type, 20);
      const name = clean(body.name, 60);
      const username = clean(body.username, 20).toLowerCase();
      const bio = clean(body.bio, 200);
      const avatar = clean(body.avatar, 500) || null;
      if (type !== 'business' && type !== 'protector') {
        return json({ error: 'Solo se pueden crear perfiles de tienda o proteccionista' }, 400);
      }
      if (name.length < 2) return json({ error: 'Escribe el nombre del perfil' }, 400);
      if (!USERNAME_RE.test(username)) {
        return json({ error: 'El usuario debe tener 3-20 caracteres: letras, números, punto o guion bajo' }, 400);
      }
      if (isReservedPublicUsername(username) || usernameLooksLikePhone(username)) {
        return json({ error: 'Ese nombre de usuario no está disponible' }, 400);
      }
      await ensurePersonalProfile(env, userId);
      const counts = await d1(env, 'SELECT type, COUNT(*) AS n FROM profiles WHERE account_id = ? GROUP BY type', [userId]);
      const nOf = (t) => (counts.find((r) => r.type === t)?.n || 0);
      if (type === 'business' && nOf('business') >= 2) {
        return json({ error: 'Ya alcanzaste el límite de 2 perfiles empresariales.' }, 400);
      }
      if (type === 'protector' && nOf('protector') >= 2) {
        return json({ error: 'Ya alcanzaste el límite de 2 perfiles de proteccionista.' }, 400);
      }
      if (nOf('personal') + nOf('business') + nOf('protector') >= 5) {
        return json({ error: 'Ya alcanzaste el límite de 5 perfiles.' }, 400);
      }
      if (await usernameTaken(env, username, null)) {
        return json({ error: 'Ese nombre de usuario ya está en uso' }, 409);
      }
      const id = `prf-${now}-${Math.random().toString(36).slice(2, 8)}`;
      await d1(
        env,
        'INSERT INTO profiles (id, account_id, type, name, username, avatar_url, bio, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, userId, type, name, username, avatar, bio, now]
      );
      const rows = await d1(env, 'SELECT * FROM profiles WHERE id = ?', [id]);
      return json({ ok: true, profile: profileRow(rows[0]) });
    }

    if (action === 'updatePublicProfile') {
      const profileId = clean(body.profileId, 80);
      if (!profileId) return json({ error: 'Falta el perfil' }, 400);
      const owned = await d1(env, 'SELECT * FROM profiles WHERE id = ? AND account_id = ?', [profileId, userId]);
      if (!owned[0]) return json({ error: 'Ese perfil no es tuyo' }, 403);
      if (owned[0].type === 'personal') return json({ error: 'El perfil personal se edita desde tu cuenta' }, 400);
      const name = clean(body.name, 60);
      const username = clean(String(body.username || '').replace(/^@/, ''), 20).toLowerCase();
      const bio = clean(body.bio, 200);
      const location = clean(body.location, 80);
      const phone = clean(body.phone, 30);
      const avatar = clean(body.avatar, 500) || null;
      if (name.length < 2) return json({ error: 'Escribe el nombre del perfil' }, 400);
      if (!USERNAME_RE.test(username)) {
        return json({ error: 'El usuario debe tener 3-20 caracteres: letras, números, punto o guion bajo' }, 400);
      }
      if (isReservedPublicUsername(username)) {
        return json({ error: 'Ese nombre de usuario no está disponible' }, 400);
      }
      if (await usernameTaken(env, username, userId, profileId)) {
        return json({ error: 'Ese nombre de usuario ya está en uso' }, 409);
      }
      await d1(
        env,
        'UPDATE profiles SET name = ?, username = ?, bio = ?, location = ?, phone = ?, avatar_url = COALESCE(?, avatar_url) WHERE id = ?',
        [name, username, bio, location, phone, avatar, profileId]
      );
      const rows = await d1(env, 'SELECT * FROM profiles WHERE id = ?', [profileId]);
      return json({ ok: true, profile: profileRow(rows[0]) });
    }

    if (action === 'updatePost') {
      const postId = clean(body.postId, 80);
      const caption = clean(body.caption, POST_CAPTION_MAX);
      const rows = await d1(env, 'SELECT id FROM posts WHERE id = ? AND user_id = ?', [postId, userId]);
      if (!rows[0]) return json({ error: 'Esa publicación no es tuya' }, 403);
      await d1(env, 'UPDATE posts SET caption = ? WHERE id = ?', [caption, postId]);
      return json({ ok: true, caption });
    }

    if (action === 'deletePost') {
      const postId = clean(body.postId, 80);
      const rows = await d1(env, 'SELECT id, image FROM posts WHERE id = ? AND user_id = ?', [postId, userId]);
      if (!rows[0]) return json({ error: 'Esa publicación no es tuya' }, 403);
      const image = rows[0].image || '';

      await d1(env, 'DELETE FROM likes WHERE post_id = ?', [postId]);
      await d1(env, 'DELETE FROM saves WHERE post_id = ?', [postId]);
      await d1(env, 'DELETE FROM comments WHERE post_id = ?', [postId]);
      await d1(env, 'DELETE FROM posts WHERE id = ?', [postId]);

      let imageDeleted = false;
      const m = image.match(/imagedelivery\.net\/[^/]+\/([^/]+)\//);
      if (m && env.CF_ACCOUNT_ID && env.CF_IMAGES_TOKEN) {
        const stillUsed = await d1(env, 'SELECT COUNT(*) AS n FROM posts WHERE image = ?', [image]);
        if (stillUsed[0].n === 0) {
          try {
            const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1/${m[1]}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${env.CF_IMAGES_TOKEN}` },
            });
            imageDeleted = resp.ok;
          } catch {}
          await d1(env, 'DELETE FROM images WHERE url = ?', [image]).catch(() => {});
        }
      }
      return json({ ok: true, imageDeleted });
    }

    if (action === 'createPet') {
      const name = clean(body.name, 40);
      const species = normalizeSpecies(body.species) || 'perro';
      const breed = clean(body.breed, 60);
      const bio = clean(body.bio, 200);
      const emoji = clean(body.emoji, 8) || emojiForSpecies(species);
      const avatarUrl = clean(body.avatarUrl, 500) || null;
      const size = normalizeSize(body.size) || null;
      const neutered = normalizeNeutered(body.neutered);
      const birthDate = clean(body.birthDate, 10) || null;
      if (name.length < 1) return json({ error: 'Ponle nombre a tu mascota' }, 400);
      if (birthDate && !isValidBirthDate(birthDate, now)) {
        return json({ error: 'La fecha de nacimiento no es válida' }, 400);
      }
      let username = clean(body.username, 20).toLowerCase();
      if (!USERNAME_RE.test(username)) username = slugHandle(name);
      if (!USERNAME_RE.test(username)) return json({ error: 'El usuario de la mascota debe tener 3-20 caracteres: letras, números, punto o _' }, 400);
      const takenUser = await d1(env, 'SELECT id FROM pets WHERE LOWER(username) = ?', [username]);
      if (takenUser.length) return json({ error: 'Ese @ de mascota ya está en uso. Probá otro.' }, 409);
      const takenName = await d1(env, 'SELECT id FROM pets WHERE LOWER(name) = LOWER(?)', [name]);
      if (takenName.length) return json({ error: 'Ya existe una mascota con ese nombre. Elegí otro nombre o usuario.' }, 409);

      let profileId = clean(body.profileId, 80) || null;
      let isProtectorPet = false;
      if (profileId) {
        const owned = await d1(env, "SELECT id, type FROM profiles WHERE id = ? AND account_id = ?", [profileId, userId]);
        if (!owned[0] || owned[0].type !== 'protector') {
          return json({ error: 'Ese perfil proteccionista no es tuyo' }, 403);
        }
        isProtectorPet = true;
      }

      const allowed = isProtectorPet ? ['en_adopcion', 'en_recuperacion'] : ['en_casa', 'perdido'];
      let careStatus = clean(body.careStatus, 30);
      if (!allowed.includes(careStatus)) careStatus = isProtectorPet ? 'en_adopcion' : 'en_casa';
      const adoptionStartedAt = careStatus === 'en_adopcion' ? now : null;

      const id = `pet-${now}-${Math.random().toString(36).slice(2, 8)}`;
      await d1(
        env,
        `INSERT INTO pets (
          id, user_id, name, username, species, breed, age, bio, emoji, avatar_url, created_at,
          profile_id, care_status, adoption_started_at, birth_date, size, neutered
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, userId, name, username, species, breed, '', bio, emoji, avatarUrl, now, profileId, careStatus, adoptionStartedAt, birthDate, size, neutered]
      );
      const rows = await d1(env, 'SELECT * FROM pets WHERE id = ?', [id]);
      return json({ ok: true, pet: petRow(rows[0]) });
    }

    if (action === 'updatePet') {
      const p = await findOwnedPet(env, body.petId, userId);
      if (!p) return json({ error: 'Esa mascota no es tuya' }, 403);
      const name = clean(body.name, 40) || p.name;
      const species = normalizeSpecies(body.species) || p.species || 'perro';
      const breed = body.breed != null ? clean(body.breed, 60) : (p.breed || '');
      const bio = body.bio != null ? clean(body.bio, 200) : (p.bio || '');
      const emoji = clean(body.emoji, 8) || emojiForSpecies(species) || p.emoji;
      const avatarUrl = body.avatarUrl != null ? (clean(body.avatarUrl, 500) || p.avatar_url) : p.avatar_url;
      const size = body.size != null ? (normalizeSize(body.size) || null) : (p.size || null);
      const neutered = body.neutered !== undefined ? normalizeNeutered(body.neutered) : (p.neutered == null ? null : Number(p.neutered));
      let birthDate = p.birth_date || null;
      if (body.birthDate !== undefined) {
        const next = clean(body.birthDate, 10) || null;
        if (next && !isValidBirthDate(next, now)) return json({ error: 'La fecha de nacimiento no es válida' }, 400);
        birthDate = next;
      }
      let username = p.username;
      if (body.username != null) {
        username = clean(body.username, 20).toLowerCase();
        if (!USERNAME_RE.test(username)) return json({ error: 'El usuario de la mascota debe tener 3-20 caracteres: letras, números, punto o _' }, 400);
      }
      if (username && username !== p.username) {
        const takenUser = await d1(env, 'SELECT id FROM pets WHERE LOWER(username) = ? AND id != ?', [username, p.id]);
        if (takenUser.length) return json({ error: 'Ese @ de mascota ya está en uso. Probá otro.' }, 409);
      }
      if (name !== p.name) {
        const takenName = await d1(env, 'SELECT id FROM pets WHERE LOWER(name) = LOWER(?) AND id != ?', [name, p.id]);
        if (takenName.length) return json({ error: 'Ya existe una mascota con ese nombre. Elegí otro nombre o usuario.' }, 409);
      }

      const isProtectorPet = !!p.profile_id;
      const allowed = isProtectorPet ? ['en_adopcion', 'en_recuperacion'] : ['en_casa', 'perdido'];
      let careStatus = p.care_status || (isProtectorPet ? 'en_adopcion' : 'en_casa');
      if (body.careStatus != null) {
        const nextStatus = clean(body.careStatus, 30);
        if (!allowed.includes(nextStatus)) {
          return json({ error: 'Ese estado no corresponde a este tipo de perfil' }, 400);
        }
        careStatus = nextStatus;
      }
      let adoptionStartedAt = p.adoption_started_at || null;
      if (careStatus === 'en_adopcion' && p.care_status !== 'en_adopcion') {
        adoptionStartedAt = now;
      } else if (careStatus !== 'en_adopcion') {
        adoptionStartedAt = null;
      }

      await d1(
        env,
        `UPDATE pets SET name = ?, username = ?, species = ?, breed = ?, bio = ?, emoji = ?, avatar_url = ?,
          care_status = ?, adoption_started_at = ?, birth_date = ?, size = ?, neutered = ?, age = ?
         WHERE id = ?`,
        [name, username, species, breed, bio, emoji, avatarUrl, careStatus, adoptionStartedAt, birthDate, size, neutered, '', p.id]
      );
      const rows = await d1(env, 'SELECT * FROM pets WHERE id = ?', [p.id]);
      return json({ ok: true, pet: petRow(rows[0]) });
    }

    if (action === 'archivePet') {
      const p = await findOwnedPet(env, body.petId, userId);
      if (!p) return json({ error: 'Esa mascota no es tuya' }, 403);
      if (!p.profile_id) return json({ error: 'Solo se pueden archivar mascotas de un refugio' }, 400);
      await d1(env, 'UPDATE pets SET archived_at = ? WHERE id = ?', [now, p.id]);
      return json({ ok: true });
    }

    if (action === 'deletePet') {
      const p = await findOwnedPet(env, body.petId, userId);
      if (!p) return json({ error: 'Esa mascota no es tuya' }, 403);
      await d1(env, "DELETE FROM follows WHERE target_type = 'pet' AND target_id = ?", [p.id]);
      await d1(env, 'DELETE FROM pets WHERE id = ?', [p.id]);
      return json({ ok: true, petId: p.id });
    }

    if (action === 'notifications') {
      const [likes, comments, followsUser, followsPet, locations, birthdays] = await Promise.all([
        d1(env, `SELECT l.created_at, u.id AS actor_id, u.username, u.name AS actor_name, u.avatar_url, p.id AS post_id, p.image AS post_image
           FROM likes l JOIN posts p ON p.id = l.post_id JOIN users u ON u.id = l.user_id
           WHERE p.user_id = ? AND l.user_id != ? ORDER BY l.created_at DESC LIMIT 20`, [userId, userId]),
        d1(env, `SELECT c.created_at, c.text, u.id AS actor_id, u.username, u.name AS actor_name, u.avatar_url, p.id AS post_id, p.image AS post_image
           FROM comments c JOIN posts p ON p.id = c.post_id JOIN users u ON u.id = c.user_id
           WHERE p.user_id = ? AND c.user_id != ? ORDER BY c.created_at DESC LIMIT 20`, [userId, userId]),
        d1(env, `SELECT f.created_at, u.id AS actor_id, u.username, u.name AS actor_name, u.avatar_url
           FROM follows f JOIN users u ON u.id = f.user_id
           WHERE f.target_type = 'user' AND f.target_id = ? AND f.user_id != ? ORDER BY f.created_at DESC LIMIT 20`, [userId, userId]),
        d1(env, `SELECT f.created_at, pt.name AS pet_name, pt.id AS pet_id, u.id AS actor_id, u.username, u.name AS actor_name, u.avatar_url
           FROM follows f JOIN pets pt ON pt.id = f.target_id JOIN users u ON u.id = f.user_id
           WHERE f.target_type = 'pet' AND pt.user_id = ? AND f.user_id != ? ORDER BY f.created_at DESC LIMIT 20`, [userId, userId]),
        // Ubicaciones compartidas por visitantes (vía QR/chapita) en mis mascotas.
        // Notificación 100% gratuita: vive solo en D1, sin SMS.
        d1(env, `SELECT ls.id, ls.created_at, ls.lat, ls.lon, ls.accuracy, ls.sms_status, pt.id AS pet_id, pt.name AS pet_name, pt.emoji AS pet_emoji
           FROM location_shares ls JOIN pets pt ON pt.id = ls.pet_id
           WHERE ls.owner_id = ? ORDER BY ls.created_at DESC LIMIT 20`, [userId]),
        d1(env, `SELECT id, type, user_id, pet_id, title, body, metadata, created_at
           FROM activity_events
           WHERE user_id = ? AND type = 'birthday'
           ORDER BY created_at DESC LIMIT 20`, [userId]),
      ]);
      const items = [
        ...likes.map((r) => ({ id: `like-${r.actor_id}-${r.post_id}-${r.created_at}`, type: 'like', actorId: r.actor_id, actorName: r.actor_name, actorUsername: r.username, actorAvatar: r.avatar_url || null, postId: r.post_id, postImage: r.post_image || null, createdAt: r.created_at })),
        ...comments.map((r) => ({ id: `comment-${r.actor_id}-${r.post_id}-${r.created_at}`, type: 'comment', actorId: r.actor_id, actorName: r.actor_name, actorUsername: r.username, actorAvatar: r.avatar_url || null, postId: r.post_id, postImage: r.post_image || null, text: (r.text || '').slice(0, 80), createdAt: r.created_at })),
        ...followsUser.map((r) => ({ id: `fu-${r.actor_id}-${r.created_at}`, type: 'follow_user', actorId: r.actor_id, actorName: r.actor_name, actorUsername: r.username, actorAvatar: r.avatar_url || null, createdAt: r.created_at })),
        ...followsPet.map((r) => ({ id: `fp-${r.actor_id}-${r.pet_id}-${r.created_at}`, type: 'follow_pet', actorId: r.actor_id, actorName: r.actor_name, actorUsername: r.username, actorAvatar: r.avatar_url || null, petId: r.pet_id, petName: r.pet_name, createdAt: r.created_at })),
        ...locations.map((r) => ({
          id: `loc-${r.id}`,
          type: 'location',
          actorId: null,
          actorName: 'Alguien',
          actorUsername: 'anónimo',
          actorAvatar: null,
          petId: r.pet_id,
          petName: r.pet_name,
          petEmoji: r.pet_emoji,
          lat: r.lat,
          lon: r.lon,
          accuracy: r.accuracy,
          smsStatus: r.sms_status,
          createdAt: r.created_at,
        })),
        ...birthdays.map((r) => {
          let meta = {};
          try { meta = r.metadata ? JSON.parse(r.metadata) : {}; } catch (_) { meta = {}; }
          return {
            id: r.id,
            type: 'birthday',
            actorId: r.user_id,
            actorName: meta.petName || '',
            actorUsername: '',
            actorAvatar: meta.petAvatar || null,
            petId: r.pet_id || meta.petId || null,
            petUsername: meta.petUsername || null,
            petName: meta.petName || null,
            petEmoji: meta.petEmoji || null,
            title: r.title,
            text: r.body || '',
            years: meta.years || null,
            createdAt: r.created_at,
          };
        }),
      ].sort((a, b) => b.createdAt - a.createdAt).slice(0, 40);
      return json({ ok: true, notifications: items });
    }

    if (action === 'setPhone') {
      const raw = body.phone == null ? '' : String(body.phone).trim();
      if (!raw) {
        await d1(env, 'UPDATE users SET verified_phone = NULL WHERE id = ?', [userId]);
        return json({ ok: true, phone: null });
      }
      const phone = normalizePhone(raw);
      const ticket = String(body.ticket || '');
      const secret = otpSecret(env);
      if (!phone) return json({ error: 'Número de teléfono inválido' }, 400);
      if (!secret || !readPhoneTicket(secret, 'verify_phone', phone, ticket)) {
        return json({ error: 'Verificá el número con el código SMS' }, 400);
      }
      const taken = await findUsersByPhone(env, phone);
      if (taken[0] && taken[0].id !== userId) return json({ error: 'Ese teléfono ya está en uso' }, 409);
      await d1(env, 'UPDATE users SET verified_phone = ? WHERE id = ?', [phone, userId]);
      return json({ ok: true, phone });
    }

    if (action === 'registerImage') {
      const url = clean(body.url, 500);
      const cfId = clean(body.cfId, 80) || null;
      const kind = clean(body.kind, 20) || 'post';
      if (!url) return json({ error: 'Falta la URL' }, 400);
      const id = `img-${now}-${Math.random().toString(36).slice(2, 8)}`;
      await d1(env, 'INSERT INTO images (id, user_id, cf_id, url, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, userId, cfId, url, kind, now]);
      return json({ ok: true, id });
    }

    return json({ error: 'Acción desconocida' }, 400);
  } catch (e) {
    return json({ error: `D1: ${e.message}` }, 502);
  }
}

// ============================================================
// UPLOAD (Cloudflare Images — FormData/Blob nativos del Worker)
// ============================================================

async function handleUpload(request, env) {
  const body = await request.json().catch(() => ({}));
  const image = String(body.image || '');
  const m = image.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!m) return json({ error: 'Imagen inválida (se espera data URL base64)' }, 400);

  const mime = m[1];
  const base64 = m[2];
  if (base64.length > 4_000_000) return json({ error: 'Imagen demasiado grande (máx ~3MB)' }, 413);

  if (!env.CF_ACCOUNT_ID || !env.CF_IMAGES_TOKEN) {
    return json({ ok: true, provider: 'demo', url: image, message: 'Cloudflare Images no configurado' });
  }

  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const ext = mime.split('/')[1].replace('+', '');
    const blob = new Blob([bytes], { type: mime });
    const form = new FormData();
    form.append('file', blob, `animaldex-${Date.now()}.${ext}`);

    const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CF_IMAGES_TOKEN}` },
      body: form,
    });
    const result = await resp.json();
    if (!resp.ok || !result.success) {
      const msg = (result.errors && result.errors[0] && result.errors[0].message) || 'error al subir a Cloudflare Images';
      return json({ error: `Cloudflare: ${msg}` }, 502);
    }
    const variants = result.result.variants || [];
    const url = variants.find((v) => /\/public$/.test(v)) || variants[0];
    return json({ ok: true, provider: 'cloudflare', url, id: result.result.id });
  } catch (e) {
    return json({ error: `No se pudo subir la imagen: ${e.message}` }, 502);
  }
}

// ============================================================
// SMS OTP — Programmable SMS (NO Twilio Verify).
// Secrets requeridos (NO configurados en esta implementación):
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, OTP_SECRET
// Sin ellos el envío responde 503 y NUNCA se revela el código.
// ============================================================

async function latestOtpChallenge(env, phone, purpose) {
  const rows = await d1(
    env,
    'SELECT * FROM otp_challenges WHERE phone = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1',
    [phone, purpose]
  );
  return rows[0] || null;
}

async function handleSms(request, env) {
  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 20);
  const purpose = body.purpose === 'verify_phone' ? 'verify_phone' : 'signup';
  const now = Date.now();
  const secret = otpSecret(env);
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || '';

  try {
    await ensureAuthSchema(env);

    if (action === 'status') {
      return json({ ok: true, available: smsConfigured(env) });
    }

    if (action === 'send') {
      const phone = normalizePhone(body.phone);
      if (!phone) return json({ error: 'Número de teléfono inválido' }, 400);
      if (!smsConfigured(env)) return json({ error: 'SMS no disponible' }, 503);
      if (otpIpLimited(ip, now)) {
        return json({ error: 'Demasiados envíos. Probá de nuevo más tarde.' }, 429);
      }
      if (purpose === 'signup') {
        const existing = await findUsersByPhone(env, phone);
        if (existing[0]) return json({ error: 'Ese teléfono ya está en uso' }, 409);
      }

      const latest = await latestOtpChallenge(env, phone, purpose);
      const state = otpRowState(latest);
      const allowed = canSendOtp(state, now);
      if (!allowed.ok) return json({ error: allowed.error }, 429);

      const next = nextSendState(state, now);
      const code = String(100000 + Math.floor(Math.random() * 900000));
      const codeHash = hashOtpCode(secret, phone, purpose, code);
      const id = next.fresh || !latest
        ? `otp-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        : latest.id;

      if (next.fresh || !latest) {
        await d1(
          env,
          `INSERT INTO otp_challenges
            (id, phone, purpose, code_hash, send_count, attempt_count, last_sent_at, expires_at, verified_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
          [id, phone, purpose, codeHash, next.sendCount, 0, next.lastSentAt, next.expiresAt, next.createdAt]
        );
      } else {
        await d1(
          env,
          `UPDATE otp_challenges
           SET code_hash = ?, send_count = ?, attempt_count = 0, last_sent_at = ?, expires_at = ?
           WHERE id = ?`,
          [codeHash, next.sendCount, next.lastSentAt, next.expiresAt, id]
        );
      }

      const sent = await sendTwilioSms(env, phone, `Tu código de verificación de Animaldex es: ${code} 🐾`);
      if (!sent.ok) return json({ error: 'No se pudo enviar el SMS' }, 502);
      return json({
        ok: true,
        retryAfter: Math.ceil(OTP_RESEND_GAP_MS / 1000),
        expiresIn: Math.ceil(OTP_TTL_MS / 1000),
      });
    }

    if (action === 'verify') {
      const phone = normalizePhone(body.phone);
      const code = String(body.code || '').trim();
      if (!phone) return json({ error: 'Número de teléfono inválido' }, 400);
      if (!secret) return json({ error: 'SMS no disponible' }, 503);
      if (!/^\d{6}$/.test(code)) return json({ error: 'Código incorrecto' }, 400);

      const latest = await latestOtpChallenge(env, phone, purpose);
      const state = otpRowState(latest);
      const allowed = canAttemptOtp(state, now);
      if (!allowed.ok) return json({ error: allowed.error }, 400);

      const expected = hashOtpCode(secret, phone, purpose, code);
      if (!hashesEqual(expected, latest.code_hash)) {
        await d1(env, 'UPDATE otp_challenges SET attempt_count = attempt_count + 1 WHERE id = ?', [latest.id]);
        const after = await d1(env, 'SELECT attempt_count FROM otp_challenges WHERE id = ?', [latest.id]);
        if ((after[0]?.attempt_count || 0) >= OTP_MAX_ATTEMPTS) {
          return json({ error: 'Demasiados intentos. Solicitá un código nuevo.' }, 429);
        }
        return json({ error: 'Código incorrecto' }, 400);
      }

      await d1(env, 'UPDATE otp_challenges SET verified_at = ? WHERE id = ?', [now, latest.id]);
      const exp = now + OTP_TICKET_TTL_MS;
      const ticket = signPhoneTicket(secret, purpose, phone, exp);
      return json({ ok: true, verified: true, phone, ticket, exp });
    }

    return json({ error: 'Acción desconocida' }, 400);
  } catch (e) {
    return json({ error: `SMS: ${e.message}` }, 502);
  }
}

// ============================================================
// Entry point
// ============================================================

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    try {
      if (url.pathname === '/auth') return await handleAuth(request, env);
      if (url.pathname === '/db') return await handleDb(request, env);
      if (url.pathname === '/upload') return await handleUpload(request, env);
      if (url.pathname === '/sms') return await handleSms(request, env);
      if (url.pathname === '/' || url.pathname === '/health') {
        return json({ ok: true, service: 'animaldex-api', time: Date.now() });
      }
      return json({ error: 'Ruta no encontrada' }, 404);
    } catch (e) {
      return json({ error: `Worker: ${e.message}` }, 500);
    }
  },

  async scheduled(event, env) {
    const nowMs = event && event.scheduledTime ? Number(event.scheduledTime) : Date.now();
    try {
      await runPersonalPetBirthdays(env, nowMs);
    } catch (e) {
      console.log('pet-birthday-cron', e && e.message);
    }
    try {
      await processPushReceipts(env, nowMs);
    } catch (e) {
      console.log('push-receipts', e && e.message);
    }
  },
};
