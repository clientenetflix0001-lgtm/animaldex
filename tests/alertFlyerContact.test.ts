import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ADOPTION_CONTACT_INVALID, ADOPTION_CONTACT_REQUIRED, parseProtectorAdoptionContact } from '../lib/adoptionContact.ts';
import { buildAlertFlyerData } from '../lib/alertFlyer.ts';
import {
  parsePersonalAlertContact,
  personalAlertContactError,
  personalAlertContactHelp,
  personalAlertContactLabel,
  shouldCollectPersonalAlertContact,
} from '../lib/alertFlyerContact.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('flyer WhatsApp perdido / encontrado / adopción', () => {
  it('1. adopción mantiene WhatsApp con el parser compartido', () => {
    const parsed = parsePersonalAlertContact('+54 9 387 555 1234', '');
    const adoption = parseProtectorAdoptionContact('protector', '+54 9 387 555 1234', '');
    assert.deepEqual(parsed, adoption);
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.whatsapp, '+5493875551234');
    assert.equal(shouldCollectPersonalAlertContact({
      type: 'adoption',
      primary: 'adoption',
      flyerMode: false,
      isProtector: false,
    }), true);
    assert.equal(personalAlertContactLabel('adoption'), 'Contacto para adopción *');
  });

  it('2. perdí a mi mascota permite WhatsApp en flyer', () => {
    assert.equal(shouldCollectPersonalAlertContact({
      type: 'lost',
      primary: 'lost',
      flyerMode: true,
      isProtector: false,
    }), true);
    assert.equal(personalAlertContactLabel('lost'), 'Contacto *');
  });

  it('3. vi o encontré una mascota permite WhatsApp en flyer', () => {
    assert.equal(shouldCollectPersonalAlertContact({
      type: null,
      primary: 'seen-or-found',
      flyerMode: true,
      isProtector: false,
    }), true);
    assert.equal(shouldCollectPersonalAlertContact({
      type: 'found',
      primary: 'seen-or-found',
      flyerMode: true,
      isProtector: false,
    }), true);
    assert.equal(shouldCollectPersonalAlertContact({
      type: 'sighting',
      primary: 'seen-or-found',
      flyerMode: true,
      isProtector: false,
    }), true);
  });

  it('4. perdido pasa el teléfono al preview', () => {
    const flyer = buildAlertFlyerData({
      type: 'lost',
      locality: 'Salta Capital',
      image: 'https://example.com/nina.jpg',
      contactWhatsapp: '+5493875551234',
    });
    assert.equal(flyer.contact, '+5493875551234');
  });

  it('5. encontrado pasa el teléfono al preview', () => {
    const flyer = buildAlertFlyerData({
      type: 'found',
      locality: 'Cerrillos',
      image: 'https://example.com/gato.jpg',
      contactWhatsapp: '+5493875551234',
    });
    assert.equal(flyer.contact, '+5493875551234');
  });

  it('6–7. perdido y encontrado muestran teléfono en el flyer final', () => {
    const canvas = read('components/AlertFlyerCanvas.tsx');
    assert.match(canvas, /flyer\.contact \?/);
    assert.match(canvas, /☎ \{flyer\.contact\}/);
    const lost = buildAlertFlyerData({
      type: 'lost',
      locality: 'Salta Capital',
      contactWhatsapp: '+5493875559999',
    });
    const found = buildAlertFlyerData({
      type: 'found',
      locality: 'Salta Capital',
      contactWhatsapp: '+5493875559999',
    });
    assert.equal(lost.contact, '+5493875559999');
    assert.equal(found.contact, '+5493875559999');
  });

  it('8. adopción no tiene regresión en flyer ni en alerta', () => {
    const flyer = buildAlertFlyerData({
      type: 'adoption',
      locality: 'Salta Capital',
      contactWhatsapp: '+5493875551234',
      contactPhone: '+5493879990000',
    });
    assert.equal(flyer.contact, '+5493875551234 · +5493879990000');
    assert.equal(shouldCollectPersonalAlertContact({
      type: 'adoption',
      primary: 'adoption',
      flyerMode: true,
      isProtector: true,
    }), false);
    assert.equal(personalAlertContactHelp('adoption'), 'Agregá al menos un WhatsApp o teléfono. No se muestra en el feed.');
  });

  it('9. campo vacío sigue el comportamiento de adopción', () => {
    const empty = parsePersonalAlertContact('', '');
    const adoptionEmpty = parseProtectorAdoptionContact('protector', '', '');
    assert.deepEqual(empty, adoptionEmpty);
    assert.equal(empty.ok, false);
    if (!empty.ok) {
      assert.equal(empty.error, ADOPTION_CONTACT_REQUIRED);
      assert.equal(personalAlertContactError(empty), ADOPTION_CONTACT_REQUIRED);
    }
  });

  it('10. la validación es compartida y no hay reglas distintas por tipo', () => {
    const wa = '+54 9 387 555 1234';
    assert.deepEqual(parsePersonalAlertContact(wa, ''), parseProtectorAdoptionContact('protector', wa, ''));
    const invalid = parsePersonalAlertContact('no-es-numero', '');
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.error, ADOPTION_CONTACT_INVALID);
    assert.equal(shouldCollectPersonalAlertContact({
      type: 'lost',
      primary: 'lost',
      flyerMode: false,
      isProtector: false,
    }), false);
    const create = read('screens/CreateAlertScreen.tsx');
    assert.match(create, /shouldCollectPersonalAlertContact/);
    assert.match(create, /parsePersonalAlertContact/);
    assert.doesNotMatch(create, /parseProtectorAdoptionContact\('protector'/);
    assert.match(create, /keyboardType="phone-pad"/);
    assert.match(create, /maxLength=\{30\}/);
    assert.match(create, /placeholder="WhatsApp"/);
    const helper = read('lib/alertFlyerContact.ts');
    assert.match(helper, /parseProtectorAdoptionContact\('protector'/);
    assert.doesNotMatch(helper, /if \(input\.type === 'lost'\)/);
  });
});
