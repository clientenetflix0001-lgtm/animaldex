/**
 * Reproducción de Reels en navegadores.
 *
 * Android/iOS usan expo-video + HLS nativo. En web, expo-video pone el
 * .m3u8 en un <video src> y Chrome/Firefox/Android Web no lo decodifican:
 * loadeddata nunca llega y el spinner queda infinito.
 *
 * Motor: HLS nativo (Safari/iOS) o hls.js. Autoplay con sonido se reintenta
 * silenciado si el navegador lo bloquea.
 */

export const WEB_REEL_FIRST_FRAME_TIMEOUT_MS = 12000;

export type WebHlsEngine = 'native' | 'hls.js' | 'none';

export function webHlsEngine(
  canPlayType: ((type: string) => string) | null | undefined,
  hlsSupported: boolean
): WebHlsEngine {
  const native =
    !!canPlayType &&
    (canPlayType('application/vnd.apple.mpegurl') !== '' || canPlayType('application/x-mpegURL') !== '');
  if (native) return 'native';
  if (hlsSupported) return 'hls.js';
  return 'none';
}

export function interpretPlayRejection(err: unknown): 'retry-muted' | 'fail' | 'ignore' {
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name?: string }).name) : '';
  const msg = err instanceof Error ? err.message : String(err || '');
  if (name === 'AbortError' || /interrupted by a call to pause/i.test(msg)) return 'ignore';
  if (name === 'NotAllowedError' || /not allowed|user didn't interact|play\(\) request was interrupted/i.test(msg)) {
    return 'retry-muted';
  }
  return 'fail';
}

export function webReelVideoProps(input: { muted: boolean; loop?: boolean }) {
  return {
    muted: !!input.muted,
    loop: input.loop !== false,
    playsInline: true,
    controls: false,
    preload: 'auto' as const,
    crossOrigin: 'anonymous' as const,
  };
}
