// ============================================================
// Animaldex Adopciones — analítica propia en D1.
// Eventos públicos (adoptionsTrack) y panel privado (adoptionsAnalytics).
// No guarda IP. La IP solo vive en un mapa en memoria para rate limit.
// ============================================================

import { ADOPTION_LOCALITIES, ADOPTIONS_SEGMENT } from '../lib/adoptionLocalities.ts';

const SALTA_TZ = 'America/Argentina/Salta';
const EVENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const SESSION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const PRUNE_BATCH = 4000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 40;
const TRACK_TYPES = new Set([
  'page_view',
  'adoption_detail_view',
  'share_intent',
  'share_link_copied',
  'adopt_contact_click',
  'publish_started',
  'publish_completed',
]);
const NETWORKS = new Set(['whatsapp', 'facebook', 'instagram', 'native', 'copy', 'other']);
const DEVICES = new Set(['mobile', 'desktop', 'tablet', 'unknown']);
const BROWSERS = new Set(['chrome', 'safari', 'firefox', 'edge', 'samsung', 'opera', 'other', 'unknown']);
const OS_NAMES = new Set(['ios', 'android', 'windows', 'macos', 'linux', 'other', 'unknown']);
const SOURCES = new Set(['facebook', 'instagram', 'whatsapp', 'google', 'other', 'direct']);
const HASH_RE = /^[a-f0-9]{16,64}$/i;
const EVENT_ID_RE = /^[a-z0-9-]{8,80}$/i;
const BOT_UA =
  /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|Googlebot|AdsBot-Google|bingbot|Baiduspider|YandexBot|Applebot|Pinterestbot|Embedly|ia_archiver|SemrushBot|AhrefsBot/i;

const rateByIp = new Map();

function clean(s, max = 80) {
  return String(s == null ? '' : s).slice(0, max).trim();
}

function dayInSalta(ms = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SALTA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

function addDays(day, n) {
  const [y, m, d] = String(day).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function startOfWeekMonday(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const offset = wd === 0 ? -6 : 1 - wd;
  return addDays(day, offset);
}

function startOfMonth(day) {
  return `${String(day).slice(0, 7)}-01`;
}

function validDay(value) {
  const s = clean(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return s;
}

function requestIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || '';
}

function trackLimited(ip, now) {
  const key = ip || 'unknown';
  const rec = rateByIp.get(key);
  if (!rec || now - rec.start >= RATE_WINDOW_MS) {
    rateByIp.set(key, { start: now, n: 1 });
    if (rateByIp.size > 4000) {
      for (const [k, v] of rateByIp) {
        if (now - v.start >= RATE_WINDOW_MS) rateByIp.delete(k);
      }
    }
    return false;
  }
  if (rec.n >= RATE_MAX) return true;
  rec.n += 1;
  return false;
}

function knownBot(request) {
  const ua = request.headers.get('user-agent') || '';
  if (!ua) return false;
  return BOT_UA.test(ua);
}

export function adoptionsAdminUsernames(env) {
  const extra = String(env.ADOPTIONS_ADMIN_USERNAMES || '')
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set(['lucasfuentes', ...extra]);
}

export async function isAdoptionsAdminUser(env, userId) {
  if (!userId) return false;
  const rows = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(userId).all();
  const username = String(rows.results?.[0]?.username || '').toLowerCase();
  return adoptionsAdminUsernames(env).has(username);
}

async function analyticsReady(env) {
  try {
    await env.DB.prepare('SELECT id FROM adoptions_analytics_totals WHERE id = 1').all();
    return true;
  } catch {
    return false;
  }
}

function classifyPath(rawPath) {
  let path = String(rawPath || '').split('?')[0].split('#')[0];
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/+$/, '') || '/';
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'admin' || (parts[0] === ADOPTIONS_SEGMENT && parts[1] === 'admin')) {
    return { skip: true, pageKind: 'admin', path, locality: null, alertId: null, pageKey: 'admin' };
  }
  let segs = parts;
  if (parts[0] === ADOPTIONS_SEGMENT) segs = parts.slice(1);
  if (segs.length === 0) {
    return {
      skip: false,
      pageKind: 'catalog',
      path,
      locality: 'saltacapital',
      alertId: null,
      pageKey: 'catalog:saltacapital',
    };
  }
  const slug = String(segs[0] || '').toLowerCase();
  const place = ADOPTION_LOCALITIES.find((l) => l.slug === slug) || null;
  if (!place) {
    return {
      skip: false,
      pageKind: 'other',
      path,
      locality: null,
      alertId: null,
      pageKey: `other:${path.slice(0, 80)}`,
    };
  }
  if (segs.length === 1) {
    return {
      skip: false,
      pageKind: 'catalog',
      path,
      locality: place.slug,
      alertId: null,
      pageKey: `catalog:${place.slug}`,
    };
  }
  const extra = decodeURIComponent(segs[1] || '').trim();
  if (extra === 'publicar') {
    return {
      skip: false,
      pageKind: 'publish',
      path,
      locality: place.slug,
      alertId: null,
      pageKey: `publish:${place.slug}`,
    };
  }
  if (extra === 'mis-publicaciones') {
    return {
      skip: false,
      pageKind: 'mine',
      path,
      locality: place.slug,
      alertId: null,
      pageKey: `mine:${place.slug}`,
    };
  }
  if (segs.length === 2 && extra && extra.length <= 80) {
    return {
      skip: false,
      pageKind: 'post',
      path,
      locality: place.slug,
      alertId: extra.slice(0, 80),
      pageKey: `post:${extra.slice(0, 80)}`,
    };
  }
  return {
    skip: false,
    pageKind: 'other',
    path,
    locality: place.slug,
    alertId: null,
    pageKey: `other:${path.slice(0, 80)}`,
  };
}

