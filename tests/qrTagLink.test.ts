import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  guestTagWelcomeHome,
  publicTagTargetFromStatus,
} from '../lib/tagPublicResolve.ts';
import {
  QR_LINK_EXISTING_PET_LABEL,
  QR_REGISTER_NEW_PET_LABEL,
  QR_REGISTER_PAGE_PET_LABEL,
  existingPetsForQr,
  qrNeedsContactStep,
  qrPageOptionVisible,
  qrWelcomeChoices,
} from '../lib/qrTagLink.ts';
import { addPetParamsForPersonalQr } from '../lib/qrPageRegister.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const welcome = readFileSync(join(root, 'screens/TagWelcomeScreen.tsx'), 'utf8');
const app = readFileSync(join(root, 'App.tsx'), 'utf8');
const linking = readFileSync(join(root, 'lib/webLinking.ts'), 'utf8');

describe('QR: claimed / unclaimed / invalid sin regresión', () => {
  it('11. claimed guest sigue abriendo PetProfile', () => {
    const target = publicTagTargetFromStatus('6544FF', { exists: true, status: 'claimed', pet: { id: 'pet-1' } });
    assert.deepEqual(target, { kind: 'pet', petId: 'pet-1' });
    assert.match(welcome, /navigation\.replace\('PetProfile'/);
    assert.match(app, /name="TagWelcome"/);
  });

  it('12. unclaimed sigue Auth/claim', () => {
    const target = publicTagTargetFromStatus('AAA123', { exists: true, status: 'unclaimed' });
    assert.equal(target.kind, 'claim');
    assert.equal(guestTagWelcomeHome(false), 'Auth');
    assert.match(welcome, /setPendingTagCode\(code\)/);
    assert.match(welcome, /navigation\.replace\('Auth'/);
  });

  it('13. invalid sigue estado controlado', () => {
    const target = publicTagTargetFromStatus('ZZZ', { exists: false });
    assert.equal(target.kind, 'unavailable');
    assert.match(welcome, /TAG_UNAVAILABLE_TITLE/);
    assert.doesNotMatch(welcome, /replace\('Tabs'\)/);
  });

  it('38. QR público no regresa a Auth para claimed', () => {
    assert.match(linking, /TagWelcome/);
    assert.doesNotMatch(readFileSync(join(root, 'lib/webLinking.ts'), 'utf8'), /qr[\s\S]{0,80}Auth/);
  });
});

describe('QR: tres opciones de vinculación', () => {
  it('14. flujo ofrece las 3 opciones correctas', () => {
    assert.deepEqual(qrWelcomeChoices([{ type: 'protector' }]), ['new_personal', 'existing', 'new_page']);
    assert.equal(QR_REGISTER_NEW_PET_LABEL, 'Registrar una mascota nueva');
    assert.equal(QR_LINK_EXISTING_PET_LABEL, 'Vincular a una mascota existente');
    assert.equal(QR_REGISTER_PAGE_PET_LABEL, 'Registrar una mascota en mi página');
    assert.match(welcome, /QR_REGISTER_NEW_PET_LABEL/);
    assert.match(welcome, /QR_LINK_EXISTING_PET_LABEL/);
  });

  it('15. opción página solo aparece si administra página', () => {
    assert.equal(qrPageOptionVisible([{ type: 'business' }, { type: 'personal' }]), false);
    assert.equal(qrPageOptionVisible([{ type: 'protector' }]), true);
    assert.deepEqual(qrWelcomeChoices([]), ['new_personal', 'existing']);
    assert.match(welcome, /qrPageOptionVisible\(profiles\)/);
  });

  it('16. vincular existente conserva claimTag', () => {
    assert.deepEqual(addPetParamsForPersonalQr('AAA123'), { tagCode: 'AAA123' });
    assert.deepEqual(existingPetsForQr([{ id: 'a' }, { id: 'b', archivedAt: 1 }]).map((p) => p.id), ['a']);
    assert.match(welcome, /db\.claimTag\(code, petId\)/);
    assert.equal(qrNeedsContactStep({ contactWhatsapp: null, contactPhone: null }), true);
    assert.equal(qrNeedsContactStep({ contactWhatsapp: '+5493875551111' }), false);
  });
});
