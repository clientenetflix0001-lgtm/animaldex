// Aviso de una sola vez para refrescar el muro sin recargar el navegador.
// «mine»: el usuario salió de Mis publicaciones.
// «created»: publicó y eligió Ver publicación.
// Volver de un detalle normal no deja marca.

export type AdoptionWallRefreshReason = 'mine' | 'created';

let pending: { city: string; reason: AdoptionWallRefreshReason } | null = null;

export function markAdoptionWallRefresh(city: string, reason: AdoptionWallRefreshReason): void {
  if (pending?.reason === 'created' && reason !== 'created') return;
  pending = { city, reason };
}

export function consumeAdoptionWallRefresh(city: string): AdoptionWallRefreshReason | null {
  if (!pending || pending.city !== city) return null;
  const reason = pending.reason;
  pending = null;
  return reason;
}
