import { uploadImage } from './api.ts';
import { db } from './db.ts';

export function isRemoteAlertImage(uri?: string | null): boolean {
  return /^https?:\/\//i.test(String(uri || '').trim());
}

/** Sube a CDN + registerImage solo al publicar la alerta, no al generar el flyer. */
export async function ensureAlertImageUploaded(uri: string): Promise<string> {
  const image = String(uri || '').trim();
  if (!image) throw new Error('Falta la foto');
  if (isRemoteAlertImage(image)) return image;
  if (!image.startsWith('data:')) {
    throw new Error('No se pudo leer la imagen');
  }
  const up = await uploadImage(image);
  if (!up.url || up.url.startsWith('data:')) {
    throw new Error('No se pudo subir la imagen');
  }
  db.registerImage(up.url, undefined, 'alert').catch(() => {});
  return up.url;
}