function classifySource(utmSource, referrer) {
  const u = String(utmSource || '').toLowerCase();
  if (/(facebook|fb)/.test(u)) return 'facebook';
  if (/(instagram|^ig$)/.test(u)) return 'instagram';
  if (/(whatsapp|^wa$)/.test(u)) return 'whatsapp';
  if (/google/.test(u)) return 'google';
  if (u) return 'other';
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '').toLowerCase();
    if (!host) return 'direct';
    if (host.includes('facebook') || host === 'fb.com' || host.endsWith('.fb.com') || host.includes('fbcdn')) {
      return 'facebook';
    }
    if (host.includes('instagram')) return 'instagram';
    if (host.includes('whatsapp') || host === 'wa.me') return 'whatsapp';
    if (host.includes('google.') || host.endsWith('.google.com') || host === 'google.com' || host === 'google.com.ar') {
      return 'google';
    }
    return 'other';
  } catch {
    return 'direct';
  }
}

function pickAllowed(value, allowed, fallback) {
  const v = clean(value, 20).toLowerCase();
  return allowed.has(v) ? v : fallback;
}

function emptyOk() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

async function run(env, sql, params = []) {
  return env.DB.prepare(sql).bind(...params).run();
}

async function all(env, sql, params = []) {
  const res = await env.DB.prepare(sql).bind(...params).all();
  return res.results || [];
}

