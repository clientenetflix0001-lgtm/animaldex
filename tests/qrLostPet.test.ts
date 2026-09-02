import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveScannedValue } from '../lib/qr.ts';
import { extractTagCode } from '../lib/tags.ts';
import { resolveAppLink } from '../lib/appLinks.ts';
import {
  isLostCareStatus,
  qrLostPetMessage,
  qrLostPetQuestion,
  qrLostPetTitle,
  qrTagShouldPromptLost,
  shouldShowQrLostPrompt,
} from '../lib/qrLostPet.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const welcome = readFileSync(join(root, 'screens/TagWelcomeScreen.tsx'), 'utf8');
const petProfile = readFileSync(join(root, 'screens/PetProfileScreen.tsx'), 'utf8');
const modal = readFileSync(join(root, 'components/QrLostPetModal.tsx'), 'utf8');
const scanner = readFileSync(join(root, 'screens/QRScannerScreen.tsx'), 'utf8');
const types = readFileSync(join(root, 'lib/types.ts'), 'utf8');
const appLinks = readFileSync(join(root, 'lib/appLinks.ts'), 'utf8');
const avatar = readFileSync(join(root, 'components/PetStatusAvatar.tsx'), 'utf8');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
const db = readFileSync(join(root, 'lib/db.ts'), 'utf8');

const claimedLost = { exists: true, status: 'claimed' as const, pet: { careStatus: 'perdido' } };
const claimedHome = { exists: true, status: 'claimed' as const, pet: { careStatus: 'en_casa' } };
const claimedAdopt = { exists: true, status: 'claimed' as const, pet: { careStatus: 'en_adopcion' } };
const claimedRec = { exists: true, status: 'claimed' as const, pet: { careStatus: 'en_recuperacion' } };

