export type QrClaimKind = 'new_personal' | 'existing' | 'new_page';

export type QrClaimSuccessInput = {
  kind: QrClaimKind;
  username?: string | null;
  pageLabel?: string | null;
};

export type QrClaimNavParams = {
  petId: string;
  fromQr: true;
  qrClaim: QrClaimSuccessInput;
};

/** Id interno del backend. PetProfile y claimTag usan este valor. */
export function canonicalPetId(pet: { id?: string | null } | null | undefined): string {
  return String(pet?.id || '').trim();
}

export function qrClaimHandle(pet: { username?: string | null } | null | undefined): string {
  return String(pet?.username || '')
    .replace(/^@/, '')
    .trim();
}

export function qrClaimSuccessMessage(input: QrClaimSuccessInput): string {
  const handle = qrClaimHandle({ username: input.username });
  const page = String(input.pageLabel || '')
    .replace(/^@/, '')
    .trim();
  if (input.kind === 'existing') {
    return handle
      ? `Tu chapita fue vinculada a ${handle} correctamente.`
      : 'Tu chapita fue vinculada correctamente.';
  }
  if (input.kind === 'new_page') {
    if (handle && page) return `Tu chapita fue vinculada a ${handle} en ${page} correctamente.`;
    if (page) return `Tu mascota fue registrada en ${page} y la chapita quedó vinculada correctamente.`;
    return handle
      ? `Tu chapita fue vinculada a ${handle} correctamente.`
      : 'Tu mascota fue registrada y la chapita quedó vinculada correctamente.';
  }
  return handle
    ? `Tu chapita fue vinculada a ${handle} correctamente.`
    : 'Tu mascota fue registrada y la chapita quedó vinculada correctamente.';
}

export function petProfileAfterClaim(
  pet: { id?: string | null; username?: string | null },
  kind: QrClaimKind,
  pageLabel?: string | null
): QrClaimNavParams | null {
  const petId = canonicalPetId(pet);
  if (!petId) return null;
  return {
    petId,
    fromQr: true,
    qrClaim: {
      kind,
      username: qrClaimHandle(pet) || null,
      pageLabel: pageLabel || null,
    },
  };
}

export function qrClaimShouldShow(claim: QrClaimSuccessInput | null | undefined): boolean {
  return !!claim && (claim.kind === 'new_personal' || claim.kind === 'existing' || claim.kind === 'new_page');
}
