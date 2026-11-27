// ============================================================
// Animaldex Adopciones — Google Analytics 4 (gtag.js directo).
// Exclusivo para https://adopciones.animaldex.com en rutas públicas.
// Independiente del flujo principal (fail-open) y sin datos personales.
// ============================================================

import { Platform } from 'react-native';
import { ADOPTIONS_ORIGIN, isAdoptionsHost, stripAdoptionsPrefix } from './adoptionsHost';
import { adoptionLocalityBySlug, ADOPTIONS_SEGMENT, DEFAULT_ADOPTION_SLUG } from './adoptionLocalities';
import { adoptionSpeciesGroup } from './adoptionSpeciesFilter';

export const GA4_MEASUREMENT_ID = 'G-W0D1L1BDJL';
export const GA4_STREAM_ID = '16427081083';
const GA4_SCRIPT_SRC = `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`;
const GA_DISABLE_PROP = 'ga-disable-G-W0D1L1BDJL' as const;
const CONSENT_STORAGE_KEY = 'adx_analytics_consent';

const SHARE_DEDUPE_MS = 500;
const ACTION_DEDUPE_MS = 1200;

const ALLOWED_CAMPAIGN_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'gclid',
  'fbclid',
] as const;

const ALLOWED_SHARE_NETWORKS = new Set<Ga4ShareNetwork>([
  'whatsapp',
  'facebook',
  'instagram',
  'native',
  'copy_link',
]);

export type Ga4ShareNetwork = 'whatsapp' | 'facebook' | 'instagram' | 'native' | 'copy_link';
export type AdoptionAnalyticsSpecies = 'perro' | 'gato' | 'otro';

type InitialLanding = {
  pathname: string;
  search: string;
  referrer: string;
};

type Ga4Window = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  google_tag_manager?: unknown;
  __adxGa4Configured?: boolean;
  __adxInitialLanding?: InitialLanding;
  'ga-disable-G-W0D1L1BDJL'?: boolean;
};

const recentEvents = new Map<string, number>();
const completedPublishIds = new Set<string>();

let lastTrackedPath: string | null = null;
let lastTrackedLocation: string | null = null;
let initialLandingConsumed = false;

function gaWindow(): Ga4Window | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }
  return window as Ga4Window;
}

export function cleanAnalyticsPathname(raw: string | null | undefined): string {
  const base = String(raw || '/')
    .split('?')[0]
    .split('#')[0]
    .trim();
  if (!base) return '/';
  const normalized = base.startsWith('/') ? base : `/${base}`;
  const trimmed = normalized.replace(/\/+$/, '');
  return trimmed || '/';
}

export function isExcludedAnalyticsPath(pathname: string): boolean {
  const clean = cleanAnalyticsPathname(pathname).toLowerCase();
  if (clean === '/admin' || clean.startsWith('/admin/')) return true;
  if (clean === `/${ADOPTIONS_SEGMENT}/admin` || clean.startsWith(`/${ADOPTIONS_SEGMENT}/admin/`)) {
    return true;
  }
  if (
    clean === '/privacidad' ||
    clean === '/eliminar-cuenta' ||
    clean === '/seguridad-infantil' ||
    clean.startsWith('/legal/')
  ) {
    return true;
  }
  return false;
}

function hasExplicitOptOut(w: Ga4Window): boolean {
  if (w[GA_DISABLE_PROP] === true) return true;
  try {
    if (w.localStorage?.getItem(CONSENT_STORAGE_KEY) === 'denied') {
      w[GA_DISABLE_PROP] = true;
      return true;
    }
  } catch {
    /* modo privado o almacenamiento bloqueado */
  }
  return false;
}

export function isAdoptionsGa4Allowed(pathnameOverride?: string): boolean {
  const w = gaWindow();
  if (!w) return false;
  try {
    if (w.location.protocol !== 'https:') return false;
    if (!isAdoptionsHost(w.location.hostname)) return false;
    const targetPath = pathnameOverride ?? w.location.pathname ?? '/';
    if (isExcludedAnalyticsPath(targetPath)) return false;
    if (typeof navigator !== 'undefined' && (navigator as Navigator & { webdriver?: boolean }).webdriver) {
      return false;
    }
    if (hasExplicitOptOut(w)) return false;
    return true;
  } catch {
    return false;
  }
}