describe('QR perdido: cuándo mostrar el modal', () => {
  it('1. QR claimed + pet perdido → modal', () => {
    assert.equal(qrTagShouldPromptLost(claimedLost), true);
    assert.equal(shouldShowQrLostPrompt({ fromQr: true, careStatus: 'perdido', loading: false }), true);
    assert.match(welcome, /fromQr: true/);
    assert.match(petProfile, /shouldShowQrLostPrompt/);
    assert.match(petProfile, /<QrLostPetModal/);
  });

  it('2. QR claimed + en casa → no modal', () => {
    assert.equal(qrTagShouldPromptLost(claimedHome), false);
    assert.equal(shouldShowQrLostPrompt({ fromQr: true, careStatus: 'en_casa' }), false);
  });

  it('3. QR claimed + en adopción → no modal', () => {
    assert.equal(qrTagShouldPromptLost(claimedAdopt), false);
    assert.equal(shouldShowQrLostPrompt({ fromQr: true, careStatus: 'en_adopcion' }), false);
  });

  it('4. QR claimed + recuperación → no modal', () => {
    assert.equal(qrTagShouldPromptLost(claimedRec), false);
    assert.equal(shouldShowQrLostPrompt({ fromQr: true, careStatus: 'en_recuperacion' }), false);
  });

  it('5. QR no asociado → flujo actual', () => {
    assert.equal(qrTagShouldPromptLost({ exists: true, status: 'unclaimed', pet: null }), false);
    assert.match(welcome, /setState\('unclaimed'\)/);
    assert.match(welcome, /Registrar mi mascota/);
    assert.match(welcome, /replace\('AddPet'/);
    assert.match(welcome, /tagCode: code/);
  });

  it('6. QR inexistente → flujo actual', () => {
    assert.equal(qrTagShouldPromptLost({ exists: false }), false);
    assert.match(welcome, /setState\('invalid'\)/);
    assert.match(welcome, /Código no válido/);
    assert.doesNotMatch(welcome, /state === 'invalid'[\s\S]{0,400}fromQr/);
  });

  it('7. numeric legacy 17 funciona', () => {
    const scanned = resolveScannedValue('https://animaldex-web.pages.dev/?qr=17');
    assert.deepEqual(scanned, { kind: 'tag', code: '17', raw: 'https://animaldex-web.pages.dev/?qr=17' });
    assert.equal(extractTagCode('https://animaldex-web.pages.dev?qr=17'), '17');
  });

  it('8. alphanumeric AAA123 y 345SDF funcionan', () => {
    assert.equal(resolveScannedValue('https://animaldex-web.pages.dev?qr=AAA123').kind, 'tag');
    assert.equal(extractTagCode('https://animaldex-web.pages.dev?qr=AAA123'), 'AAA123');
    assert.equal(extractTagCode('https://animaldex-web.pages.dev?qr=345SDF'), '345SDF');
  });
});

describe('QR perdido: copy y cierre', () => {
  it('9. copy usa nombre de la mascota', () => {
    assert.equal(qrLostPetTitle(), '¡Qué gran trabajo!');
    assert.equal(qrLostPetMessage('Toby'), 'Toby está perdido y su familia lo extraña.');
    assert.match(modal, /qrLostPetMessage\(petName\)/);
  });

  it('10. nombre ausente usa fallback', () => {
    assert.equal(qrLostPetMessage(null), 'Esta mascota está perdida y su familia la extraña.');
    assert.equal(qrLostPetMessage(''), 'Esta mascota está perdida y su familia la extraña.');
    assert.equal(qrLostPetMessage('   '), 'Esta mascota está perdida y su familia la extraña.');
    assert.equal(qrLostPetQuestion(), '¿Querés enviar tu ubicación para ayudar a encontrarlo?');
  });

  it('11–12. X y Cancelar cierran sin enviar', () => {
    assert.match(modal, /accessibilityLabel="Cerrar"/);
    assert.match(modal, /accessibilityLabel="Cancelar"/);
    assert.match(modal, /onPress=\{onClose\}/);
    assert.doesNotMatch(modal, /shareLocation|shareMyLocation/);
    assert.match(petProfile, /onClose=\{\(\) => setQrLostOpen\(false\)\}/);
  });

  it('13–14. X y Cancelar dejan ver el perfil', () => {
    assert.match(petProfile, /<QrLostPetModal/);
    assert.match(petProfile, /identityRow/);
    assert.doesNotMatch(petProfile, /onClose=\{[^}]*goBack/);
    assert.doesNotMatch(petProfile, /onClose=\{[^}]*replace/);
    assert.match(welcome, /replace\('PetProfile'/);
  });
});

describe('QR perdido: ubicación y origen', () => {
  it('15. Enviar ubicación reutiliza shareMyLocation', () => {
    assert.match(petProfile, /onSendLocation=\{async \(\) => \{/);
    assert.match(petProfile, /await shareMyLocation\(\)/);
    assert.match(petProfile, /db\.shareLocation\(\s*internalId/);
    const sends = petProfile.split('db.shareLocation').length - 1;
    assert.equal(sends, 1);
  });

  it('16. un solo envío / una sola notificación', () => {
    assert.doesNotMatch(modal, /db\.shareLocation/);
    assert.doesNotMatch(welcome, /shareLocation/);
    assert.match(petProfile, /if \(ok\) setQrLostOpen\(false\)/);
    assert.match(petProfile, /locationDone/);
  });

  it('17. permiso denegado no crashea', () => {
    assert.match(petProfile, /Permiso no otorgado/);
    assert.match(petProfile, /status !== 'granted'/);
    assert.match(petProfile, /return false/);
  });

  it('18. no se muestra al abrir /pet/:id normal', () => {
    assert.equal(shouldShowQrLostPrompt({ fromQr: false, careStatus: 'perdido' }), false);
    assert.match(scanner, /r\.kind === 'pet'\) navigation\.replace\('PetProfile', \{ petId: r\.id \}\)/);
    assert.doesNotMatch(scanner, /fromQr: true/);
  });

  it('19. no se muestra al abrir /nina.pet normal', () => {
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/nina.pet'), {
      screen: 'PetProfile',
      params: { petId: 'nina.pet' },
    });
    assert.doesNotMatch(appLinks, /fromQr/);
    assert.equal(shouldShowQrLostPrompt({ fromQr: undefined, careStatus: 'perdido' }), false);
  });

  it('20. .pet intacto', () => {
    assert.match(petProfile, /@\{petHandle\}/);
    assert.equal(isLostCareStatus('perdido'), true);
    assert.equal(isLostCareStatus('en_casa'), false);
  });

  it('21. aro animado intacto', () => {
    assert.match(petProfile, /<PetStatusAvatar/);
    assert.match(petProfile, /size=\{84\}/);
    assert.match(avatar, /react-native-reanimated/);
  });

  it('22. navegación QR intacta', () => {
    assert.match(welcome, /db\.tagStatus\(code\)/);
    assert.match(welcome, /res\.status === 'claimed' && res\.pet/);
    assert.match(scanner, /r\.kind === 'tag'\) navigation\.replace\('TagWelcome', \{ code: r\.code \}\)/);
    assert.match(types, /PetProfile: \{ petId: string; fromQr\?: boolean \}/);
    assert.match(types, /TagWelcome: \{ code: string \}/);
    assert.match(db, /action: 'tagStatus'/);
    assert.match(worker, /if \(action === 'tagStatus'\)/);
    assert.match(worker, /careStatus: r\.care_status \|\| null/);
  });
});
