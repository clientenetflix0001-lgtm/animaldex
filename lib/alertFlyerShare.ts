import { Platform, Share, type View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { FLYER_EXPORT_HEIGHT, FLYER_EXPORT_WIDTH, type AlertFlyer } from './alertFlyer.ts';
import {
  FLYER_FALLBACK_HEIGHT,
  FLYER_FALLBACK_WIDTH,
  FLYER_JPEG_QUALITIES,
  FLYER_SHARE_MIME,
  FLYER_SHARE_UTI,
  flyerJpegQualityForAttempt,
  flyerShareSize,
  pickSmallerFlyer,
  shouldFallbackFlyerResolution,
  shouldRetryFlyerCompress,
  type FlyerCompressAttempt,
} from './alertFlyerOptimize.ts';
import { shareAlertFlyer } from './share.ts';

async function flyerFileBytes(uri: string): Promise<number> {
  try {
    const { File } = await import('expo-file-system');
    const size = new File(uri).size;
    if (typeof size === 'number' && size > 0) return size;
  } catch {
    // Sin módulo nativo o URI no local: no forzar más pases.
  }
  try {
    const FileSystem = await import('expo-file-system/legacy');
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && 'size' in info && typeof info.size === 'number' && info.size > 0) {
      return info.size;
    }
  } catch {
    // Igual: compartir el JPEG ya generado.
  }
  return 0;
}

async function deleteFlyerTemp(uri?: string): Promise<void> {
  if (!uri) return;
  try {
    const { File } = await import('expo-file-system');
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    try {
      const FileSystem = await import('expo-file-system/legacy');
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      // Temporal: no bloquear el share.
    }
  }
}

async function captureFlyerSource(view: View): Promise<string> {
  const { captureRef } = await import('react-native-view-shot');
  return captureRef(view, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
    width: FLYER_EXPORT_WIDTH,
    height: FLYER_EXPORT_HEIGHT,
  });
}

async function captureFlyerJpeg(view: View, quality: number): Promise<string> {
  const { captureRef } = await import('react-native-view-shot');
  return captureRef(view, {
    format: 'jpg',
    quality,
    result: 'tmpfile',
    width: FLYER_EXPORT_WIDTH,
    height: FLYER_EXPORT_HEIGHT,
  });
}

async function compressFlyerJpeg(
  uri: string,
  quality: number,
  width: number,
  height: number
): Promise<{ uri: string; width: number; height: number }> {
  const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
  const size = flyerShareSize(width, height, width, height);
  const context = ImageManipulator.manipulate(uri);
  context.resize(size);
  const rendered = await context.renderAsync();
  return rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: quality,
  });
}

async function compressAtSize(
  sourceUri: string,
  temps: string[],
  width: number,
  height: number
): Promise<FlyerCompressAttempt> {
  let best: FlyerCompressAttempt | null = null;
  for (let attempt = 0; attempt < FLYER_JPEG_QUALITIES.length; attempt++) {
    const quality = flyerJpegQualityForAttempt(attempt);
    const result = await compressFlyerJpeg(sourceUri, quality, width, height);
    temps.push(result.uri);
    const bytes = await flyerFileBytes(result.uri);
    best = pickSmallerFlyer(best, { uri: result.uri, bytes, quality });
    if (!bytes || !shouldRetryFlyerCompress(bytes, attempt)) break;
  }
  if (!best) throw new Error('No se pudo comprimir el flyer');
  return best;
}

async function optimizeCapturedFlyer(sourceUri: string, temps: string[]): Promise<FlyerCompressAttempt> {
  const best = await compressAtSize(sourceUri, temps, FLYER_EXPORT_WIDTH, FLYER_EXPORT_HEIGHT);
  if (!shouldFallbackFlyerResolution(best.bytes)) return best;
  const fallback = await compressAtSize(sourceUri, temps, FLYER_FALLBACK_WIDTH, FLYER_FALLBACK_HEIGHT);
  return pickSmallerFlyer(best, fallback);
}

async function optimizeByRecapture(view: View, temps: string[]): Promise<FlyerCompressAttempt> {
  let best: FlyerCompressAttempt | null = null;
  for (let attempt = 0; attempt < FLYER_JPEG_QUALITIES.length; attempt++) {
    const quality = flyerJpegQualityForAttempt(attempt);
    const uri = await captureFlyerJpeg(view, quality);
    temps.push(uri);
    const bytes = await flyerFileBytes(uri);
    best = pickSmallerFlyer(best, { uri, bytes, quality });
    if (!bytes || !shouldRetryFlyerCompress(bytes, attempt)) break;
  }
  if (!best) throw new Error('No se pudo capturar el flyer');
  if (!shouldFallbackFlyerResolution(best.bytes)) return best;
  const fallback = await compressAtSize(best.uri, temps, FLYER_FALLBACK_WIDTH, FLYER_FALLBACK_HEIGHT);
  return pickSmallerFlyer(best, fallback);
}

async function shareOptimizedJpeg(uri: string, flyer: AlertFlyer): Promise<void> {
  const title = flyer.petName ? `${flyer.headline} · ${flyer.petName}` : flyer.headline;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: FLYER_SHARE_MIME,
      dialogTitle: title,
      UTI: FLYER_SHARE_UTI,
    });
    return;
  }
  if (Platform.OS !== 'web') {
    await Share.share({ url: uri, title, message: flyer.cta });
  }
}

export async function shareFlyerCanvas(
  view: View | null,
  flyer: AlertFlyer,
  alertId?: string
): Promise<void> {
  if (!view) {
    await shareAlertFlyer(flyer, alertId);
    return;
  }

  const temps: string[] = [];
  let sharedUri: string | undefined;
  try {
    const sourceUri = await captureFlyerSource(view);
    temps.push(sourceUri);

    let optimized: FlyerCompressAttempt;
    try {
      optimized = await optimizeCapturedFlyer(sourceUri, temps);
    } catch {
      optimized = await optimizeByRecapture(view, temps);
    }

    sharedUri = optimized.uri;
    await shareOptimizedJpeg(sharedUri, flyer);
  } catch {
    await shareAlertFlyer(flyer, alertId);
  } finally {
    await Promise.all(temps.filter((uri) => uri !== sharedUri).map((uri) => deleteFlyerTemp(uri)));
    if (sharedUri) {
      setTimeout(() => {
        void deleteFlyerTemp(sharedUri);
      }, 45_000);
    }
  }
}