function captureInitialLanding(): void {
  const w = gaWindow();
  if (!w) return;
  try {
    if (!isAdoptionsHost(w.location.hostname)) return;
    if (!w.__adxInitialLanding) {
      w.__adxInitialLanding = {
        pathname: w.location.pathname || '/',
        search: w.location.search || '',
        referrer: document.referrer || '',
      };
    }
  } catch {
    /* fail-open */
  }
}

captureInitialLanding();

function looksLikePersonalValue(value: string): boolean {
  if (!value) return false;
  // Descarta correos electrónicos o valores que parezcan números de teléfono.
  if (value.includes('@')) return true;
  if (/^[+\d\s().-]{8,}$/.test(value)) return true;
  return false;
}

function sanitizeCampaignSearch(rawSearch: string | null | undefined): string {
  const raw = String(rawSearch || '').trim();
  if (!raw || raw === '?') return '';
  try {
    const incoming = new URLSearchParams(raw.startsWith('?') ? raw : `?${raw}`);
    const out = new URLSearchParams();
    for (const key of ALLOWED_CAMPAIGN_PARAMS) {
      const val = (incoming.get(key) || '').trim().slice(0, 100);
      if (val && !looksLikePersonalValue(val)) {
        out.set(key, val);
      }
    }
    const serialized = out.toString();
    return serialized ? `?${serialized}` : '';
  } catch {
    return '';
  }
}

function sanitizeReferrer(rawReferrer: string | null | undefined): string {
  const raw = String(rawReferrer || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    // Sin credenciales, hash ni query potencialmente sensible.
    const cleanPath = cleanAnalyticsPathname(parsed.pathname);
    return `${parsed.origin}${cleanPath === '/' ? '/' : cleanPath}`.slice(0, 300);
  } catch {
    return '';
  }
}

export function ensureAdoptionsGa4Loaded(): boolean {
  const w = gaWindow();
  if (!w || !isAdoptionsGa4Allowed()) return false;
  try {
    if (!Array.isArray(w.dataLayer)) {
      w.dataLayer = [];
    }
    if (typeof w.gtag !== 'function') {
      // gtag.js requiere objetos Arguments en dataLayer.
      w.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        (w.dataLayer as unknown[]).push(arguments);
      };
    }
    if (!w.__adxGa4Configured) {
      w.__adxGa4Configured = true;
      w.gtag('consent', 'default', {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'granted',
      });
      w.gtag('js', new Date());
      w.gtag('config', GA4_MEASUREMENT_ID, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      });
    }

    const existing = Array.from(document.getElementsByTagName('script')).some((el) =>
      String(el.src || '').includes(`googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`)
    );
    if (!existing && document.head) {
      const script = document.createElement('script');
      script.async = true;
      script.src = GA4_SCRIPT_SRC;
      script.onerror = () => {
        /* bloqueador o falla de red: continuar normalmente */
      };
      document.head.appendChild(script);
    }
    return true;
  } catch {
    return false;
  }
}

function sendGa4Event(eventName: string, params: Record<string, string>): void {
  try {
    const w = gaWindow();
    if (!w || !ensureAdoptionsGa4Loaded() || typeof w.gtag !== 'function') return;
    // Si gtag.js está bloqueado, evita acumular entradas indefinidamente en memoria.
    if (Array.isArray(w.dataLayer) && w.dataLayer.length > 300 && !w.google_tag_manager) {
      return;
    }
    w.gtag('event', eventName, params);
  } catch {
    /* fail-open */
  }
}

function shouldDedupe(key: string, windowMs: number): boolean {
  const now = Date.now();
  const prev = recentEvents.get(key) || 0;
  if (now - prev < windowMs) return true;
  recentEvents.set(key, now);
  if (recentEvents.size > 100) {
    for (const [k, ts] of recentEvents) {
      if (now - ts > 60_000) recentEvents.delete(k);
    }
  }
  return false;
}

export function adoptionAnalyticsSpecies(
  alert?: {
    species?: string | null;
    mediaKind?: 'photo' | 'flyer' | null;
    speciesConfirmed?: boolean | null;
  } | null
): AdoptionAnalyticsSpecies | undefined {
  if (!alert) return undefined;
  const group = adoptionSpeciesGroup(alert);
  return group === 'unknown' ? undefined : group;
}

