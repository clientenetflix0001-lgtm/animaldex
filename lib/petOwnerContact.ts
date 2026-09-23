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
    // verified_phone es OTP de identidad, no insignia de cuenta.
    verified: user.verified === true,
  };
}

/** Animaldex todavía no tiene verified de cuenta. No inferir desde verified_phone. */
export const ACCOUNT_VERIFIED_AVAILABLE = false;

export function isAccountVerified(source: { verified?: boolean | null } | null | undefined): boolean {
  return ACCOUNT_VERIFIED_AVAILABLE && source?.verified === true;
}

/** Payload público: números solo si hay consentimiento. verified nunca por OTP. */
export function publicOwnerContactPayload(source: PetContactSource | null | undefined): PublicPetOwnerContact | null {
  const resolved = resolvePublicPetOwnerContact(
    source ? { ...source, verified: isAccountVerified(source) } : source
  );
  if (!resolved) return null;
  return {
    ...resolved,
    verified: false,
    whatsapp: isPetContactVisible(source?.petContactVisible) ? resolved.whatsapp : null,
    phone: isPetContactVisible(source?.petContactVisible) ? resolved.phone : null,
  };
}

export function publicPetProfileShelter<T extends { phone?: string | null; adoptionWhatsapp?: string | null; adoptionPhone?: string | null }>(
  page: T | null | undefined
): (Omit<T, 'adoptionWhatsapp' | 'adoptionPhone'> & { phone: string }) | null {
  if (!page) return null;
  const { adoptionWhatsapp: _wa, adoptionPhone: _ph, ...rest } = page;
  return { ...rest, phone: '' };
}

export function publicPayloadContainsStoredPhone(payload: unknown, stored: string | null | undefined): boolean {
  const raw = String(stored || '').trim();
  if (!raw) return false;
  const json = JSON.stringify(payload);
  if (json.includes(raw)) return true;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) return false;
  return json.replace(/\D/g, '').includes(digits);
}

export function publicPetProfileContactJson(input: {
  petProfileId?: string | null;
  page?: Parameters<typeof pageContactSource>[0];
  user?: Parameters<typeof userContactSource>[0];
}): { ownerContact: PublicPetOwnerContact | null; shelter: { phone: string } | null } {
  const source = contactSourceForPet(input);
  const ownerContact = publicOwnerContactPayload(source);
  const shelter =
    input.petProfileId && input.page
      ? publicPetProfileShelter({
          id: input.page.id || null,
          username: input.page.username || null,
          phone: input.page.phone || '',
          adoptionWhatsapp: input.page.adoptionWhatsapp || null,
          adoptionPhone: input.page.adoptionPhone || null,
        })
      : null;
  return { ownerContact, shelter };
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

/** Username visible en la owner card. Nunca el nombre real. */
export function ownerCardIdentityLabel(input: {
  shelterUsername?: string | null;
  ownerUsername?: string | null;
  ownerName?: string | null;
}): string {
  const username = String(input.shelterUsername || input.ownerUsername || '')
    .replace(/^@/, '')
    .trim();
  return username;
}

/** verified_phone / OTP no es insignia. Reservar layout, no pintar check. */
export function ownerCardShowsVerifiedBadge(
  _contact?: { verified?: boolean | null } | null
): boolean {
  return ACCOUNT_VERIFIED_AVAILABLE && _contact?.verified === true;
}

export function ownerCardModel(input: {
  shelterUsername?: string | null;
  ownerUsername?: string | null;
  ownerName?: string | null;
  ownerContact?: PublicPetOwnerContact | null;
}): {
  identity: string;
  showVerified: boolean;
  showWhatsapp: boolean;
  showPhone: boolean;
  whatsappUrl: string | null;
  phoneUrl: string | null;
} {
  const buttons = publicContactButtons(input.ownerContact);
  return {
    identity: ownerCardIdentityLabel(input),
    showVerified: ownerCardShowsVerifiedBadge(input.ownerContact),
    showWhatsapp: buttons.showWhatsapp,
    showPhone: buttons.showPhone,
    whatsappUrl: whatsappConversationUrl(input.ownerContact?.whatsapp),
    phoneUrl: telUrl(input.ownerContact?.phone),
  };
}
