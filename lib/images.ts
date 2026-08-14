// ============================================================
// Conversor / optimizador de imágenes
// ============================================================

export const IMAGE_CDN: 'cloudflare' | 'weserv' = 'weserv';

export function convertImage(
  url: string,
  width = 600,
  quality = 75,
  mode: 'cover' | 'contain' = 'cover'
): string {
  if (
    !url ||
    url.startsWith('data:') ||
    url.startsWith('file:') ||
    url.startsWith('blob:') ||
    url.includes('images.weserv.nl') ||
    url.includes('/cdn-cgi/image/')
  ) {
    return url;
  }

  const cfMatch = url.match(/^(https:\/\/imagedelivery\.net\/[^/]+\/[^/]+)\/.*$/);
  if (cfMatch) {
    if (mode === 'contain') {
      return `${cfMatch[1]}/w=${width},fit=scale-down,q=${quality}`;
    }
    return `${cfMatch[1]}/w=${width},h=${width},fit=cover,q=${quality}`;
  }

  if ((IMAGE_CDN as string) === 'cloudflare') {
    const fit = mode === 'contain' ? 'scale-down' : 'cover';
    return `/cdn-cgi/image/width=${width},quality=${quality},format=auto,fit=${fit}/${url}`;
  }

  const clean = url.replace(/^https?:\/\//, '');
  if (mode === 'contain') {
    return `https://images.weserv.nl/?url=${encodeURIComponent(clean)}&w=${width}&fit=inside&output=webp&q=${quality}`;
  }
  return `https://images.weserv.nl/?url=${encodeURIComponent(clean)}&w=${width}&h=${width}&fit=cover&output=webp&q=${quality}`;
}

export const thumb = (url: string, w = 300) => convertImage(url, w, 70, 'cover');
export const large = (url: string) => convertImage(url, 1080, 82, 'contain');

export const petFallbackAvatar = (seed: string) =>
  `https://api.dicebear.com/9.x/shapes/png?seed=${encodeURIComponent(seed)}&size=200`;

export const userFallbackAvatar = (seed: string) =>
  `https://api.dicebear.com/9.x/initials/png?seed=${encodeURIComponent(seed)}&size=200&backgroundColor=FF6B4A`;