function resolveCanonicalSubdomainPath(input: {
  pathname: string;
  routeName?: string;
  city?: string;
  alertId?: string;
}): string | null {
  const citySlug = adoptionLocalityBySlug(input.city)?.slug || (input.city ? String(input.city).trim().toLowerCase() : '');
  if (input.routeName === 'AdoptionsWall') {
    return `/${citySlug || DEFAULT_ADOPTION_SLUG}`;
  }
  if (input.routeName === 'AdoptionPost' && input.alertId) {
    return `/${citySlug || DEFAULT_ADOPTION_SLUG}/${encodeURIComponent(input.alertId)}`;
  }
  if (input.routeName === 'AdoptionPublish') {
    return `/${citySlug || DEFAULT_ADOPTION_SLUG}/publicar`;
  }
  if (input.routeName === 'AdoptionMine') {
    return `/${citySlug || DEFAULT_ADOPTION_SLUG}/mis-publicaciones`;
  }
  if (input.routeName === 'Auth') {
    return '/entrar';
  }
  if (input.routeName === 'AlertDetail' && input.alertId) {
    return `/a/${encodeURIComponent(input.alertId)}`;
  }

  // Evita enviar rutas con nombres de usuario u otros datos potencialmente personales.
  if (input.routeName === 'PublicProfile' || input.routeName === 'UserProfile') {
    return null;
  }

  const stripped = cleanAnalyticsPathname(stripAdoptionsPrefix(cleanAnalyticsPathname(input.pathname)));
  if (stripped === '/') return `/${DEFAULT_ADOPTION_SLUG}`;
  return stripped;
}

function buildSafePageTitle(
  canonicalPath: string,
  input: { routeName?: string; city?: string }
): string {
  const segments = canonicalPath.split('/').filter(Boolean);
  const inferredCity = input.city || segments[0] || DEFAULT_ADOPTION_SLUG;
  const locality = adoptionLocalityBySlug(inferredCity)?.locality || 'Adopciones';

  if (input.routeName === 'AdoptionsWall' || (segments.length === 1 && adoptionLocalityBySlug(segments[0]))) {
    return `Adopciones en ${locality} · Animaldex`;
  }
  if (input.routeName === 'AdoptionPublish' || segments[1] === 'publicar') {
    return `Publicar en adopción · ${locality} · Animaldex`;
  }
  if (input.routeName === 'AdoptionMine' || segments[1] === 'mis-publicaciones') {
    return `Mis publicaciones · ${locality} · Animaldex`;
  }
  if (
    input.routeName === 'AdoptionPost' ||
    (segments.length === 2 && Boolean(adoptionLocalityBySlug(segments[0])))
  ) {
    return `Publicación de adopción · ${locality} · Animaldex`;
  }
  if (input.routeName === 'Auth' || canonicalPath === '/entrar') {
    return 'Iniciar sesión · Animaldex Adopciones';
  }
  return 'Animaldex Adopciones';
}

export function trackAdoptionsPageView(input: {
  pathname: string;
  routeName?: string;
  city?: string;
  alertId?: string;
}): void {
  try {
    const w = gaWindow();
    if (!w) return;
    const canonicalPath = resolveCanonicalSubdomainPath(input);
    if (!canonicalPath) return;
    if (!isAdoptionsGa4Allowed(canonicalPath)) return;

    // Una sola visita por cada navegación real completada hacia una ruta distinta.
    if (lastTrackedPath === canonicalPath) return;

    let search = sanitizeCampaignSearch(w.location.search);
    if (!search && !initialLandingConsumed && w.__adxInitialLanding) {
      const initialClean = cleanAnalyticsPathname(stripAdoptionsPrefix(cleanAnalyticsPathname(w.__adxInitialLanding.pathname)));
      const normalizedInitial = initialClean === '/' ? `/${DEFAULT_ADOPTION_SLUG}` : initialClean;
      if (normalizedInitial === canonicalPath) {
        search = sanitizeCampaignSearch(w.__adxInitialLanding.search);
      }
    }

    let pageReferrer = '';
    if (lastTrackedLocation) {
      pageReferrer = lastTrackedLocation.split('?')[0];
    } else {
      const rawRef = w.__adxInitialLanding?.referrer || document.referrer || '';
      pageReferrer = sanitizeReferrer(rawRef);
    }

    initialLandingConsumed = true;
    const pageLocation = `${ADOPTIONS_ORIGIN}${canonicalPath}${search}`;
    const pageTitle = buildSafePageTitle(canonicalPath, input);

    lastTrackedPath = canonicalPath;
    lastTrackedLocation = pageLocation;

    sendGa4Event('page_view', {
      page_location: pageLocation,
      page_title: pageTitle,
      ...(pageReferrer ? { page_referrer: pageReferrer } : {}),
    });
  } catch {
    /* fail-open */
  }
}

