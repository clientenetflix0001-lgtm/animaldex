import { normalizePhone } from './phone.ts';
import { petCanonicalPath } from './petHandles.ts';

export const ADOPTION_CONTACT_REQUIRED =
  'Agregá un número de WhatsApp o teléfono para recibir solicitudes de adopción.';
export const ADOPTION_CONTACT_MISSING =
  'Esta página de Bienestar Animal todavía no agregó un medio de contacto para solicitudes de adopción.';
export const ADOPTION_CONTACT_INVALID = 'El número de WhatsApp o teléfono no es válido.';
export const ADOPTION_SITE_ORIGIN = 'https://animaldex-web.pages.dev';

export type AdoptionContactFields = {
  adoptionWhatsapp?: string | null;
  adoptionPhone?: string | null;
};

export type ParsedAdoptionContact =
  | { ok: true; whatsapp: string | null; phone: string | null }
  | { ok: false; error: string };

function digitsOnly(raw: string): string {
  let out = '';
  for (const ch of String(raw || '')) {
    if (ch >= '0' && ch <= '9') out += ch;
  }
  return out;
}

/** E.164 o vacío. Rechaza texto arbitrario. */
export function normalizeAdoptionPhone(raw: string | null | undefined): string | null {
  const t = String(raw || '').trim();
  if (!t) return null;
  return normalizePhone(t);
}

export function parseProtectorAdoptionContact(
  type: string | null | undefined,
  whatsappRaw: unknown,
  phoneRaw: unknown
): ParsedAdoptionContact {
  if (type !== 'protector') {
    return { ok: true, whatsapp: null, phone: null };
  }
  const waIn = whatsappRaw == null ? '' : String(whatsappRaw).trim();
  const phIn = phoneRaw == null ? '' : String(phoneRaw).trim();
  const whatsapp = waIn ? normalizeAdoptionPhone(waIn) : null;
  const phone = phIn ? normalizeAdoptionPhone(phIn) : null;
  if (waIn && !whatsapp) return { ok: false, error: ADOPTION_CONTACT_INVALID };
  if (phIn && !phone) return { ok: false, error: ADOPTION_CONTACT_INVALID };
  if (!whatsapp && !phone) return { ok: false, error: ADOPTION_CONTACT_REQUIRED };
  return { ok: true, whatsapp, phone };
}

export function whatsappDigits(e164: string | null | undefined): string | null {
  const n = normalizeAdoptionPhone(e164);
  if (!n) return null;
  const d = digitsOnly(n);
  if (!/^[1-9]\d{7,14}$/.test(d)) return null;
  return d;
}

export function buildWhatsAppUrl(phone: string | null | undefined, text: string): string | null {
  const d = whatsappDigits(phone);
  if (!d) return null;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

export function buildTelUrl(phone: string | null | undefined): string | null {
  const n = normalizeAdoptionPhone(phone);
  if (!n || !/^\+[1-9]\d{7,14}$/.test(n)) return null;
  return `tel:${n}`;
}

export function adoptCtaLabel(sex: string | null | undefined): string {
  const s = String(sex || '').trim().toLowerCase();
  if (s === 'macho') return 'Quiero adoptarlo';
  if (s === 'hembra') return 'Quiero adoptarla';
  return 'Quiero adoptar';
}

export function adoptionInquiryMessage(petName: string, handleOrId?: string | null): string {
  const name = String(petName || '').trim() || 'esta mascota';
  const lines = [`Hola, vi a ${name} en Animaldex y quisiera consultar por su adopción.`];
  const key = String(handleOrId || '').trim();
  if (key) {
    lines.push(`${ADOPTION_SITE_ORIGIN}${petCanonicalPath(key)}`);
  }
  return lines.join('\n');
}

export type AdoptionOpenAction =
  | { kind: 'whatsapp'; url: string; phone: string }
  | { kind: 'tel'; url: string; phone: string }
  | { kind: 'none'; message: string };

/**
 * WhatsApp tiene prioridad. Si el refugio resuelto no coincide con el
 * profile_id esperado, no abre nada (evita contacto de otra Página).
 */
export function resolveAdoptionOpenAction(opts: {
  expectedShelterProfileId?: string | null;
  shelterProfileId?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  petName: string;
  petHandleOrId?: string | null;
  inquiryUrl?: string | null;
}): AdoptionOpenAction {
  const expected = String(opts.expectedShelterProfileId || '').trim();
  const got = String(opts.shelterProfileId || '').trim();
  if (expected && got && expected !== got) {
    return { kind: 'none', message: ADOPTION_CONTACT_MISSING };
  }
  const name = String(opts.petName || '').trim() || 'esta mascota';
  const customUrl = String(opts.inquiryUrl || '').trim();
  const message = customUrl
    ? `Hola, vi a ${name} en Animaldex y quisiera consultar por su adopción.\n${customUrl}`
    : adoptionInquiryMessage(opts.petName, opts.petHandleOrId);
  const wa = buildWhatsAppUrl(opts.whatsapp, message);
  if (wa) {
    return { kind: 'whatsapp', url: wa, phone: normalizeAdoptionPhone(opts.whatsapp) || '' };
  }
  const tel = buildTelUrl(opts.phone);
  if (tel) {
    return { kind: 'tel', url: tel, phone: normalizeAdoptionPhone(opts.phone) || '' };
  }
  return { kind: 'none', message: ADOPTION_CONTACT_MISSING };
}
