// ============================================================
// Animaldex Adopciones — cliente de analítica (web, fire-and-forget).
// No bloquea catálogo, imágenes, scroll, auth ni publicación.
// No se envía en /admin. No envía Authorization ni PII.
// ============================================================

import { Platform } from 'react-native';
import { API_ORIGIN } from './db';
import { isAdoptionsHost } from './adoptionsHost';
import { ADOPTIONS_SEGMENT } from './adoptionLocalities';

export const ADOPTIONS_ANALYTICS_TZ = 'America/Argentina/Salta';

const VISITOR_KEY = 'adx_vid';
const SESSION_KEY = 'adx_sid';
const SESSION_AT_KEY = 'adx_sid_at';
const ATTR_KEY = 'adx_attr';
const SESSION_MS = 30 * 60 * 1000;
const VISITOR_MS = 396 * 24 * 60 * 60 * 1000;
const DEDUPE_MS = 1800;

const TRACK_TYPES = new Set([
  'page_view',
  'adoption_detail_view',
  'share_intent',
  'share_link_copied',
  'adopt_contact_click',
  'publish_started',
  'publish_completed',
]);

type TrackType =
  | 'page_view'
  | 'adoption_detail_view'
  | 'share_intent'
  | 'share_link_copied'
  | 'adopt_contact_click'
  | 'publish_started'
  | 'publish_completed';

type ShareNetwork = 'whatsapp' | 'facebook' | 'instagram' | 'native' | 'copy' | 'other';

type Attribution = {
  referrer: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
};

const lastSent = new Map<string, number>();

function webWindow(): Window | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return window;
}

function randomHash(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function eventId(): string {
  return `${Date.now().toString(36)}-${randomHash().slice(0, 16)}`;
}

function storageGet(store: Storage | null, key: string): string {
  if (!store) return '';
  try {
    return store.getItem(key) || '';
  } catch {
    return '';
  }
}

function storageSet(store: Storage | null, key: string, value: string): void {
  if (!store) return;
  try {
    store.setItem(key, value);
  } catch {
    /* private mode */
  }
}

function visitorHash(): string {
  const w = webWindow();
  const ls = w?.localStorage ?? null;
  const raw = storageGet(ls, VISITOR_KEY);
  const now = Date.now();
  if (raw) {
    const [id, ts] = raw.split('|');
    if (/^[a-f0-9]{32}$/i.test(id) && now - Number(ts || 0) < VISITOR_MS) return id.toLowerCase();
  }
  const id = randomHash();
  storageSet(ls, VISITOR_KEY, `${id}|${now}`);
  return id;
}

function sessionHash(): string {
  const w = webWindow();
  const ss = w?.sessionStorage ?? null;
  const now = Date.now();
  const id = storageGet(ss, SESSION_KEY);
  const at = Number(storageGet(ss, SESSION_AT_KEY) || 0);
  if (/^[a-f0-9]{32}$/i.test(id) && now - at < SESSION_MS) {
    storageSet(ss, SESSION_AT_KEY, String(now));
    return id.toLowerCase();
  }
  const next = randomHash();
  storageSet(ss, SESSION_KEY, next);
  storageSet(ss, SESSION_AT_KEY, String(now));
  try {
    ss?.removeItem(ATTR_KEY);
  } catch {
    /* ignore */
  }
  return next;
}

function readUtm(search: string): Attribution {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  return {
    referrer: '',
    utmSource: (params.get('utm_source') || '').slice(0, 80),
    utmMedium: (params.get('utm_medium') || '').slice(0, 80),
    utmCampaign: (params.get('utm_campaign') || '').slice(0, 80),
    utmContent: (params.get('utm_content') || '').slice(0, 80),
    utmTerm: (params.get('utm_term') || '').slice(0, 80),
  };
}

function sessionAttribution(): Attribution {
  const w = webWindow();
  const ss = w?.sessionStorage ?? null;
  const fresh = readUtm(w?.location.search || '');
  try {
    fresh.referrer = String(w?.document?.referrer || '').slice(0, 300);
  } catch {
    fresh.referrer = '';
  }
  const hasUtm = !!(fresh.utmSource || fresh.utmMedium || fresh.utmCampaign);
  const storedRaw = storageGet(ss, ATTR_KEY);
  if (storedRaw && !hasUtm) {
    try {
      const stored = JSON.parse(storedRaw) as Attribution;
      if (stored && typeof stored === 'object') return stored;
    } catch {
      /* ignore */
    }
  }
  if (!storedRaw || hasUtm) storageSet(ss, ATTR_KEY, JSON.stringify(fresh));
  return fresh;
}

function parseClientHints() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  let device: 'mobile' | 'desktop' | 'tablet' | 'unknown' = 'desktop';
  const touch = typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0;
  if (/iPad|Tablet|PlayBook/i.test(ua) || (touch > 1 && /Macintosh/i.test(ua))) device = 'tablet';
  else if (/Mobi|Android.+Mobile|iPhone|iPod/i.test(ua)) device = 'mobile';
  let os = 'unknown';
  if (/Windows/i.test(ua)) os = 'windows';
  else if (/Android/i.test(ua)) os = 'android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'ios';
  else if (/Mac OS X/i.test(ua)) os = 'macos';
  else if (/Linux/i.test(ua)) os = 'linux';
  let browser = 'other';
  if (/Edg\//i.test(ua)) browser = 'edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'opera';
  else if (/SamsungBrowser/i.test(ua)) browser = 'samsung';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'chrome';
  else if (/Firefox\//i.test(ua)) browser = 'firefox';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'safari';
  return { device, os, browser };
}

function shouldSkip(): boolean {
  const w = webWindow();
  if (!w) return true;
  if (!isAdoptionsHost(w.location.hostname)) return true;
  const path = (w.location.pathname || '/').replace(/\/+$/, '') || '/';
  if (path === '/admin' || path === `/${ADOPTIONS_SEGMENT}/admin`) return true;
  try {
    if (typeof navigator !== 'undefined' && (navigator as Navigator & { webdriver?: boolean }).webdriver) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function postTrack(payload: Record<string, unknown>): void {
  const body = JSON.stringify(payload);
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(`${API_ORIGIN}/db`, blob)) return;
    }
  } catch {
    /* fallback */
  }
  try {
    void fetch(`${API_ORIGIN}/db`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'omit',
      mode: 'cors',
    }).catch(() => {});
  } catch {
    /* fail open */
  }
}