function cleanId(raw: string | null | undefined, max = 80): string {
  return String(raw || '').trim().slice(0, max);
}

function cleanCity(raw: string | null | undefined): string {
  const slug = adoptionLocalityBySlug(raw)?.slug;
  if (slug) return slug;
  const fallback = String(raw || DEFAULT_ADOPTION_SLUG)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 40);
  return fallback || DEFAULT_ADOPTION_SLUG;
}

export function trackAdoptionDetailView(input: {
  adoptionId: string;
  species?: AdoptionAnalyticsSpecies;
  city?: string | null;
}): void {
  try {
    const adoptionId = cleanId(input.adoptionId);
    if (!adoptionId || !isAdoptionsGa4Allowed()) return;
    const city = cleanCity(input.city);
    if (shouldDedupe(`adoption_detail_view|${adoptionId}`, ACTION_DEDUPE_MS)) return;
    sendGa4Event('adoption_detail_view', {
      adoption_id: adoptionId,
      ...(input.species ? { species: input.species } : {}),
      city,
    });
  } catch {
    /* fail-open */
  }
}

export function trackAdoptionShareIntent(input: {
  adoptionId: string;
  shareNetwork: Ga4ShareNetwork;
  species?: AdoptionAnalyticsSpecies;
  city?: string | null;
}): void {
  try {
    const adoptionId = cleanId(input.adoptionId);
    if (!adoptionId || !ALLOWED_SHARE_NETWORKS.has(input.shareNetwork) || !isAdoptionsGa4Allowed()) {
      return;
    }
    const city = cleanCity(input.city);
    if (shouldDedupe(`share_intent|${adoptionId}|${input.shareNetwork}`, SHARE_DEDUPE_MS)) return;
    sendGa4Event('share_intent', {
      adoption_id: adoptionId,
      share_network: input.shareNetwork,
      ...(input.species ? { species: input.species } : {}),
      city,
    });
  } catch {
    /* fail-open */
  }
}

export function trackAdoptionShareCopied(input: {
  adoptionId: string;
  shareNetwork: Ga4ShareNetwork;
  species?: AdoptionAnalyticsSpecies;
  city?: string | null;
}): void {
  try {
    const adoptionId = cleanId(input.adoptionId);
    if (!adoptionId || !ALLOWED_SHARE_NETWORKS.has(input.shareNetwork) || !isAdoptionsGa4Allowed()) {
      return;
    }
    const city = cleanCity(input.city);
    if (shouldDedupe(`share_link_copied|${adoptionId}|${input.shareNetwork}`, SHARE_DEDUPE_MS)) return;
    sendGa4Event('share_link_copied', {
      adoption_id: adoptionId,
      share_network: input.shareNetwork,
      ...(input.species ? { species: input.species } : {}),
      city,
    });
  } catch {
    /* fail-open */
  }
}

export function trackAdoptContactClick(input: {
  adoptionId: string;
  species?: AdoptionAnalyticsSpecies;
  city?: string | null;
}): void {
  try {
    const adoptionId = cleanId(input.adoptionId);
    if (!adoptionId || !isAdoptionsGa4Allowed()) return;
    const city = cleanCity(input.city);
    if (shouldDedupe(`adopt_contact_click|${adoptionId}`, ACTION_DEDUPE_MS)) return;
    sendGa4Event('adopt_contact_click', {
      adoption_id: adoptionId,
      ...(input.species ? { species: input.species } : {}),
      city,
    });
  } catch {
    /* fail-open */
  }
}

export function trackAdoptionPublishStarted(input: { city?: string | null }): void {
  try {
    if (!isAdoptionsGa4Allowed()) return;
    const city = cleanCity(input.city);
    if (shouldDedupe(`publish_started|${city}`, ACTION_DEDUPE_MS)) return;
    sendGa4Event('publish_started', { city });
  } catch {
    /* fail-open */
  }
}

export function trackAdoptionPublishCompleted(input: {
  adoptionId: string;
  species?: AdoptionAnalyticsSpecies;
  city?: string | null;
}): void {
  try {
    const adoptionId = cleanId(input.adoptionId);
    if (!adoptionId || !isAdoptionsGa4Allowed()) return;
    if (completedPublishIds.has(adoptionId)) return;
    completedPublishIds.add(adoptionId);
    const city = cleanCity(input.city);
    sendGa4Event('publish_completed', {
      adoption_id: adoptionId,
      ...(input.species ? { species: input.species } : {}),
      city,
    });
  } catch {
    /* fail-open */
  }
}
