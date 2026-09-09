import { Platform, Share, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { FLYER_EXPORT_HEIGHT, FLYER_EXPORT_WIDTH, type AlertFlyer } from './alertFlyer.ts';
import { shareAlertFlyer } from './share.ts';

export async function shareFlyerCanvas(
  view: View | null,
  flyer: AlertFlyer,
  alertId?: string
): Promise<void> {
  if (!view) {
    await shareAlertFlyer(flyer, alertId);
    return;
  }
  try {
    const uri = await captureRef(view, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
      width: FLYER_EXPORT_WIDTH,
      height: FLYER_EXPORT_HEIGHT,
    });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: flyer.petName ? `${flyer.headline} · ${flyer.petName}` : flyer.headline,
        UTI: 'public.png',
      });
      return;
    }
    if (Platform.OS !== 'web') {
      await Share.share({ url: uri, title: flyer.headline, message: flyer.cta });
      return;
    }
  } catch {
    // Captura nativa no disponible (web o binario sin view-shot): texto + foto.
  }
  await shareAlertFlyer(flyer, alertId);
}
