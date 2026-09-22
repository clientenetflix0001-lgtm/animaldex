import { normalizePhone } from './phone.ts';

export const PET_CONTACT_VISIBLE_LABEL = 'Mostrar mis datos de contacto en los perfiles de mis mascotas';
export const PET_CONTACT_VISIBLE_HELP =
  'Permite que quien encuentre a una de tus mascotas pueda contactarte rápidamente.';
export const PAGE_PET_CONTACT_VISIBLE_LABEL =
  'Mostrar los datos de contacto de la página en los perfiles de sus mascotas';
export const PAGE_PET_CONTACT_VISIBLE_HELP =
  'Permite que quien encuentre a una mascota de la página pueda contactarla rápidamente.';
export const PET_CONTACT_STEP_TITLE = 'DATOS DE CONTACTO';
export const PET_CONTACT_STEP_HELP =
  'Estos datos pueden ayudar a que te contacten si encuentran a tu mascota.';

export const WHATSAPP_GREEN = '#25D366';
export const PHONE_ORANGE = '#FF6B4A';

export type PetContactSourceKind = 'user' | 'page';

export type PetContactSource = {
  kind: PetContactSourceKind;
  contactWhatsapp?: string | null;
  contactPhone?: string | null;
  petContactVisible?: boolean | number | null;
  verified?: boolean | null;
  username?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  id?: string | null;
};

export type PublicPetOwnerContact = {
  identity: string;
  verified: boolean;
  whatsapp: string | null;
  phone: string | null;
  username: string;
  id: string | null;
  avatarUrl: string | null;
  kind: PetContactSourceKind;
};

export function normalizePetContactPhone(raw: string | null | undefined): string | null {
  const t = String(raw || '').trim();
  if (!t) return null;
  return normalizePhone(t);
}

export function parseOwnerContactFields(
  whatsappRaw: unknown,
  phoneRaw: unknown
): { ok: true; whatsapp: string | null; phone: string | null } | { ok: false; error: string } {
  const waIn = whatsappRaw == null ? '' : String(whatsappRaw).trim();
  const phIn = phoneRaw == null ? '' : String(phoneRaw).trim();
  const whatsapp = waIn ? normalizePetContactPhone(waIn) : null;
  const phone = phIn ? normalizePetContactPhone(phIn) : null;
  if (waIn && !whatsapp) return { ok: false, error: 'El WhatsApp no es un número válido.' };
  if (phIn && !phone) return { ok: false, error: 'El teléfono no es un número válido.' };
  return { ok: true, whatsapp, phone };
}

export function hasOwnerContactNumber(source: {
  contactWhatsapp?: string | null;
  contactPhone?: string | null;
} | null | undefined): boolean {
  return !!(normalizePetContactPhone(source?.contactWhatsapp) || normalizePetContactPhone(source?.contactPhone));
}

export function isPetContactVisible(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

export function ownerPublicIdentity(source: { username?: string | null; name?: string | null } | null | undefined): string {
  const username = String(source?.username || '')
    .replace(/^@/, '')
    .trim();
  if (username) return username;
  return String(source?.name || '').trim();
}

export function resolvePublicPetOwnerContact(source: PetContactSource | null | undefined): PublicPetOwnerContact | null {
  if (!source) return null;
  const identity = ownerPublicIdentity(source);
  if (!identity && !source.id) return null;
  const visible = isPetContactVisible(source.petContactVisible);
  const whatsapp = visible ? normalizePetContactPhone(source.contactWhatsapp) : null;
  const phone = visible ? normalizePetContactPhone(source.contactPhone) : null;
  return {
    identity,
    verified: !!source.verified,
    whatsapp,
    phone,
    username: identity,
    id: source.id || null,
    avatarUrl: source.avatarUrl || null,
    kind: source.kind,
  };
}

export function publicContactButtons(contact: PublicPetOwnerContact | null | undefined): {
  showWhatsapp: boolean;
  showPhone: boolean;
} {
  return {
    showWhatsapp: !!contact?.whatsapp,
    showPhone: !!contact?.phone,
  };
}

export function whatsappConversationUrl(phone: string | null | undefined): string | null {
  const e164 = normalizePetContactPhone(phone);
  if (!e164) return null;
  const digits = e164.replace(/^\+/, '');
  return `https://wa.me/${digits}`;
}

export function telUrl(phone: string | null | undefined): string | null {
  const e164 = normalizePetContactPhone(phone);
  return e164 ? `tel:${e164}` : null;
}

/** Página: WhatsApp de adopción + teléfono de página/adopción. No el admin personal. */
export function pageContactSource(page: {
  id?: string | null;
  username?: string | null;
  name?: string | null;
  avatar?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
  adoptionWhatsapp?: string | null;
  adoptionPhone?: string | null;
  petContactVisible?: boolean | number | null;
} | null | undefined): PetContactSource | null {
  if (!page) return null;
  return {
    kind: 'page',
    id: page.id || null,
    username: page.username || null,
    name: page.name || null,
    avatarUrl: page.avatarUrl || page.avatar || null,
    contactWhatsapp: page.adoptionWhatsapp || null,
    contactPhone: page.adoptionPhone || page.phone || null,
    petContactVisible: page.petContactVisible,
    verified: false,
  };
}

export function userContactSource(user: {
  id?: string | null;
  username?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  contactWhatsapp?: string | null;
  contactPhone?: string | null;
  petContactVisible?: boolean | number | null;
  verified?: boolean | null;
  verifiedPhone?: string | null;
} | null | undefined): PetContactSource | null {
  if (!user) return null;
  return {
    kind: 'user',
    id: user.id || null,
    username: user.username || null,
    name: user.name || null,
    avatarUrl: user.avatarUrl || null,
    contactWhatsapp: user.contactWhatsapp || null,
    contactPhone: user.contactPhone || null,
    petContactVisible: user.petContactVisible,
    verified: user.verified === true || (!!user.verifiedPhone && user.verified !== false),
  };
}

export function contactSourceForPet(input: {
  petProfileId?: string | null;
  page?: Parameters<typeof pageContactSource>[0];
  user?: Parameters<typeof userContactSource>[0];
}): PetContactSource | null {
  if (input.petProfileId && input.page) return pageContactSource(input.page);
  return userContactSource(input.user);
}

export function ownerNeedsContactStep(source: {
  contactWhatsapp?: string | null;
  contactPhone?: string | null;
} | null | undefined): boolean {
  return !hasOwnerContactNumber(source);
}
