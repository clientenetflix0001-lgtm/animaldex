// ============================================================
// Animaldex — Reels de TikTok (validación + embed)
// ============================================================
// Etapa 1: NO se descarga ni se aloja ningún video. Solo se valida
// el enlace y se muestra el reproductor oficial embebido de TikTok.
// La validación real (existencia del video, metadata) se hace en el
// servidor vía el oEmbed oficial de TikTok (ver worker/index.js);
// aquí solo hacemos una verificación rápida del lado del cliente
// para dar feedback inmediato antes de llamar a la API.

const TIKTOK_HOST_RE = /(^|\.)tiktok\.com$/i;

export function isLikelyTikTokUrl(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  try {
    const u = new URL(text);
    return TIKTOK_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

// URL del reproductor oficial embebido de TikTok (usada tanto en
// web como en el WebView nativo). Es el mismo iframe que TikTok
// entrega dentro del <blockquote> de su oEmbed.
export function tiktokEmbedUrl(videoId: string): string {
  return `https://www.tiktok.com/embed/v2/${videoId}`;
}

export function tiktokVideoUrl(creatorUsername: string | null, videoId: string | null): string | null {
  if (!creatorUsername || !videoId) return null;
  return `https://www.tiktok.com/@${creatorUsername}/video/${videoId}`;
}
