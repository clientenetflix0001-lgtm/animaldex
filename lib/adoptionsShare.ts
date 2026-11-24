// ============================================================
// Animaldex Adopciones — mensajes y destinos de compartir.
// La URL canónica (sin UTM) se usa en Open Graph.
// Los UTM se agregan solo al enlace que se comparte, para medir campañas.
// ============================================================

import { Platform } from 'react-native';
import type { ApiAlert } from './db';
import { adoptionCanonicalUrl } from './adoptionsHost';

export type ShareNetwork = 'whatsapp' | 'facebook' | 'instagram' | 'native' | 'copy';
export type ShareOutcome = 'shared' | 'copied' | 'opened' | 'cancelled';

export function adoptionDisplayName(alert: Pick<ApiAlert, 'petName'> | { petName?: string | null }): string | null {
  const name = String(alert?.petName || '').trim();
  if (!name) return null;
  return name.slice(0, 40);
}

export function adoptionShareHeadline(alert: Pick<ApiAlert, 'petName'>): string {
  const name = adoptionDisplayName(alert);
  return name ? `Ayudá a ${name} a encontrar un hogar 🧡` : 'Ayudá a encontrarle un hogar 🧡';
}

export function adoptionWhatsappMessage(alert: Pick<ApiAlert, 'petName' | 'locality'>): string {
  const name = adoptionDisplayName(alert);
  const place = String(alert.locality || 'Salta Capital').trim() || 'Salta Capital';
  if (name) return `¡${name} busca un hogar en ${place}! 🧡 Ayudalo compartiendo o conocelo en Animaldex.`;
  return `¡Una mascota busca un hogar en ${place}! 🧡 Ayudala compartiendo o conocela en Animaldex.`;
}

export function adoptionShareTitle(alert: Pick<ApiAlert, 'petName' | 'locality'>): string {
  const name = adoptionDisplayName(alert);
  const place = String(alert.locality || 'Salta Capital').trim() || 'Salta Capital';
  return name ? `${name} busca un hogar en ${place}` : `Mascota en adopción en ${place}`;
}

/** Enlace canónico del detalle. Sin UTM: Open Graph y WhatsApp preview. */
export function adoptionShareCanonicalUrl(citySlug: string, alertId: string): string {
  return adoptionCanonicalUrl(citySlug, alertId);
}

/** Enlace con UTM para medir la difusión. No reemplaza el canonical de OG. */
export function adoptionShareTrackedUrl(citySlug: string, alertId: string, network: ShareNetwork): string {
  const url = new URL(adoptionCanonicalUrl(citySlug, alertId));
  url.searchParams.set('utm_source', network === 'native' || network === 'copy' ? 'share' : network);
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', 'adopciones_share');
  url.searchParams.set('utm_content', alertId);
  return url.toString();
}

export function facebookSharerUrl(targetUrl: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(targetUrl)}`;
}

export function whatsappShareUrl(message: string, targetUrl: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${message}\n${targetUrl}`)}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback */
  }
  if (typeof document === 'undefined') return false;
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export async function shareViaWebApi(title: string, text: string, url: string): Promise<ShareOutcome> {
  if (Platform.OS !== 'web') return 'cancelled';
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }) : null;
  if (nav?.share) {
    try {
      await nav.share({ title, text, url });
      return 'shared';
    } catch (e) {
      const name = (e as { name?: string })?.name || '';
      if (name === 'AbortError') return 'cancelled';
    }
  }
  const copied = await copyText(url);
  return copied ? 'copied' : 'cancelled';
}

export function canUseWebShare(): boolean {
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && typeof (navigator as Navigator & { share?: unknown }).share === 'function';
}

export function openExternal(url: string): void {
  if (typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
