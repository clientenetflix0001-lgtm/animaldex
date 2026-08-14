import { Platform, Share } from 'react-native';
import { Post, PETS, hashStr, makePost } from './data';

// ---------- Base64 URL-safe (UTF-8) ----------
const B64C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toUtf8(str: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const c2 = str.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) {
        c = (c - 0xd800) * 0x400 + (c2 - 0xdc00) + 0x10000;
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000)
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 63),
        0x80 | ((c >> 6) & 63),
        0x80 | (c & 63)
      );
  }
  return out;
}

function fromUtf8(bytes: number[]): string {
  let s = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    let cp: number;
    if (b < 0x80) {
      cp = b;
      i += 1;
    } else if (b < 0xe0) {
      cp = ((b & 31) << 6) | (bytes[i + 1] & 63);
      i += 2;
    } else if (b < 0xf0) {
      cp = ((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63);
      i += 3;
    } else {
      cp =
        ((b & 7) << 18) |
        ((bytes[i + 1] & 63) << 12) |
        ((bytes[i + 2] & 63) << 6) |
        (bytes[i + 3] & 63);
      i += 4;
    }
    if (cp > 0xffff) {
      cp -= 0x10000;
      s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else s += String.fromCharCode(cp);
  }
  return s;
}

export function b64encode(str: string): string {
  const bytes = toUtf8(str);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64C[b0 >> 2];
    out += B64C[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += B64C[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += B64C[b2 & 63];
  }
  return out;
}

export function b64decode(s: string): string {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of s) {
    const v = B64C.indexOf(ch);
    if (v < 0) continue;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  return fromUtf8(bytes);
}

// ---------- Post <-> URL ----------
// Los posts generados son deterministas: se pueden reconstruir desde su ID.
// Los posts creados por el usuario (mine-*) viajan codificados en el parámetro "d".

export function encodePostData(post: Post): string {
  // Las imágenes data: son demasiado grandes para viajar en la URL
  const image = post.image.startsWith('data:')
    ? 'https://placedog.net/600/600?id=12'
    : post.image;
  return b64encode(
    JSON.stringify({ id: post.id, petId: post.petId, image, caption: post.caption })
  );
}

export function decodePostData(d: string): Post | null {
  try {
    const o = JSON.parse(b64decode(d));
    if (!o || !o.petId || !o.image) return null;
    if (!PETS.some((p) => p.id === o.petId)) return null;
    return {
      id: o.id ?? `shared-${o.petId}`,
      petId: o.petId,
      image: o.image,
      caption: o.caption ?? '',
      likes: 0,
      minutesAgo: 0,
      comments: [],
    };
  } catch {
    return null;
  }
}

export function resolvePost(postId?: string, d?: string): Post | null {
  if (d) {
    const fromData = decodePostData(d);
    if (fromData) return fromData;
  }
  if (!postId) return null;
  let m = postId.match(/^feed-(\d+)$/);
  if (m) return makePost(postId, Number(m[1]));
  m = postId.match(/^explore-(\d+)$/);
  if (m) return makePost(postId, Number(m[1]) + 50000);
  m = postId.match(/^pet-(p\d+)-(\d+)$/);
  if (m) {
    const pet = PETS.find((p) => p.id === m![1]);
    if (!pet) return null;
    const base = hashStr(pet.id) % 10000;
    return makePost(postId, base + Number(m[2]) * 17, pet);
  }
  return null;
}

/** Parámetros de navegación para abrir un post (genera URL /p/<id> en web). */
export function postNavParams(post: Post): { postId: string; d?: string } {
  return post.id.startsWith('mine-') || post.id.startsWith('shared-')
    ? { postId: post.id, d: encodePostData(post) }
    : { postId: post.id };
}

// En web siempre se usa el dominio real donde est\u00e1 publicada la app
// (funciona autom\u00e1ticamente con tu dominio propio cuando lo conectes).
// FALLBACK_ORIGIN solo aplica en la app nativa (iOS/Android): es el
// dominio que se usa al generar links para compartir desde el celular.
const FALLBACK_ORIGIN = 'https://animaldex-web.pages.dev';

export function siteOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin?.startsWith('http')) {
    return window.location.origin;
  }
  return FALLBACK_ORIGIN;
}

export function postShareUrl(post: Post): string {
  const params = postNavParams(post);
  const query = params.d ? `?d=${params.d}` : '';
  return `${siteOrigin()}/p/${params.postId}${query}`;
}

export async function sharePetProfile(petId: string, handle?: string | null): Promise<void> {
  const demoPet = PETS.find((p) => p.id === petId);
  const slug = (handle || demoPet?.name || petId).toString().toLowerCase();
  const url = `${siteOrigin()}/pet/${encodeURIComponent(slug)}`;
  const title = demoPet
    ? `${demoPet.name} ${demoPet.emoji} en Animaldex`
    : 'Una mascota adorable en Animaldex 🐾';
  await shareLink(title, demoPet?.bio ?? 'Conoce a esta mascota en Animaldex', url);
}

export async function sharePost(post: Post): Promise<void> {
  const demoPet = PETS.find((p) => p.id === post.petId);
  const name = post.petName ?? demoPet?.name ?? 'Una mascota';
  const emoji = post.petEmoji ?? demoPet?.emoji ?? '🐾';
  const url = postShareUrl(post);
  const title = `${name} ${emoji} en Animaldex`;
  await shareLink(title, post.caption, url);
}

// ---------- Alertas (perdidos/encontrados): compartir con apps nativas ----------
// NO crea una publicación/republicación interna: solo abre el share sheet
// del sistema (WhatsApp, Estado de WhatsApp, Facebook, Instagram, copiar
// enlace, etc.) con un link directo a la alerta dentro de Animaldex.
import type { ApiAlert, ApiListing } from './db';

export function alertShareUrl(alertId: string): string {
  return `${siteOrigin()}/a/${alertId}`;
}

export async function shareAlert(alert: ApiAlert): Promise<void> {
  const typeLabel = alert.type === 'found' ? 'ENCONTRADO' : 'PERDIDO';
  const name = alert.petName ? ` ${alert.petName}` : '';
  const title = `🚨 ${typeLabel}${name} · Animaldex`;
  const text = `${alert.description}\n📍 ${alert.locality}`;
  const url = alertShareUrl(alert.id);
  await shareLink(title, text, url);
}

// ---------- Mercado: compartir una publicación (producto/servicio) ----------
export function listingShareUrl(listingId: string): string {
  return `${siteOrigin()}/m/${listingId}`;
}

export async function shareListing(listing: ApiListing): Promise<void> {
  const title = `${listing.kind === 'service' ? '🛠️' : '🛍️'} ${listing.title} · Mercado Animaldex`;
  const text = `${listing.description}\n🐾 ${listing.pricePatitas.toLocaleString('es-AR')} Patitas · 📍 ${listing.locality}`;
  const url = listingShareUrl(listing.id);
  await shareLink(title, text, url);
}

async function shareLink(title: string, text: string, url: string): Promise<void> {
  if (Platform.OS === 'web') {
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    if (nav?.share) {
      try {
        await nav.share({ title, text, url });
        return;
      } catch {
        // usuario canceló o no soportado → fallback
      }
    }
    if (nav?.clipboard?.writeText) {
      try {
        await nav.clipboard.writeText(url);
        if (typeof window !== 'undefined') {
          window.alert(`¡Enlace copiado! 🐾\n${url}`);
        }
        return;
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.prompt('Copia el enlace para compartir:', url);
    }
  } else {
    try {
      await Share.share({ message: `${text}\n${url}`, url, title });
    } catch {}
  }
}
