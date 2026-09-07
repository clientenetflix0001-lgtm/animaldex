import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { qrLostPetMessage } from '../lib/qrLostPet.ts';
import { centeredParentTextWrap } from '../lib/centeredText.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function src(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

const publicProfile = src('screens/PublicProfileScreen.tsx');
const lostModal = src('components/QrLostPetModal.tsx');
const tagWelcome = src('screens/TagWelcomeScreen.tsx');
const qrScanner = src('screens/QRScannerScreen.tsx');
const stories = src('screens/StoryViewerScreen.tsx');
const storiesTest = src('tests/stories.test.ts');
const qrLostHelper = src('lib/qrLostPet.ts');
const bioHelper = src('lib/bio.ts');
const worker = src('worker/index.js');

const FULL_BIO = 'Amo a todos los animalitos de la calle';
const FULL_LOST = 'Luchi está perdido y su familia lo busca.';
const FULL_LOST_FALLBACK = 'Esta mascota está perdida y su familia la está buscando.';
const FULL_SCAN_COPY = 'Llevándote al perfil de la mascota…';

describe('truncated UI — causa visual compartida', () => {
  it('centeredParentTextWrap fuerza ancho completo para que Android no recorte la última palabra', () => {
    assert.equal(centeredParentTextWrap.alignSelf, 'stretch');
    assert.equal(centeredParentTextWrap.width, '100%');
    assert.equal(centeredParentTextWrap.flexShrink, 0);
  });

  it('no hay helper compartido que recorte bios o mensajes QR', () => {
    assert.equal(qrLostHelper.includes('slice('), false);
    assert.equal(qrLostHelper.includes('substring('), false);
    assert.equal(qrLostHelper.includes('numberOfLines'), false);
    assert.equal(bioHelper.includes('slice('), false);
    assert.equal(bioHelper.includes('substring('), false);
    assert.match(worker, /acceptedBio\(body\.bio\)/);
    assert.doesNotMatch(worker, /clean\(body\.bio,\s*200\)/);
  });
});

describe('PublicProfile bio completa', () => {
  it('renderiza profile.bio sin numberOfLines ni ellipsis', () => {
    const bioJsx = publicProfile.match(/\{!!profile\.bio && <Text[\s\S]*?\{profile\.bio\}<\/Text>\}/);
    assert.ok(bioJsx, 'bloque de bio pública');
    assert.equal(bioJsx[0].includes('numberOfLines'), false);
    assert.equal(bioJsx[0].includes('ellipsizeMode'), false);
    assert.equal(bioJsx[0].includes('lineClamp'), false);
    assert.match(bioJsx[0], /centeredParentTextWrap/);
  });

  it('estilo bio no recorta por altura fija ni overflow hidden', () => {
    const bioStyle = publicProfile.match(/bio:\s*\{[\s\S]*?\n  \},/);
    assert.ok(bioStyle);
    assert.equal(bioStyle[0].includes('numberOfLines'), false);
    assert.equal(bioStyle[0].includes('maxHeight'), false);
    assert.equal(bioStyle[0].includes('height:'), false);
    assert.equal(bioStyle[0].includes('overflow'), false);
  });

  it('el string de ejemplo cabe entero (sin slice/substring en el render)', () => {
    assert.equal(FULL_BIO.endsWith('calle'), true);
    assert.equal(publicProfile.includes('{profile.bio}'), true);
    assert.equal(publicProfile.includes('profile.bio.slice'), false);
    assert.equal(publicProfile.includes('profile.bio.substring'), false);
  });
});

describe('QR lost modal copy + wrap', () => {
  it('helper con nombre: "...su familia lo busca."', () => {
    assert.equal(qrLostPetMessage('Luchi'), FULL_LOST);
    assert.equal(FULL_LOST.includes('busca.'), true);
  });

  it('fallback sin nombre completo', () => {
    assert.equal(qrLostPetMessage(''), FULL_LOST_FALLBACK);
    assert.equal(qrLostPetMessage(null), FULL_LOST_FALLBACK);
  });

  it('modal no aplica numberOfLines/ellipsis al body y usa wrap stretch', () => {
    assert.match(
      lostModal,
      /<Text style=\{\[styles\.body, centeredParentTextWrap\]\}>\{qrLostPetMessage\(petName\)\}<\/Text>/,
    );
    assert.equal(lostModal.includes('numberOfLines'), false);
    assert.equal(lostModal.includes('ellipsizeMode'), false);
    assert.equal(lostModal.includes('qrLostPetMessage(petName).slice'), false);
  });
});

describe('QR scanner / TagWelcome copy completo', () => {
  it('el mensaje de perfil existe completo, no "Llevando al perfil de la"', () => {
    assert.equal(tagWelcome.includes(FULL_SCAN_COPY), true);
    assert.equal(/Llevando al perfil de la(?! mascota)/.test(tagWelcome), false);
    const claimed = tagWelcome.match(
      /<Text style=\{\[styles\.loadingText, centeredParentTextWrap\]\}>[\s\S]*?<\/Text>/,
    );
    assert.ok(claimed);
    assert.equal(claimed[0].includes(FULL_SCAN_COPY), true);
    assert.equal(claimed[0].includes('numberOfLines'), false);
  });

  it('QRScannerScreen no inventa ni recorta ese mensaje', () => {
    assert.equal(qrScanner.includes('Llevando al perfil'), false);
    assert.equal(qrScanner.includes('Llevándote al perfil'), false);
    assert.match(qrScanner, /onBarcodeScanned=\{scanned \? undefined : onBarcodeScanned\}/);
    assert.match(qrScanner, /r\.kind === 'tag'\) navigation\.replace\('TagWelcome', \{ code: r\.code \}\)/);
  });
});

describe('Stories V8 intactas', () => {
  it('stageShell + Simultaneous + SharedValues siguen en StoryViewer y tests', () => {
    assert.match(stories, /stageShell/);
    assert.match(stories, /Gesture\.Simultaneous\(hold, pan\)/);
    assert.match(stories, /progress\.value = withTiming/);
    assert.match(storiesTest, /stageShell/);
    assert.match(storiesTest, /Simultaneous/);
  });
});
