/** Prompt de mascota perdida al abrir una chapita ?qr= (no /pet/:id ni /.pet). */

export function isLostCareStatus(status: string | null | undefined): boolean {
  return status === 'perdido';
}

export function qrTagShouldPromptLost(res: {
  exists?: boolean;
  status?: string | null;
  pet?: { careStatus?: string | null } | null;
}): boolean {
  return !!(res.exists && res.status === 'claimed' && res.pet && isLostCareStatus(res.pet.careStatus));
}

export function shouldShowQrLostPrompt(input: {
  fromQr?: boolean | null;
  careStatus?: string | null;
  isOwner?: boolean | null;
  loading?: boolean;
}): boolean {
  if (input.loading) return false;
  if (!input.fromQr) return false;
  if (input.isOwner) return false;
  return isLostCareStatus(input.careStatus);
}

export function qrLostPetTitle(): string {
  return '¡Qué gran trabajo!';
}

export function qrLostPetMessage(name?: string | null): string {
  const n = String(name || '').trim();
  if (n) return `${n} está perdido y su familia lo busca.`;
  return 'Esta mascota está perdida y su familia la está buscando.';
}

export function qrLostPetQuestion(): string {
  return '¿Querés enviar tu ubicación para ayudar a encontrarlo?';
}
