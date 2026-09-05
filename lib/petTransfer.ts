/** Transferencia de titularidad: copy, validación y reglas de Adoptados. */

export const PET_TRANSFER_STATUSES = ['pending', 'accepted', 'rejected', 'cancelled'] as const;
export type PetTransferStatus = (typeof PET_TRANSFER_STATUSES)[number];

export const PET_TRANSFER_SELF_ERROR = 'No podés transferirte una mascota a vos mismo.';
export const PET_TRANSFER_USER_NOT_FOUND = 'No encontramos un usuario registrado con esos datos.';
export const PET_TRANSFER_PENDING_EXISTS = 'Esta mascota ya tiene una transferencia pendiente.';
export const PET_TRANSFER_STALE = 'Esta transferencia ya no está disponible.';
export const PET_TRANSFER_FORBIDDEN = 'Esa mascota no es tuya';
export const PET_TRANSFER_IDENTIFIER_ERROR = 'Ingresá el correo electrónico o número de teléfono.';
export const PET_TRANSFER_PAGE_REQUIRED = 'Elegí una página de Bienestar Animal.';
export const PET_TRANSFER_PAGE_FORBIDDEN = 'Esa página de Bienestar Animal no es tuya.';

export function countsAsPageAdoption(input: {
  sourceProfileId?: string | null;
  kind: 'internal' | 'external';
}): boolean {
  return input.kind === 'external' && !!String(input.sourceProfileId || '').trim();
}

export function isPersonalOwnership(profileId?: string | null): boolean {
  return !String(profileId || '').trim();
}

export function personalToPageWarning(): string {
  return 'Esta mascota dejará Mis mascotas y pasará a la página seleccionada.';
}

export function pageToPersonalWarning(pageName?: string | null): string {
  const name = String(pageName || '').trim() || 'la página';
  return `Esta mascota dejará ${name} y pasará a Mis mascotas.`;
}

export function externalWarning(): string {
  return 'La titularidad solo cambiará si la otra persona acepta.';
}

export function externalLeaveNote(): string {
  return 'Cuando la transferencia se complete, dejarás de administrar este perfil de mascota.';
}

export function pageToExternalAdoptionNote(pageName?: string | null): string {
  const name = String(pageName || '').trim() || 'la página';
  return `Si acepta, la mascota dejará ${name} y se registrará como adoptada.`;
}

export function recipientAcceptWarning(petName?: string | null): string {
  const name = String(petName || '').trim() || 'esta mascota';
  return `Al aceptar, pasarás a administrar este perfil y su chapita QR.`;
}

export function recipientAcceptConfirm(petName?: string | null): string {
  const name = String(petName || '').trim() || 'esta mascota';
  return `Al aceptar, pasarás a ser titular del perfil de ${name} y podrás administrar sus datos, publicaciones y chapita QR.`;
}

export function transferRequestedCopy(senderName: string, petName: string): { title: string; body: string } {
  const who = String(senderName || '').trim() || 'Alguien';
  const pet = String(petName || '').trim() || 'una mascota';
  return {
    title: `${who} quiere transferirte el perfil de ${pet}.`,
    body: 'Revisá la solicitud para aceptar o rechazar la transferencia.',
  };
}

export function transferAcceptedCopy(username: string, petName: string): { title: string; body: string } {
  const who = String(username || '').trim() || 'El usuario';
  const pet = String(petName || '').trim() || 'la mascota';
  return {
    title: `${who} aceptó la transferencia de ${pet}.`,
    body: 'La transferencia se completó correctamente.',
  };
}

export function transferRejectedCopy(username: string, petName: string): { title: string; body: string } {
  const who = String(username || '').trim() || 'El usuario';
  const pet = String(petName || '').trim() || 'la mascota';
  return {
    title: `${who} rechazó la transferencia de ${pet}.`,
    body: `La transferencia de ${pet} fue cancelada por el usuario.`,
  };
}

export function rejectConfirmCopy(): string {
  return '¿Querés rechazar esta transferencia?';
}

export function pendingBannerCopy(recipientName?: string | null): string {
  const who = String(recipientName || '').trim();
  return who ? `Esperando respuesta de ${who}` : 'Transferencia pendiente';
}

export function sameOwnerSnapshot(pet: { userId?: string | null; profileId?: string | null }, request: {
  senderUserId?: string | null;
  sourceProfileId?: string | null;
}): boolean {
  const petUser = String(pet.userId || '').trim();
  const sender = String(request.senderUserId || '').trim();
  if (!petUser || petUser !== sender) return false;
  return String(pet.profileId || '').trim() === String(request.sourceProfileId || '').trim();
}

export function transferLookupAllowed(kind: string): boolean {
  return kind === 'email' || kind === 'phone';
}

export function adoptedCountAfterAccept(currentAdopted: number, sourceProfileId?: string | null): number {
  return countsAsPageAdoption({ sourceProfileId, kind: 'external' }) ? currentAdopted + 1 : currentAdopted;
}

const PERSONAL_CARE = ['en_casa', 'perdido'] as const;
const PAGE_CARE = ['en_adopcion', 'en_recuperacion'] as const;

/** Empresa no puede ser owner de mascota hoy (createPet solo acepta protector). */
export function transferablePages<T extends { type?: string | null }>(pages: T[]): T[] {
  return pages.filter((p) => p.type === 'protector');
}

export function remappedCareStatus(
  current: string | null | undefined,
  target: 'personal' | 'page'
): { careStatus: string; adoptionStartedAt: number | null; keepExistingAdoptionStart: boolean } {
  const cur = String(current || '').trim();
  if (target === 'personal') {
    return {
      careStatus: (PERSONAL_CARE as readonly string[]).includes(cur) ? cur : 'en_casa',
      adoptionStartedAt: null,
      keepExistingAdoptionStart: false,
    };
  }
  const careStatus = (PAGE_CARE as readonly string[]).includes(cur) ? cur : 'en_adopcion';
  return {
    careStatus,
    adoptionStartedAt: careStatus === 'en_adopcion' ? 0 : null,
    keepExistingAdoptionStart: cur === 'en_adopcion',
  };
}
