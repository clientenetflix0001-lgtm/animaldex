import type { PublicProfile } from '../features/profiles/profileTypes';

export const REGISTER_MY_PET_LABEL = 'Registrar mi mascota';
export const REGISTER_ON_PAGE_LABEL = 'Registrar esta mascota en tu página';
export const CREATE_PROTECTOR_PAGE_LABEL = 'Crear Bienestar Animal';
export const PAGE_REGISTER_IN_LABEL = 'Registrar en:';
export const PAGE_REGISTER_PICK_TITLE = '¿En qué página querés registrar esta mascota?';
export const PAGE_TYPE_VISIBLE_LABEL = 'Bienestar Animal';
export const NO_PROTECTOR_PAGE_MESSAGE =
  'Para registrar mascotas en una página primero necesitás crear una Página de Bienestar Animal.';

export type QrPageRegisterView = 'welcome' | 'single' | 'many' | 'need-create';

export function protectorPagesForQr<T extends { type?: string | null }>(profiles: T[] | null | undefined): T[] {
  return (profiles || []).filter((p) => p.type === 'protector');
}

export function qrPageRegisterViewForCount(count: number): QrPageRegisterView {
  if (count <= 0) return 'need-create';
  if (count === 1) return 'single';
  return 'many';
}

export function qrPageRegisterView(profiles: Array<{ type?: string | null }> | null | undefined): QrPageRegisterView {
  return qrPageRegisterViewForCount(protectorPagesForQr(profiles).length);
}

export function addPetParamsForPersonalQr(code: string): { tagCode: string } {
  return { tagCode: code };
}

export function addPetParamsForPageQr(code: string, profileId: string): { tagCode: string; profileId: string } {
  return { tagCode: code, profileId };
}

export function qrRegisterKeepsTag(code: string, params: { tagCode?: string }): boolean {
  return params.tagCode === code;
}

export function pageRegisterAllowsBusiness(type?: string | null): boolean {
  return type === 'protector';
}
