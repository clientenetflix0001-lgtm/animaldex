import { normalizePhone } from './phone.ts';
import { buildTelUrl, buildWhatsAppUrl } from './adoptionContact.ts';

export const LISTING_CONTACT_REQUIRED = 'Elegí WhatsApp o teléfono e ingresá un número válido.';
export const LISTING_CONTACT_INVALID = 'El número de WhatsApp o teléfono no es válido.';
export const LISTING_CONTACT_MISSING = 'Este vendedor todavía no agregó un medio de contacto.';
export const LISTING_PATITAS_PURCHASE_DISABLED = true;

export type ListingContactMethod = 'whatsapp' | 'phone';

export type ParsedListingContact =
  | { ok: true; method: ListingContactMethod; value: string }
  | { ok: false; error: string };

export type ListingContactOpenAction =
  | { kind: 'whatsapp'; url: string; label: string }
  | { kind: 'tel'; url: string; label: string }
  | { kind: 'none'; message: string };

export function parseListingContact(
  methodRaw: unknown,
  valueRaw: unknown
): ParsedListingContact {
  const method = String(methodRaw || '').trim().toLowerCase();
  const value = normalizePhone(String(valueRaw || ''));
  if (method !== 'whatsapp' && method !== 'phone') {
    return { ok: false, error: LISTING_CONTACT_REQUIRED };
  }
  if (!value) return { ok: false, error: LISTING_CONTACT_INVALID };
  return { ok: true, method, value };
}

export function listingInquiryMessage(title: string): string {
  const name = String(title || '').trim() || 'tu publicación';
  return `Hola, vi tu publicación de ${name} en Animaldex.`;
}

export function resolveListingContactAction(opts: {
  method?: string | null;
  value?: string | null;
  fallbackPhone?: string | null;
  title: string;
}): ListingContactOpenAction {
  const parsed = parseListingContact(opts.method, opts.value);
  const phone = parsed.ok ? parsed.value : normalizePhone(String(opts.fallbackPhone || ''));
  const method = parsed.ok ? parsed.method : phone ? 'phone' : null;
  if (!method || !phone) {
    return { kind: 'none', message: LISTING_CONTACT_MISSING };
  }
  if (method === 'whatsapp') {
    const url = buildWhatsAppUrl(phone, listingInquiryMessage(opts.title));
    if (!url) return { kind: 'none', message: LISTING_CONTACT_MISSING };
    return { kind: 'whatsapp', url, label: 'Contactar por WhatsApp' };
  }
  const url = buildTelUrl(phone);
  if (!url) return { kind: 'none', message: LISTING_CONTACT_MISSING };
  return { kind: 'tel', url, label: 'Llamar' };
}

export function listingPriceLabel(priceArs?: number | null): string | null {
  if (priceArs == null || !Number.isFinite(priceArs) || priceArs <= 0) return null;
  return `$${Math.round(priceArs).toLocaleString('es-AR')}`;
}
