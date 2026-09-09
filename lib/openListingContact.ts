import { Alert, Linking } from 'react-native';
import { db } from './db';
import {
  LISTING_CONTACT_MISSING,
  resolveListingContactAction,
} from './listingContact';

export async function openListingContact(input: {
  listingId: string;
  title: string;
}): Promise<void> {
  try {
    const res = await db.listingContact(input.listingId);
    const action = resolveListingContactAction({
      method: res.contactMethod,
      value: res.contactValue,
      fallbackPhone: res.fallbackPhone,
      title: input.title,
    });
    if (action.kind === 'none') {
      Alert.alert('Contactar', action.message);
      return;
    }
    try {
      await Linking.openURL(action.url);
    } catch {
      Alert.alert('Contactar', 'No se pudo abrir el contacto. Probá de nuevo más tarde.');
    }
  } catch {
    Alert.alert('Contactar', LISTING_CONTACT_MISSING);
  }
}
