import type { PublicProfile } from '../features/profiles/profileTypes';
import { protectorPagesForQr, qrPageRegisterViewForCount, type QrPageRegisterView } from './qrPageRegister.ts';
import { hasOwnerContactNumber, ownerNeedsContactStep } from './petOwnerContact.ts';

export const QR_REGISTER_NEW_PET_LABEL = 'Registrar una mascota nueva';
export const QR_REGISTER_NEW_PET_HELP = 'Creá el perfil de tu mascota y vinculá esta chapita.';
export const QR_LINK_EXISTING_PET_LABEL = 'Vincular a una mascota existente';
export const QR_LINK_EXISTING_PET_HELP = 'Elegí una mascota que ya tenés registrada en Animaldex.';
export const QR_REGISTER_PAGE_PET_LABEL = 'Registrar una mascota en mi página';
export const QR_REGISTER_PAGE_PET_HELP = 'Creá una mascota dentro de una de tus páginas y vinculá esta chapita.';

export type QrLinkChoice = 'new_personal' | 'existing' | 'new_page';

export type QrWelcomeView =
  | 'welcome'
  | 'contact'
  | 'pick-existing'
  | QrPageRegisterView;

export function qrPageOptionVisible(profiles: Array<{ type?: string | null }> | null | undefined): boolean {
  return protectorPagesForQr(profiles).length > 0;
}

export function qrWelcomeChoices(profiles: Array<{ type?: string | null }> | null | undefined): QrLinkChoice[] {
  const choices: QrLinkChoice[] = ['new_personal', 'existing'];
  if (qrPageOptionVisible(profiles)) choices.push('new_page');
  return choices;
}

export function qrPageViewAfterChoice(profiles: Array<{ type?: string | null }> | null | undefined): QrPageRegisterView | null {
  if (!qrPageOptionVisible(profiles)) return null;
  return qrPageRegisterViewForCount(protectorPagesForQr(profiles).length);
}

export function existingPetsForQr<T extends { archivedAt?: number | null }>(pets: T[] | null | undefined): T[] {
  return (pets || []).filter((p) => !p.archivedAt);
}

export function qrNeedsContactStep(source: {
  contactWhatsapp?: string | null;
  contactPhone?: string | null;
} | null | undefined): boolean {
  return ownerNeedsContactStep(source);
}

export type QrContactStepKind = 'full' | 'visibility';

/** Sin número → formulario. Con número → solo visibilidad, sin reescribir. */
export function qrContactStep(source: {
  contactWhatsapp?: string | null;
  contactPhone?: string | null;
} | null | undefined): QrContactStepKind {
  return qrNeedsContactStep(source) ? 'full' : 'visibility';
}

export function qrContactReady(source: {
  contactWhatsapp?: string | null;
  contactPhone?: string | null;
} | null | undefined): boolean {
  return hasOwnerContactNumber(source);
}

export function pageSourceForQrContact(page: PublicProfile | null | undefined) {
  if (!page) return null;
  return {
    contactWhatsapp: page.adoptionWhatsapp || null,
    contactPhone: page.adoptionPhone || page.phone || null,
  };
}