export async function handlePublicAdoptionsAnalytics(env, request, body, action, json) {
  if (action !== 'adoptionsTrack') return null;
  const now = Date.now();
  if (knownBot(request)) return emptyOk();
  if (trackLimited(requestIp(request), now)) {
    return json({ error: 'Demasiadas solicitudes' }, 429);
  }
  if (!(await analyticsReady(env))) return emptyOk();

  const type = clean(body.type, 40);
  if (!TRACK_TYPES.has(type)) return json({ error: 'Evento no permitido' }, 400);

  const eventId = clean(body.eventId, 80).toLowerCase();
  if (!EVENT_ID_RE.test(eventId)) return json({ error: 'Evento inválido' }, 400);

  const visitorHash = clean(body.visitorHash, 64).toLowerCase();
  const sessionHash = clean(body.sessionHash, 64).toLowerCase();
  if (!HASH_RE.test(visitorHash) || !HASH_RE.test(sessionHash)) return json({ error: 'Identificador inválido' }, 400);

  const classified = classifyPath(body.path);
  if (classified.skip) return emptyOk();

  const alertId = classified.alertId || clean(body.alertId, 80) || null;
  const network = type.startsWith('share') ? pickAllowed(body.network, NETWORKS, 'other') : null;
  const utmSource = clean(body.utmSource, 80) || null;
  const utmMedium = clean(body.utmMedium, 80) || null;
  const utmCampaign = clean(body.utmCampaign, 80) || null;
  const utmContent = clean(body.utmContent, 80) || null;
  const utmTerm = clean(body.utmTerm, 80) || null;
  const source = pickAllowed(
    classifySource(utmSource, clean(body.referrer, 300)),
    SOURCES,
    'direct'
  );
  const device = pickAllowed(body.device, DEVICES, 'unknown');
  const browser = pickAllowed(body.browser, BROWSERS, 'unknown');
  const os = pickAllowed(body.os, OS_NAMES, 'unknown');
  const day = dayInSalta(now);
  const isView = type === 'page_view';
  const pageKind = type === 'adoption_detail_view' ? 'post' : classified.pageKind;
  const pageKey = type === 'adoption_detail_view' && alertId ? `post:${alertId}` : classified.pageKey;
  const locality = classified.locality;
  const postId = pageKind === 'post' ? alertId : null;

  try {
    const existed = await all(env, 'SELECT 1 AS n FROM adoptions_analytics_events WHERE event_id = ? LIMIT 1', [eventId]);
    if (existed[0]) return emptyOk();

    const visitorIns = await run(
      env,
      'INSERT OR IGNORE INTO adoptions_analytics_visitor_seen (visitor_hash, first_day, first_seen_at) VALUES (?, ?, ?)',
      [visitorHash, day, now]
    );
    const newVisitor = visitorIns.meta?.changes === 1 ? 1 : 0;

    const sessionRow = await all(
      env,
      'SELECT session_hash FROM adoptions_analytics_session_seen WHERE session_hash = ? LIMIT 1',
      [sessionHash]
    );
    const newSession = sessionRow[0] ? 0 : 1;
    if (sessionRow[0]) {
      await run(env, 'UPDATE adoptions_analytics_session_seen SET last_seen_at = ? WHERE session_hash = ?', [
        now,
        sessionHash,
      ]);
    } else {
      await run(
        env,
        'INSERT INTO adoptions_analytics_session_seen (session_hash, first_day, last_seen_at) VALUES (?, ?, ?)',
        [sessionHash, day, now]
      );
    }

    let dayNewVisitor = 0;
    let dayNewSession = 0;
    if (isView) {
      const dv = await run(
        env,
        'INSERT OR IGNORE INTO adoptions_analytics_daily_visitors (day, visitor_hash) VALUES (?, ?)',
        [day, visitorHash]
      );
      dayNewVisitor = dv.meta?.changes === 1 ? 1 : 0;
      const ds = await run(
        env,
        'INSERT OR IGNORE INTO adoptions_analytics_daily_sessions (day, session_hash) VALUES (?, ?)',
        [day, sessionHash]
      );
      dayNewSession = ds.meta?.changes === 1 ? 1 : 0;
    }

    await run(
      env,
      `INSERT INTO adoptions_analytics_events (
        event_id, occurred_at, day, type, page_kind, path, locality_slug, alert_id, network, source,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term, device, browser, os,
        visitor_hash, session_hash, new_visitor, new_session
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId,
        now,
        day,
        type,
        pageKind,
        classified.path.slice(0, 200),
        locality,
        postId,
        network,
        source,
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent,
        utmTerm,
        device,
        browser,
        os,
        visitorHash,
        sessionHash,
        newVisitor,
        newSession,
      ]
    );

    const shareIntent = type === 'share_intent' ? 1 : 0;
    const shareCopied = type === 'share_link_copied' ? 1 : 0;
    const adoptClick = type === 'adopt_contact_click' ? 1 : 0;
    const pubStart = type === 'publish_started' ? 1 : 0;
    const pubDone = type === 'publish_completed' ? 1 : 0;
    const detail = isView && pageKind === 'post' ? 1 : 0;
    const pageView = isView ? 1 : 0;

    await run(
      env,
      `INSERT INTO adoptions_analytics_daily (
        day, page_views, unique_visitors, sessions, share_intents, share_copied, adopt_clicks,
        publish_started, publish_completed, detail_views
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(day) DO UPDATE SET
        page_views = page_views + excluded.page_views,
        unique_visitors = unique_visitors + excluded.unique_visitors,
        sessions = sessions + excluded.sessions,
        share_intents = share_intents + excluded.share_intents,
        share_copied = share_copied + excluded.share_copied,
        adopt_clicks = adopt_clicks + excluded.adopt_clicks,
        publish_started = publish_started + excluded.publish_started,
        publish_completed = publish_completed + excluded.publish_completed,
        detail_views = detail_views + excluded.detail_views`,
      [
        day,
        pageView,
        isView ? dayNewVisitor : 0,
        isView ? dayNewSession : 0,
        shareIntent,
        shareCopied,
        adoptClick,
        pubStart,
        pubDone,
        detail,
      ]
    );

    if (pageView) {
      await run(
        env,
        `INSERT INTO adoptions_analytics_daily_pages (day, page_key, page_kind, locality_slug, alert_id, views)
         VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(day, page_key) DO UPDATE SET views = views + 1`,
        [day, pageKey, pageKind, locality, postId]
      );
      if (locality && pageKind !== 'catalog') {
        await run(
          env,
          `INSERT INTO adoptions_analytics_daily_pages (day, page_key, page_kind, locality_slug, alert_id, views)
           VALUES (?, ?, 'locality', ?, NULL, 1)
           ON CONFLICT(day, page_key) DO UPDATE SET views = views + 1`,
          [day, `locality:${locality}`, locality]
        );
      }
      await run(
        env,
        `INSERT INTO adoptions_analytics_daily_sources (
           day, source, utm_source, utm_medium, utm_campaign, sessions, page_views
         ) VALUES (?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(day, source, utm_source, utm_medium, utm_campaign) DO UPDATE SET
           page_views = page_views + 1,
           sessions = sessions + excluded.sessions`,
        [day, source, utmSource || '', utmMedium || '', utmCampaign || '', newSession]
      );
      await run(
        env,
        `INSERT INTO adoptions_analytics_daily_devices (day, device, browser, os, page_views)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(day, device, browser, os) DO UPDATE SET page_views = page_views + 1`,
        [day, device, browser, os]
      );
    }

    if (postId && (pageView || shareIntent || shareCopied || adoptClick)) {
      await run(
        env,
        `INSERT INTO adoptions_analytics_daily_posts (day, alert_id, views, share_intents, share_copied, adopt_clicks)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(day, alert_id) DO UPDATE SET
           views = views + excluded.views,
           share_intents = share_intents + excluded.share_intents,
           share_copied = share_copied + excluded.share_copied,
           adopt_clicks = adopt_clicks + excluded.adopt_clicks`,
        [day, postId, pageKind === 'post' && pageView ? 1 : 0, shareIntent, shareCopied, adoptClick]
      );
    }

    if (network && (shareIntent || shareCopied)) {
      await run(
        env,
        `INSERT INTO adoptions_analytics_daily_networks (day, network, share_intents, share_copied)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(day, network) DO UPDATE SET
           share_intents = share_intents + excluded.share_intents,
           share_copied = share_copied + excluded.share_copied`,
        [day, network, shareIntent, shareCopied]
      );
    }

    await run(
      env,
      `INSERT INTO adoptions_analytics_totals (id, page_views, unique_visitors, sessions, share_intents, started_at)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         page_views = page_views + excluded.page_views,
         unique_visitors = unique_visitors + excluded.unique_visitors,
         sessions = sessions + excluded.sessions,
         share_intents = share_intents + excluded.share_intents`,
      [pageView, newVisitor, newSession, shareIntent, now]
    );
  } catch (e) {
    console.log('adoptions-track', e && e.message);
  }
  return emptyOk();
}

function resolveRange(body, today) {
  const range = clean(body.range, 20) || '7d';
  if (range === 'today') return { from: today, to: today, range };
  if (range === 'yesterday') {
    const y = addDays(today, -1);
    return { from: y, to: y, range };
  }
  if (range === '7d') return { from: addDays(today, -6), to: today, range };
  if (range === '30d') return { from: addDays(today, -29), to: today, range };
  if (range === 'month') return { from: startOfMonth(today), to: today, range };
  if (range === 'custom') {
    const from = validDay(body.from);
    const to = validDay(body.to);
    if (!from || !to || from > to) return { error: 'Rango inválido' };
    const max = addDays(from, 366);
    if (to > max) return { error: 'El rango no puede superar un año' };
    return { from, to, range };
  }
  return { from: addDays(today, -6), to: today, range: '7d' };
}

function previousRange(from, to) {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  const len = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(len - 1));
  return { from: prevFrom, to: prevTo };
}

function sumRows(rows, key) {
  return rows.reduce((n, r) => n + Number(r[key] || 0), 0);
}

function fillDays(from, to, byDay, keys) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const row = byDay.get(d) || {};
    const item = { day: d };
    for (const k of keys) item[k] = Number(row[k] || 0);
    out.push(item);
    if (out.length > 400) break;
  }
  return out;
}

export async function handleAdminAdoptionsAnalytics(env, body, action, userId, json) {
  if (action !== 'adoptionsAnalytics') return null;
  if (!(await isAdoptionsAdminUser(env, userId))) {
    return json({ error: 'No autorizado' }, 403);
  }
  if (!(await analyticsReady(env))) {
    return json({ error: 'Falta aplicar migrations/022_adoptions_analytics.sql', ready: false }, 503);
  }

  const today = dayInSalta();
  const weekFrom = startOfWeekMonday(today);
  const monthFrom = startOfMonth(today);
  const selected = resolveRange(body, today);
  if (selected.error) return json({ error: selected.error }, 400);
  const prev = previousRange(selected.from, selected.to);

  try {
    const [
      overviewToday,
      overviewYesterday,
      overview7,
      overview30,
      overviewWeek,
      overviewMonth,
      totals,
      rangeRows,
      prevRows,
      pages,
      posts,
      sources,
      devices,
      networks,
      campaigns,
    ] = await Promise.all([
      all(env, 'SELECT * FROM adoptions_analytics_daily WHERE day = ?', [today]),
      all(env, 'SELECT * FROM adoptions_analytics_daily WHERE day = ?', [addDays(today, -1)]),
      all(
        env,
        `SELECT COALESCE(SUM(page_views),0) AS page_views, COALESCE(SUM(unique_visitors),0) AS unique_visitors,
                COALESCE(SUM(sessions),0) AS sessions, COALESCE(SUM(share_intents),0) AS share_intents,
                COALESCE(SUM(share_copied),0) AS share_copied, COALESCE(SUM(adopt_clicks),0) AS adopt_clicks,
                COALESCE(SUM(detail_views),0) AS detail_views
         FROM adoptions_analytics_daily WHERE day BETWEEN ? AND ?`,
        [addDays(today, -6), today]
      ),
      all(
        env,
        `SELECT COALESCE(SUM(page_views),0) AS page_views, COALESCE(SUM(unique_visitors),0) AS unique_visitors,
                COALESCE(SUM(sessions),0) AS sessions, COALESCE(SUM(share_intents),0) AS share_intents
         FROM adoptions_analytics_daily WHERE day BETWEEN ? AND ?`,
        [addDays(today, -29), today]
      ),
      all(
        env,
        `SELECT COALESCE(SUM(page_views),0) AS page_views, COALESCE(SUM(unique_visitors),0) AS unique_visitors,
                COALESCE(SUM(sessions),0) AS sessions, COALESCE(SUM(share_intents),0) AS share_intents
         FROM adoptions_analytics_daily WHERE day BETWEEN ? AND ?`,
        [weekFrom, today]
      ),
      all(
        env,
        `SELECT COALESCE(SUM(page_views),0) AS page_views, COALESCE(SUM(unique_visitors),0) AS unique_visitors,
                COALESCE(SUM(sessions),0) AS sessions, COALESCE(SUM(share_intents),0) AS share_intents
         FROM adoptions_analytics_daily WHERE day BETWEEN ? AND ?`,
        [monthFrom, today]
      ),
      all(env, 'SELECT * FROM adoptions_analytics_totals WHERE id = 1', []),
      all(env, 'SELECT * FROM adoptions_analytics_daily WHERE day BETWEEN ? AND ? ORDER BY day', [
        selected.from,
        selected.to,
      ]),
      all(env, 'SELECT * FROM adoptions_analytics_daily WHERE day BETWEEN ? AND ?', [prev.from, prev.to]),
      all(
        env,
        `SELECT page_key, page_kind, locality_slug, alert_id, SUM(views) AS views
         FROM adoptions_analytics_daily_pages WHERE day BETWEEN ? AND ?
         GROUP BY page_key, page_kind, locality_slug, alert_id
         ORDER BY views DESC LIMIT 40`,
        [selected.from, selected.to]
      ),
      all(
        env,
        `SELECT p.alert_id, SUM(p.views) AS views, SUM(p.share_intents) AS share_intents,
                SUM(p.share_copied) AS share_copied, SUM(p.adopt_clicks) AS adopt_clicks,
                a.pet_name, a.image, a.media_kind, a.locality
         FROM adoptions_analytics_daily_posts p
         LEFT JOIN alerts a ON a.id = p.alert_id
         WHERE p.day BETWEEN ? AND ?
         GROUP BY p.alert_id
         ORDER BY views DESC LIMIT 30`,
        [selected.from, selected.to]
      ),
      all(
        env,
        `SELECT source, SUM(page_views) AS page_views, SUM(sessions) AS sessions
         FROM adoptions_analytics_daily_sources WHERE day BETWEEN ? AND ?
         GROUP BY source ORDER BY page_views DESC`,
        [selected.from, selected.to]
      ),
      all(
        env,
        `SELECT device, browser, os, SUM(page_views) AS page_views
         FROM adoptions_analytics_daily_devices WHERE day BETWEEN ? AND ?
         GROUP BY device, browser, os ORDER BY page_views DESC LIMIT 40`,
        [selected.from, selected.to]
      ),
      all(
        env,
        `SELECT network, SUM(share_intents) AS share_intents, SUM(share_copied) AS share_copied
         FROM adoptions_analytics_daily_networks WHERE day BETWEEN ? AND ?
         GROUP BY network ORDER BY share_intents DESC`,
        [selected.from, selected.to]
      ),
      all(
        env,
        `SELECT utm_campaign AS campaign, utm_source AS source, utm_medium AS medium,
                SUM(page_views) AS page_views, SUM(sessions) AS sessions
         FROM adoptions_analytics_daily_sources
         WHERE day BETWEEN ? AND ? AND utm_campaign != ''
         GROUP BY utm_campaign, utm_source, utm_medium
         ORDER BY page_views DESC LIMIT 20`,
        [selected.from, selected.to]
      ),
    ]);

    const pack = (row) => ({
      pageViews: Number(row?.page_views || 0),
      uniqueVisitorsEstimated: Number(row?.unique_visitors || 0),
      sessionsEstimated: Number(row?.sessions || 0),
      shareIntents: Number(row?.share_intents || 0),
      shareCopied: Number(row?.share_copied || 0),
      adoptClicks: Number(row?.adopt_clicks || 0),
      detailViews: Number(row?.detail_views || 0),
    });

    const byDay = new Map(rangeRows.map((r) => [r.day, r]));
    const daily = fillDays(selected.from, selected.to, byDay, [
      'page_views',
      'unique_visitors',
      'sessions',
      'share_intents',
    ]);

    const startedAt = Number(totals[0]?.started_at || 0);

    return json({
      ok: true,
      timezone: SALTA_TZ,
      today,
      range: { key: selected.range, from: selected.from, to: selected.to },
      previousRange: prev,
      startedAt,
      note: 'uniqueVisitorsEstimated y sessionsEstimated son estimaciones (hashes anónimos), no un recuento exacto de personas.',
      overview: {
        today: pack(overviewToday[0]),
        yesterday: pack(overviewYesterday[0]),
        last7: pack(overview7[0]),
        last30: pack(overview30[0]),
        week: pack(overviewWeek[0]),
        month: pack(overviewMonth[0]),
        allTime: pack(totals[0]),
        selected: {
          pageViews: sumRows(rangeRows, 'page_views'),
          uniqueVisitorsEstimated: sumRows(rangeRows, 'unique_visitors'),
          sessionsEstimated: sumRows(rangeRows, 'sessions'),
          shareIntents: sumRows(rangeRows, 'share_intents'),
          shareCopied: sumRows(rangeRows, 'share_copied'),
          adoptClicks: sumRows(rangeRows, 'adopt_clicks'),
          detailViews: sumRows(rangeRows, 'detail_views'),
        },
        previous: {
          pageViews: sumRows(prevRows, 'page_views'),
          uniqueVisitorsEstimated: sumRows(prevRows, 'unique_visitors'),
          sessionsEstimated: sumRows(prevRows, 'sessions'),
          shareIntents: sumRows(prevRows, 'share_intents'),
          shareCopied: sumRows(prevRows, 'share_copied'),
          adoptClicks: sumRows(prevRows, 'adopt_clicks'),
          detailViews: sumRows(prevRows, 'detail_views'),
        },
      },
      daily: daily.map((d) => ({
        day: d.day,
        pageViews: d.page_views,
        uniqueVisitorsEstimated: d.unique_visitors,
        sessionsEstimated: d.sessions,
        shareIntents: d.share_intents,
      })),
      pages: pages.map((p) => ({
        key: p.page_key,
        kind: p.page_kind,
        locality: p.locality_slug || null,
        alertId: p.alert_id || null,
        views: Number(p.views || 0),
      })),
      posts: posts.map((p) => ({
        alertId: p.alert_id,
        petName: p.pet_name || null,
        image: p.image || null,
        mediaKind: p.media_kind || null,
        locality: p.locality || null,
        views: Number(p.views || 0),
        shareIntents: Number(p.share_intents || 0),
        shareCopied: Number(p.share_copied || 0),
        adoptClicks: Number(p.adopt_clicks || 0),
      })),
      sources: sources.map((s) => ({
        source: s.source,
        pageViews: Number(s.page_views || 0),
        sessionsEstimated: Number(s.sessions || 0),
      })),
      devices: devices.map((d) => ({
        device: d.device,
        browser: d.browser,
        os: d.os,
        pageViews: Number(d.page_views || 0),
      })),
      networks: networks.map((n) => ({
        network: n.network,
        shareIntents: Number(n.share_intents || 0),
        shareCopied: Number(n.share_copied || 0),
      })),
      campaigns: campaigns.map((c) => ({
        campaign: c.campaign,
        source: c.source,
        medium: c.medium,
        pageViews: Number(c.page_views || 0),
        sessionsEstimated: Number(c.sessions || 0),
      })),
    });
  } catch (e) {
    return json({ error: `Estadísticas: ${e.message}` }, 502);
  }
}

export async function pruneAdoptionsAnalytics(env, nowMs = Date.now()) {
  if (!(await analyticsReady(env))) return;
  const today = dayInSalta(nowMs);
  const cutoff = nowMs - EVENT_RETENTION_MS;
  const sessionCutoff = nowMs - SESSION_RETENTION_MS;
  const visitorAuxDay = addDays(today, -3);
  try {
    const old = await all(
      env,
      'SELECT id FROM adoptions_analytics_events WHERE occurred_at < ? ORDER BY id ASC LIMIT ?',
      [cutoff, PRUNE_BATCH]
    );
    if (old.length) {
      await run(env, 'DELETE FROM adoptions_analytics_events WHERE id <= ? AND occurred_at < ?', [
        old[old.length - 1].id,
        cutoff,
      ]);
    }
    await run(env, 'DELETE FROM adoptions_analytics_daily_visitors WHERE day < ?', [visitorAuxDay]);
    await run(env, 'DELETE FROM adoptions_analytics_daily_sessions WHERE day < ?', [visitorAuxDay]);
    await run(env, 'DELETE FROM adoptions_analytics_session_seen WHERE last_seen_at < ?', [sessionCutoff]);
  } catch (e) {
    console.log('adoptions-analytics-prune', e && e.message);
  }
}
