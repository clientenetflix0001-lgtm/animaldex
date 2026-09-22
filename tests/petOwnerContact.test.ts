import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  contactSourceForPet,
  hasOwnerContactNumber,
  isPetContactVisible,
  ownerPublicIdentity,
  pageContactSource,
  parseOwnerContactFields,
  publicContactButtons,
  resolvePublicPetOwnerContact,
  telUrl,
  userContactSource,
  whatsappConversationUrl,
} from '../lib/petOwnerContact.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const petProfile = readFileSync(join(root, 'screens/PetProfileScreen.tsx'), 'utf8');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
const migration = readFileSync(join(root, 'migrations/017_pet_contact_breed_match.sql'), 'utf8');

describe('contacto público del propietario', () => {
  it('1. owner sin consentimiento → no botones', () => {
    const contact = resolvePublicPetOwnerContact(
      userContactSource({
        username: 'noelia',
        contactWhatsapp: '+5493875551111',
        contactPhone: '+5493875552222',
        petContactVisible: false,
      })
    );
    assert.deepEqual(publicContactButtons(contact), { showWhatsapp: false, showPhone: false });
    assert.equal(contact?.whatsapp, null);
    assert.equal(contact?.phone, null);
  });

  it('2. owner con WhatsApp visible → botón WA', () => {
    const contact = resolvePublicPetOwnerContact(
      userContactSource({
        username: 'noelia',
        contactWhatsapp: '3875551234',
        petContactVisible: true,
      })
    );
    assert.equal(publicContactButtons(contact).showWhatsapp, true);
    assert.equal(publicContactButtons(contact).showPhone, false);
    assert.equal(whatsappConversationUrl(contact?.whatsapp), 'https://wa.me/5493875551234');
  });

  it('3. owner con teléfono visible → botón teléfono', () => {
    const contact = resolvePublicPetOwnerContact(
      userContactSource({
        username: 'noelia',
        contactPhone: '+5493875559999',
        petContactVisible: true,
      })
    );
    assert.equal(publicContactButtons(contact).showPhone, true);
    assert.equal(telUrl(contact?.phone), 'tel:+5493875559999');
  });

  it('4. ambos → dos botones', () => {
    const contact = resolvePublicPetOwnerContact(
      userContactSource({
        username: 'noelia',
        contactWhatsapp: '+5493875551111',
        contactPhone: '+5493875552222',
        petContactVisible: true,
      })
    );
    assert.deepEqual(publicContactButtons(contact), { showWhatsapp: true, showPhone: true });
  });

  it('5. verified → check real', () => {
    const contact = resolvePublicPetOwnerContact(
      userContactSource({ username: 'noelia', verifiedPhone: '+5493875550000' })
    );
    assert.equal(contact?.verified, true);
    assert.match(petProfile, /checkmark-circle/);
    assert.match(petProfile, /realOwner\?\.verified/);
  });

  it('6. no verified → sin check', () => {
    const contact = resolvePublicPetOwnerContact(userContactSource({ username: 'noelia' }));
    assert.equal(contact?.verified, false);
  });

  it('7. página usa contacto de página', () => {
    const page = pageContactSource({
      username: 'apansalta',
      adoptionWhatsapp: '+5493875553333',
      phone: '3875554444',
      petContactVisible: true,
    });
    const contact = resolvePublicPetOwnerContact(page);
    assert.equal(contact?.kind, 'page');
    assert.equal(contact?.whatsapp, '+5493875553333');
    assert.ok(contact?.phone);
  });

  it('8. mascota personal usa contacto de user', () => {
    const source = contactSourceForPet({
      user: { username: 'noelia', contactWhatsapp: '+5493875551111', petContactVisible: true },
    });
    assert.equal(source?.kind, 'user');
    assert.equal(resolvePublicPetOwnerContact(source)?.whatsapp, '+5493875551111');
  });

  it('9. cambiar número del user se refleja sin editar mascotas', () => {
    const user = { username: 'noelia', contactWhatsapp: '+5493875550000', petContactVisible: true };
    assert.equal(resolvePublicPetOwnerContact(userContactSource(user))?.whatsapp, '+5493875550000');
    user.contactWhatsapp = '+5493875559999';
    assert.equal(resolvePublicPetOwnerContact(userContactSource(user))?.whatsapp, '+5493875559999');
    assert.match(migration, /users ADD COLUMN contact_whatsapp/);
    assert.doesNotMatch(migration, /pets ADD COLUMN contact_/);
  });

  it('10. desactivar visibilidad oculta contacto en todas sus mascotas', () => {
    const user = { username: 'noelia', contactWhatsapp: '+5493875551111', petContactVisible: true };
    assert.equal(hasOwnerContactNumber(user), true);
    user.petContactVisible = false;
    const a = resolvePublicPetOwnerContact(userContactSource(user));
    const b = resolvePublicPetOwnerContact(userContactSource(user));
    assert.equal(publicContactButtons(a).showWhatsapp, false);
    assert.equal(publicContactButtons(b).showWhatsapp, false);
    assert.equal(isPetContactVisible(0), false);
  });

  it('identidad pública es username sin @ ni nombre real', () => {
    assert.equal(ownerPublicIdentity({ username: 'noelia', name: 'Noelia Pérez' }), 'noelia');
    assert.doesNotMatch(petProfile, /Humano de \{name\}/);
    assert.doesNotMatch(petProfile, /\{ownerName\} · \{ownerUsername\}/);
    assert.match(petProfile, /stopPropagation/);
    assert.match(petProfile, /logo-whatsapp/);
  });

  it('número inválido no se acepta', () => {
    const parsed = parseOwnerContactFields('abc', '');
    assert.equal(parsed.ok, false);
  });

  it('petProfile resuelve contacto en el mismo request, no N+1', () => {
    const start = worker.indexOf("if (action === 'petProfile')");
    const block = worker.slice(start, start + 2200);
    assert.match(block, /ownerContact/);
    assert.match(block, /resolvePublicPetOwnerContact/);
    assert.doesNotMatch(worker, /action === 'feed'[\s\S]{0,800}contact_whatsapp/);
  });
});
