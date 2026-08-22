/**
 * Identificadores de autenticación y normalización telefónica (Argentina).
 * Mantener sincronizado con worker/index.js (misma lógica, sin imports TS).
 */

export const EMAIL_RE = /^[a-z0-9._%+\-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 6;
export const E164_RE = /^\+[1-9]\d{8,14}$/;
export const AR_MOBILE_E164_RE = /^\+549\d{10}$/;

export type IdentifierKind = 'email' | 'phone' | 'username' | 'invalid';

export interface ClassifiedIdentifier {
  kind: IdentifierKind;
  value: string;
  reason?: string;
}

function digitsAndPlus(raw: string): string {
  const s = String(raw || '').trim();
  let out = '';
  for (const ch of s) {
    if (ch === '+' && out.length === 0) out += '+';
    else if (ch >= '0' && ch <= '9') out += ch;
  }
  if (out.startsWith('00')) out = `+${out.slice(2)}`;
  return out;
}

/**
 * Extrae los 10 dígitos nacionales argentinos (área + número),
 * contemplando 0 de área, 15 antiguo y prefijo 54/549.
 */
export function argentineNational10(raw: string): string | null {
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

/** Móvil argentino en E.164: +54 9 + 10 dígitos nacionales. */
export function normalizeArMobile(raw: string): string | null {
  const national = argentineNational10(raw);
  if (!national) return null;
  const e164 = `+549${national}`;
  return AR_MOBILE_E164_RE.test(e164) ? e164 : null;
}

export function normalizePhone(raw: string): string | null {
  const compact = digitsAndPlus(raw);
  if (AR_MOBILE_E164_RE.test(compact)) return compact;
  const ar = normalizeArMobile(raw);
  if (ar) return ar;
  if (E164_RE.test(compact) && compact.startsWith('+') && !compact.startsWith('+54')) return compact;
  return null;
}

export function isValidEmail(raw: string): boolean {
  const email = String(raw || '').trim().toLowerCase();
  return email.length >= 6 && email.length <= EMAIL_MAX && EMAIL_RE.test(email);
}

export function normalizeEmail(raw: string): string {
  return String(raw || '').trim().toLowerCase();
}

/** Usernames que se confundirían con un teléfono (8-15 dígitos, o E.164 AR). */
export function usernameLooksLikePhone(username: string): boolean {
  const handle = String(username || '').trim().toLowerCase();
  if (/^\d{8,15}$/.test(handle)) return true;
  if (/^\+?\d{8,15}$/.test(handle)) return true;
  return normalizePhone(handle) != null;
}

export function validatePasswordPair(password: string, repeat: string): string | null {
  if (String(password || '').length < PASSWORD_MIN) {
    return 'La contraseña debe tener al menos 6 caracteres';
  }
  if (password !== repeat) return 'Las contraseñas no coinciden';
  return null;
}

export function classifyIdentifier(raw: string): ClassifiedIdentifier {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { kind: 'invalid', value: '', reason: 'empty' };

  if (trimmed.includes('@')) {
    const email = normalizeEmail(trimmed);
    if (!isValidEmail(email)) return { kind: 'invalid', value: email, reason: 'email' };
    return { kind: 'email', value: email };
  }

  const phone = normalizePhone(trimmed);
  if (phone) return { kind: 'phone', value: phone };

  const username = trimmed.replace(/^@/, '').toLowerCase();
  if (/^[a-z0-9_.]{3,20}$/.test(username) && !usernameLooksLikePhone(username)) {
    return { kind: 'username', value: username };
  }

  return { kind: 'invalid', value: trimmed, reason: 'format' };
}