export function trackAdoptionsEvent(input: {
  type: TrackType;
  path?: string;
  alertId?: string | null;
  network?: ShareNetwork;
}): void {
  try {
    if (!TRACK_TYPES.has(input.type)) return;
    if (shouldSkip()) return;
    const w = webWindow();
    if (!w) return;
    const path = (input.path || w.location.pathname || '/').split('?')[0].split('#')[0];
    const key = `${input.type}|${path}|${input.alertId || ''}|${input.network || ''}`;
    const now = Date.now();
    const prev = lastSent.get(key) || 0;
    if (now - prev < DEDUPE_MS) return;
    lastSent.set(key, now);
    if (lastSent.size > 80) {
      for (const [k, t] of lastSent) if (now - t > 60_000) lastSent.delete(k);
    }
    const attr = sessionAttribution();
    const hints = parseClientHints();
    postTrack({
      action: 'adoptionsTrack',
      eventId: eventId(),
      type: input.type,
      path,
      alertId: input.alertId || undefined,
      network: input.network,
      visitorHash: visitorHash(),
      sessionHash: sessionHash(),
      ...attr,
      ...hints,
    });
  } catch {
    /* fail open */
  }
}

export function trackAdoptionsPathChange(pathname: string, params?: { alertId?: string; name?: string }): void {
  const path = String(pathname || '').split('?')[0].split('#')[0];
  if (!path) return;
  const clean = path.replace(/\/+$/, '') || '/';
  if (clean === '/admin' || clean === `/${ADOPTIONS_SEGMENT}/admin`) return;
  const alertId = params?.alertId;
  trackAdoptionsEvent({ type: 'page_view', path });
  if (params?.name === 'AdoptionPost' && alertId) {
    trackAdoptionsEvent({ type: 'adoption_detail_view', path, alertId });
  }
}
