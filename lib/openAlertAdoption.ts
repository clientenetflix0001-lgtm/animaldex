import { Alert, Linking } from 'react-native';
import { db, type ApiAlert } from './db';
import { ADOPTION_CONTACT_MISSING, adoptCtaLabel, resolveAdoptionOpenAction } from './adoptionContact';
import { alertShareUrl } from './share';

export async function openAlertAdoption(alert: ApiAlert): Promise<void> {
  const cta = adoptCtaLabel(alert.sex);
  try {
    const res = await db.alertAdoptionContact(alert.id);
    const action = resolveAdoptionOpenAction({
      expectedShelterProfileId: res.shelterProfileId || alert.authorProfileId,
      shelterProfileId: res.shelterProfileId,
      whatsapp: res.adoptionWhatsapp,
      phone: res.adoptionPhone,
      petName: res.petName || alert.petName || 'esta mascota',
      inquiryUrl: alertShareUrl(alert.id),
    });
    if (action.kind === 'none') {
      Alert.alert(cta, action.message);
      return;
    }
    try {
      await Linking.openURL(action.url);
    } catch {
      Alert.alert(cta, 'No se pudo abrir el contacto. Probá de nuevo más tarde.');
    }
  } catch {
    Alert.alert(cta, ADOPTION_CONTACT_MISSING);
  }
}
