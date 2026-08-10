// ============================================================
// Animaldex — Chapitas QR (links de invitación para registrar mascotas)
// ============================================================
// El administrador (lucasfuentes) genera links con esta forma:
//   https://TU-DOMINIO.com?qr=31
// Ese link se convierte en un código QR e se imprime en una chapita física.
//
// IMPORTANTE: cambia APP_WEB_ORIGIN por tu dominio real cuando lo tengas
// (por ejemplo "https://misitioweb.com"). Es el único lugar que hay que
// editar — todo el resto de la app (generación de links, QR, escaneo,
// deep links) usa esta constante.
export const APP_WEB_ORIGIN = 'https://misitioweb.com';

export function buildTagUrl(code: number): string {
  return `${APP_WEB_ORIGIN}?qr=${code}`;
}

// Extrae el código numérico `?qr=` de cualquier URL (sin importar el
// dominio real desde el que se abrió: útil tanto si el usuario ya
// configuró su dominio final, como si todavía usa el de Vercel/preview).
export function extractTagCode(url: string | null | undefined): number | null {
  if (!url) return null;
  const m = url.match(/[?&]qr=(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) ? n : null;
}

// URL de una imagen QR generada al vuelo (sin dependencias nativas):
// funciona igual en web, iOS y Android porque es solo una <Image>.
export function qrImageUrl(data: string, size = 280): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
}
