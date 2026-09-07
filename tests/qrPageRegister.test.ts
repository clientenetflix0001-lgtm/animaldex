import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CREATE_PROTECTOR_PAGE_LABEL,
  NO_PROTECTOR_PAGE_MESSAGE,
  PAGE_REGISTER_IN_LABEL,
  PAGE_REGISTER_PICK_TITLE,
  PAGE_TYPE_VISIBLE_LABEL,
  REGISTER_MY_PET_LABEL,
  REGISTER_ON_PAGE_LABEL,
  addPetParamsForPageQr,
  addPetParamsForPersonalQr,
  pageRegisterAllowsBusiness,
  protectorPagesForQr,
  qrPageRegisterView,
  qrRegisterKeepsTag,
} from '../lib/qrPageRegister.ts';
import { extractTagCode } from '../lib/tags.ts';
import { resolveScannedValue } from '../lib/qr.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const welcome = readFileSync(join(root, 'screens/TagWelcomeScreen.tsx'), 'utf8');
const createSheet = readFileSync(join(root, 'features/profiles/CreateProfileSheet.tsx'), 'utf8');
const addPet = readFileSync(join(root, 'screens/AddPetScreen.tsx'), 'utf8');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
const types = readFileSync(join(root, 'lib/types.ts'), 'utf8');

const personal = { id: 'pr-me', type: 'personal', name: 'Lucas', username: 'lucasfuentes' };
const shop = { id: 'pr-shop', type: 'business', name: 'Tienda Rocky', username: 'tiendarocky' };
const apan = { id: 'pr-apan', type: 'protector', name: 'APAN Salta', username: 'apansalta' };
const patitas = { id: 'pr-pat', type: 'protector', name: 'Patitas Salta', username: 'patitassalta' };

describe('QR registrar mascota en Bienestar Animal', () => {
  it('1. Registrar a mi mascota sigue funcionando igual', () => {
    assert.equal(REGISTER_MY_PET_LABEL, 'Registrar mi mascota');
    assert.match(welcome, /Registrar mi mascota/);
    assert.deepEqual(addPetParamsForPersonalQr('AAA123'), { tagCode: 'AAA123' });
    assert.match(welcome, /replace\('AddPet', addPetParamsForPersonalQr\(code\)\)/);
    assert.match(addPet, /tagCode = route\.params\?\.tagCode/);
  });

  it('2. aparece Registrar esta mascota en tu página', () => {
    assert.equal(REGISTER_ON_PAGE_LABEL, 'Registrar esta mascota en tu página');
    assert.match(welcome, /Registrar esta mascota en tu página/);
    assert.match(welcome, /openPageRegister/);
  });

  it('3. una Página Bienestar → seleccionable', () => {
    const pages = protectorPagesForQr([personal, shop, apan]);
    assert.deepEqual(pages.map((p) => p.id), ['pr-apan']);
    assert.equal(qrPageRegisterView(pages), 'single');
    assert.match(welcome, /Registrar en:/);
    assert.match(welcome, /Continuar/);
    assert.equal(PAGE_REGISTER_IN_LABEL, 'Registrar en:');
    assert.equal(PAGE_TYPE_VISIBLE_LABEL, 'Bienestar Animal');
  });

  it('4. varias páginas → selector', () => {
    const pages = protectorPagesForQr([apan, patitas, shop]);
    assert.equal(pages.length, 2);
    assert.equal(qrPageRegisterView(pages), 'many');
    assert.equal(PAGE_REGISTER_PICK_TITLE, '¿En qué página querés registrar esta mascota?');
    assert.match(welcome, /¿En qué página querés registrar esta mascota\?/);
  });

  it('5. empresa NO aparece como destino', () => {
    const pages = protectorPagesForQr([shop, personal]);
    assert.equal(pages.length, 0);
    assert.equal(pageRegisterAllowsBusiness('business'), false);
    assert.equal(pageRegisterAllowsBusiness('protector'), true);
    assert.match(welcome, /profile\.type !== 'protector'/);
    assert.match(worker, /owned\[0\]\.type !== 'protector'/);
  });

  it('6. cero páginas → crear Bienestar Animal', () => {
    assert.equal(qrPageRegisterView([]), 'need-create');
    assert.equal(NO_PROTECTOR_PAGE_MESSAGE.includes('Página de Bienestar Animal'), true);
    assert.match(welcome, /Para registrar mascotas en una página primero necesitás crear una/);
    assert.equal(CREATE_PROTECTOR_PAGE_LABEL, 'Crear Bienestar Animal');
    assert.match(welcome, /Crear Bienestar Animal/);
  });

  it('7. creación usa flujo existente', () => {
    assert.match(welcome, /<CreateProfileSheet/);
    assert.match(welcome, /initialType="protector"/);
    assert.match(createSheet, /Nueva página de Bienestar Animal/);
    assert.match(createSheet, /¿Qué página quieres crear\?/);
    assert.match(createSheet, /onCreated\?\.\(created\)/);
  });

  it('8. después de crear conserva QR', () => {
    const params = addPetParamsForPageQr('AAA123', 'pr-apan');
    assert.equal(qrRegisterKeepsTag('AAA123', params), true);
    assert.equal(params.tagCode, 'AAA123');
    assert.match(welcome, /addPetParamsForPageQr\(code, page\.id\)/);
    assert.match(welcome, /const \{ code \} = route\.params/);
    assert.doesNotMatch(welcome, /setPendingTagCode|QRScanner/);
  });

  it('9. vuelve al registro automáticamente', () => {
    assert.match(welcome, /onCreated=\{onPageCreated\}/);
    assert.match(welcome, /setPageView\('single'\)/);
    assert.match(welcome, /setSelectedPage\(profile\)/);
    assert.doesNotMatch(welcome, /navigate\('QRScanner'\)/);
  });

  it('10. profile_id correcto', () => {
    assert.deepEqual(addPetParamsForPageQr('17', 'pr-apan'), { tagCode: '17', profileId: 'pr-apan' });
    assert.match(addPet, /routeProfileId \|\| \(activeProfile\?\.type === 'protector'/);
    assert.match(addPet, /profileId: isProtectorPet \? profileId : null/);
    assert.match(types, /AddPet: \{ tagCode\?: string; petId\?: string; profileId\?: string \}/);
    assert.match(worker, /profile_id, care_status/);
  });

  it('11. QR legacy numérico intacto', () => {
    assert.equal(extractTagCode('https://animaldex-web.pages.dev/?qr=17'), '17');
    assert.deepEqual(addPetParamsForPersonalQr('17'), { tagCode: '17' });
    assert.equal(resolveScannedValue('https://animaldex-web.pages.dev/?qr=17').kind, 'tag');
  });

  it('12. QR alfanumérico intacto', () => {
    assert.equal(extractTagCode('https://animaldex-web.pages.dev?qr=AAA123'), 'AAA123');
    assert.equal(extractTagCode('https://animaldex-web.pages.dev?qr=345SDF'), '345SDF');
    assert.deepEqual(addPetParamsForPageQr('345SDF', 'pr-apan').tagCode, '345SDF');
  });
});
