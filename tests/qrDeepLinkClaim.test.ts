import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveAppLink } from '../lib/appLinks.ts';
import {
  markAppLinkSeenThisLaunch,
  resetDeepLinkOnceForTests,
  shouldAcceptEventAppLink,
  shouldAcceptInitialAppLink,
  wasAppLinkSeenThisLaunch,
} from '../lib/deepLinkOnce.ts';
import {
  canonicalPetId,
  petProfileAfterClaim,
  qrClaimShouldShow,
  qrClaimSuccessMessage,
} from '../lib/qrClaimSuccess.ts';
import { addPetParamsForPageQr, addPetParamsForPersonalQr } from '../lib/qrPageRegister.ts';
import { qrPageOptionVisible, qrWelcomeChoices } from '../lib/qrTagLink.ts';
import {
  guestTagWelcomeHome,
  publicTagTargetFromStatus,
} from '../lib/tagPublicResolve.ts';
import { extractTagCode } from '../lib/tags.ts';
import {
  getStateFromPublicPath,
  setLinkingHasUser,
  shouldAutoOpenPendingTag,
} from '../lib/webLinking.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const welcome = read('screens/TagWelcomeScreen.tsx');
const addPet = read('screens/AddPetScreen.tsx');
const petProfile = read('screens/PetProfileScreen.tsx');
const app = read('App.tsx');
const store = read('lib/store.tsx');
const auth = read('screens/AuthScreen.tsx');
const claimModal = read('components/QrClaimSuccessModal.tsx');
const lostModal = read('components/QrLostPetModal.tsx');
const webBoot = read('tests/webBoot.test.ts');

const QR = 'https://animaldex.com/?qr=KG6432';

function simulateConsumeOnce() {
  resetDeepLinkOnceForTests();
  let lastConsumed: string | null = null;
  const accept = (url: string) => {
    if (!shouldAcceptInitialAppLink(url, lastConsumed)) return false;
    lastConsumed = markAppLinkSeenThisLaunch(url);
    return true;
  };
  return { accept, get lastConsumed() { return lastConsumed; } };
}

describe('QR deep link / claim / web / logo', { concurrency: 1 }, () => {

describe('1. claimed QR guest', () => {
  it('abre PetProfile y limpia pending', () => {
    const target = publicTagTargetFromStatus('KG6432', {
      exists: true,
      status: 'claimed',
      pet: { id: 'pet-tobi' },
    });
    assert.deepEqual(target, { kind: 'pet', petId: 'pet-tobi' });
    assert.match(welcome, /target\.kind === 'pet'/);
    assert.match(welcome, /setPendingTagCode\(null\)/);
    assert.match(welcome, /replace\('PetProfile', \{ petId: target\.petId, fromQr: true \}\)/);
    assert.equal(guestTagWelcomeHome(false), 'Auth');
  });
});

describe('2. unclaimed QR guest', () => {
  it('conserva pendingTagCode y va a Auth', () => {
    const target = publicTagTargetFromStatus('KG6432', { exists: true, status: 'unclaimed' });
    assert.equal(target.kind, 'claim');
    assert.match(welcome, /if \(!user\) \{/);
    assert.match(welcome, /setPendingTagCode\(code\)/);
    assert.match(welcome, /replace\('Auth', \{ mode: 'login' \}\)/);
    assert.match(auth, /pendingTagCode/);
    assert.doesNotMatch(auth, /setPendingTagCode/);
  });
});

describe('3. unclaimed QR autenticado', () => {
  it('muestra bienvenida y no reescribe pending desde Linking', () => {
    const target = publicTagTargetFromStatus('KG6432', { exists: true, status: 'unclaimed' });
    assert.equal(target.kind, 'claim');
    assert.match(welcome, /setState\('unclaimed'\)/);
    const handler = app.slice(app.indexOf('function TagDeepLinkHandler'));
    assert.doesNotMatch(handler, /Linking\.getInitialURL/);
    assert.doesNotMatch(handler, /setPendingTagCode/);
  });
});

describe('4. invalid QR', () => {
  it('estado controlado y limpia pending', () => {
    const target = publicTagTargetFromStatus('ZZZ999', { exists: false });
    assert.equal(target.kind, 'unavailable');
    assert.match(welcome, /setState\('invalid'\)/);
    assert.match(welcome, /setPendingTagCode\(null\)/);
    assert.match(welcome, /guestTagWelcomeHome/);
    assert.doesNotMatch(welcome, /navigation\.replace\('Tabs'\)/);
  });
});

describe('5. QR → Auth → registro → mismo código', () => {
  it('pending sobrevive Auth y TagDeepLinkHandler reabre el mismo code', () => {
    assert.match(store, /animaldex-pending-tag-code/);
    assert.match(store, /if \(saved\) setPendingTagCodeState\(saved\)/);
    assert.match(auth, /pendingTagCode != null/);
    assert.match(app, /navigate\('TagWelcome', \{ code \}\)/);
    assert.match(app, /const code = pendingTagCode/);
    assert.equal(
      shouldAutoOpenPendingTag({ platform: 'web', href: '/entrar', pendingTagCode: 'KG6432' }),
      true
    );
    assert.equal(extractTagCode('https://animaldex.com/?qr=KG6432'), 'KG6432');
  });
});

describe('6. nueva mascota → claim → PetProfile válido', () => {
  it('espera claimTag y navega con id canónico', () => {
    const dest = petProfileAfterClaim({ id: 'pet-1', username: 'tobi.pet' }, 'new_personal');
    assert.deepEqual(dest, {
      petId: 'pet-1',
      fromQr: true,
      qrClaim: { kind: 'new_personal', username: 'tobi.pet', pageLabel: null },
    });
    assert.deepEqual(addPetParamsForPersonalQr('KG6432'), {
      tagCode: 'KG6432',
      qrClaimKind: 'new_personal',
    });
    assert.match(addPet, /await db\.claimTag\(tagCode, pet\.id\)/);
    assert.match(addPet, /goToCreatedPet\(pet\)/);
    assert.match(addPet, /petProfileAfterClaim\(pet,/);
    assert.match(addPet, /webPetProfilePath\(dest\.petId\)/);
    assert.doesNotMatch(addPet, /pet\.username \|\| pet\.id/);
    assert.match(read('lib/webPublicPath.ts'), /return `\/pet\/\$\{encodeURIComponent\(String\(petId \|\| ''\)\.trim\(\)\)\}`/);
  });
});

describe('7. mascota existente → claim → PetProfile válido', () => {
  it('usa el id de la mascota elegida, no un handle inventado', () => {
    const dest = petProfileAfterClaim({ id: 'pet-9', username: 'tobi.pet' }, 'existing');
    assert.equal(dest?.petId, 'pet-9');
    assert.equal(dest?.qrClaim.username, 'tobi.pet');
    assert.match(welcome, /await db\.claimTag\(code, petId\)/);
    assert.match(welcome, /petProfileAfterClaim\(pet \|\| \{ id: petId \}, 'existing'\)/);
    assert.match(welcome, /navigation\.replace\('PetProfile', dest\)/);
  });
});

describe('8. mascota de página → claim → PetProfile válido', () => {
  it('pasa kind new_page y el id canónico', () => {
    const dest = petProfileAfterClaim({ id: 'pet-p', username: 'luna.pet' }, 'new_page', 'APAN Salta');
    assert.equal(dest?.petId, 'pet-p');
    assert.equal(dest?.qrClaim.kind, 'new_page');
    assert.equal(dest?.qrClaim.pageLabel, 'APAN Salta');
    assert.deepEqual(addPetParamsForPageQr('KG6432', 'prf-1', 'APAN Salta'), {
      tagCode: 'KG6432',
      profileId: 'prf-1',
      qrClaimKind: 'new_page',
      qrPageLabel: 'APAN Salta',
    });
    assert.match(addPet, /qrClaimKind === 'new_page' \? 'new_page' : 'new_personal'/);
  });
});

describe('9. confirmación correcta según flujo', () => {
  it('A/B/C usan handle real y no duplican', () => {
    assert.equal(
      qrClaimSuccessMessage({ kind: 'new_personal', username: 'tobi.pet' }),
      'Tu chapita fue vinculada a tobi.pet correctamente.'
    );
    assert.equal(
      qrClaimSuccessMessage({ kind: 'new_personal' }),
      'Tu mascota fue registrada y la chapita quedó vinculada correctamente.'
    );
    assert.equal(
      qrClaimSuccessMessage({ kind: 'existing', username: 'tobi.pet' }),
      'Tu chapita fue vinculada a tobi.pet correctamente.'
    );
    assert.equal(
      qrClaimSuccessMessage({ kind: 'new_page', username: 'tobi.pet', pageLabel: 'APAN Salta' }),
      'Tu chapita fue vinculada a tobi.pet en APAN Salta correctamente.'
    );
    assert.equal(
      qrClaimSuccessMessage({ kind: 'new_page', pageLabel: 'APAN Salta' }),
      'Tu mascota fue registrada en APAN Salta y la chapita quedó vinculada correctamente.'
    );
    assert.equal(canonicalPetId({ id: ' pet-1 ' }), 'pet-1');
    assert.equal(canonicalPetId({ id: '' }), '');
    assert.equal(petProfileAfterClaim({ username: 'tobi.pet' }, 'existing'), null);
  });
});

describe('10. X elimina confirmación', () => {
  it('cierra con setParams y no navega lejos del perfil', () => {
    assert.match(petProfile, /<QrClaimSuccessModal/);
    assert.match(petProfile, /onClose=\{\(\) => navigation\.setParams\(\{ qrClaim: undefined \}\)\}/);
    assert.match(claimModal, /accessibilityLabel="Cerrar"/);
    assert.match(claimModal, /name="close"/);
    assert.doesNotMatch(claimModal, /replace\(|goBack\(/);
  });
});

describe('11. confirmación no reaparece posteriormente', () => {
  it('vive solo en params de ruta, no en AsyncStorage', () => {
    assert.equal(qrClaimShouldShow(undefined), false);
    assert.equal(qrClaimShouldShow(null), false);
    assert.equal(qrClaimShouldShow({ kind: 'existing', username: 'tobi.pet' }), true);
    assert.match(petProfile, /qrClaimShouldShow\(qrClaim\)/);
    assert.match(petProfile, /!!realPet && qrClaimShouldShow/);
    assert.doesNotMatch(petProfile, /AsyncStorage/);
    assert.doesNotMatch(claimModal, /AsyncStorage/);
    assert.doesNotMatch(store, /qrClaim/);
  });
});

describe('12. initial deep link consumido una sola vez', () => {
  it('getInitialURL + listener no reprocesan el mismo URL del launch', () => {
    const once = simulateConsumeOnce();
    assert.equal(once.accept(QR), true);
    assert.equal(once.accept(QR), false);
    assert.equal(shouldAcceptEventAppLink(QR), false);
    assert.equal(wasAppLinkSeenThisLaunch(QR), true);
    assert.equal(shouldAcceptInitialAppLink(QR, QR), false);
    assert.equal(shouldAcceptInitialAppLink('https://animaldex.com/?qr=OTRO', QR), true);
    assert.match(app, /shouldAcceptInitialAppLink\(url, lastConsumed\)/);
    assert.match(app, /shouldAcceptEventAppLink\(url\)/);
    assert.match(app, /CONSUMED_INITIAL_APP_LINK_KEY/);
    assert.match(app, /markAppLinkSeenThisLaunch/);
  });
});

describe('13. abrir app normalmente después → Home', () => {
  it('icon launch ignora el initial URL ya consumido y no reabre QR', () => {
    const once = simulateConsumeOnce();
    assert.equal(once.accept(QR), true);
    assert.equal(once.accept(QR), false);
    assert.equal(
      shouldAutoOpenPendingTag({ platform: 'android', href: '', pendingTagCode: null }),
      false
    );
    setLinkingHasUser(true);
    const home = getStateFromPublicPath('/');
    assert.equal(home.routes[0].name, 'Tabs');
    assert.ok(!JSON.stringify(home).includes('TagWelcome'));
    assert.ok(!JSON.stringify(home).includes('KG6432'));
    assert.match(app, /if \(Platform\.OS !== 'web'\) \{/);
    assert.match(app, /return null;/);
  });
});

describe('14. pendingTagCode sobrevive Auth cuando corresponde', () => {
  it('se persiste y no lo toca el wizard', () => {
    assert.match(store, /else AsyncStorage\.setItem\(PENDING_TAG_KEY/);
    assert.match(welcome, /setPendingTagCode\(code\)/);
    assert.doesNotMatch(auth, /setPendingTagCode/);
    assert.equal(
      shouldAutoOpenPendingTag({ platform: 'ios', href: '/', pendingTagCode: 'KG6432' }),
      true
    );
  });
});

describe('15. pendingTagCode se limpia después del claim', () => {
  it('claimed / invalid / claimExisting / AddPet claim llaman null', () => {
    assert.match(welcome, /target\.kind === 'pet'[\s\S]*setPendingTagCode\(null\)/);
    assert.match(welcome, /await db\.claimTag\(code, petId\)[\s\S]*setPendingTagCode\(null\)/);
    assert.match(welcome, /state === 'invalid'[\s\S]*setPendingTagCode\(null\)/);
    assert.match(addPet, /await db\.claimTag\(tagCode, pet\.id\)[\s\S]*setPendingTagCode\(null\)/);
    assert.match(addPet, /if \(!editPetId && tagCode != null\)/);
  });
});

describe('16. usuario sin página → 2 opciones', () => {
  it('no muestra Registrar en mi página', () => {
    assert.deepEqual(qrWelcomeChoices([]), ['new_personal', 'existing']);
    assert.equal(qrPageOptionVisible([{ type: 'business' }, { type: 'personal' }]), false);
    assert.match(welcome, /qrPageOptionVisible\(profiles\) \?/);
  });
});

describe('17. usuario con página → 3 opciones', () => {
  it('aparece solo si administra una protectora', () => {
    assert.deepEqual(qrWelcomeChoices([{ type: 'protector' }]), [
      'new_personal',
      'existing',
      'new_page',
    ]);
    assert.equal(qrPageOptionVisible([{ type: 'protector' }]), true);
    assert.match(welcome, /QR_REGISTER_PAGE_PET_LABEL/);
  });
});

describe('18. /pet/', () => {
  it('sigue resolviendo PetProfile', () => {
    setLinkingHasUser(false);
    const state = getStateFromPublicPath('/pet/pet-1');
    assert.deepEqual(state.routes.map((r: { name: string }) => r.name), ['PetProfile']);
    assert.equal(state.routes[0].params.petId, 'pet-1');
    assert.equal(resolveAppLink('https://animaldex.com/pet/pet-1')?.screen, 'PetProfile');
    assert.match(read('lib/webPublicPath.ts'), /\/pet\/\$\{encodeURIComponent/);
  });
});

describe('19. /p/', () => {
  it('sigue resolviendo PostDetail', () => {
    assert.equal(resolveAppLink('https://animaldex.com/p/post-1')?.screen, 'PostDetail');
    assert.match(app, /PostDetail: 'p\/:postId'/);
  });
});

describe('20. /a/', () => {
  it('sigue resolviendo AlertDetail', () => {
    assert.equal(resolveAppLink('https://animaldex.com/a/alert-1')?.screen, 'AlertDetail');
    assert.match(app, /AlertDetail: 'a\/:alertId'/);
  });
});

describe('21. /m/', () => {
  it('sigue resolviendo ListingDetail', () => {
    assert.equal(resolveAppLink('https://animaldex.com/m/list-1')?.screen, 'ListingDetail');
    assert.match(app, /ListingDetail: 'm\/:listingId'/);
  });
});

describe('22. web boot', () => {
  it('WebUrlSync no resetea por refreshUser y el claim usa /pet/:id', () => {
    assert.match(app, /const userId = user\?\.id \?\? null;/);
    assert.match(app, /setLinkingHasUser\(\!\!userId\)/);
    assert.match(app, /\[authReady, userId\]/);
    const webUrlSync = app.slice(app.indexOf('function WebUrlSync'), app.indexOf('function RootNavigator'));
    assert.doesNotMatch(webUrlSync, /\[authReady, user\]/);
    assert.match(addPet, /replaceWebPublicPath\(webPetProfilePath\(dest\.petId\)\)/);
    assert.match(welcome, /replaceWebPublicPath\(webPetProfilePath/);
    assert.match(read('lib/webPublicPath.ts'), /export function replaceWebPublicPath/);
    assert.match(webBoot, /web boot: no ReferenceError colors/);
    assert.doesNotMatch(petProfile, /Este perfil no existe/);
    assert.match(read('screens/PublicProfileScreen.tsx'), /Este perfil no existe/);
    assert.equal(canonicalPetId({ id: 'pet-1', username: 'tobi.pet' }), 'pet-1');
  });
});

describe('23. logo correcto / transparencia según asset', () => {
  it('header mark ya no tiene placa blanca opaca', () => {
    const mark = decodePng(join(root, 'assets/images/animaldex-logo-mark.png'));
    const legal = decodePng(join(root, 'web/legal/assets/animaldex-logo-mark.png'));
    assert.equal(mark.colorType, 6);
    assert.equal(mark.whiteOpaque, 0);
    assert.ok(mark.transparent > 10000, 'alpha real alrededor del isotipo');
    assert.ok(mark.orange > 10000, 'conserva el naranja de la A');
    assert.equal(mark.alphaAt(0, 0), 0);
    assert.equal(mark.alphaAt(mark.width - 1, 0), 0);
    assert.equal(legal.whiteOpaque, 0);
    assert.equal(legal.transparent, mark.transparent);
    assert.match(read('screens/FeedScreen.tsx'), /animaldex-logo-mark\.png/);
    assert.doesNotMatch(read('screens/FeedScreen.tsx'), /notification-icon\.png/);
    assert.match(read('app.json'), /"icon": "\.\/assets\/notification-icon\.png"/);
  });
});

describe('componente reutilizado y claim no anticipado', () => {
  it('QrClaimSuccessModal copia la cáscara de QrLostPetModal', () => {
    assert.match(claimModal, /Misma cáscara que QrLostPetModal/);
    assert.match(claimModal, /backgroundColor: 'rgba\(45,32,22,0\.35\)'/);
    assert.match(lostModal, /backgroundColor: 'rgba\(45,32,22,0\.35\)'/);
    assert.match(claimModal, /<Text style=\{styles\.paw\}>🐾<\/Text>/);
    assert.match(lostModal, /<Text style=\{styles\.paw\}>🐾<\/Text>/);
    assert.match(petProfile, /!!realPet && qrClaimShouldShow/);
    assert.match(addPet, /await db\.claimTag\(tagCode, pet\.id\)[\s\S]*goToCreatedPet\(pet\)/);
  });
});
});

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(path: string) {
  const buf = readFileSync(path);
  let off = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idats: Buffer[] = [];
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString('ascii');
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idats.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  assert.equal(bitDepth, 8);
  const raw = inflateSync(Buffer.concat(idats));
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let src = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[src++];
    for (let x = 0; x < stride; x += 1) {
      const v = raw[src++];
      const left = x >= bpp ? out[y * stride + x - bpp] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= bpp ? out[(y - 1) * stride + x - bpp] : 0;
      let val = v;
      if (filter === 1) val = (v + left) & 255;
      else if (filter === 2) val = (v + up) & 255;
      else if (filter === 3) val = (v + ((left + up) >> 1)) & 255;
      else if (filter === 4) val = (v + paeth(left, up, upLeft)) & 255;
      out[y * stride + x] = val;
    }
  }
  let transparent = 0;
  let whiteOpaque = 0;
  let orange = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * stride + x * bpp;
      const r = out[i];
      const g = out[i + 1];
      const b = out[i + 2];
      const a = colorType === 6 ? out[i + 3] : 255;
      if (a < 8) transparent += 1;
      else if (r > 250 && g > 250 && b > 250) whiteOpaque += 1;
      else if (r > 200 && g > 80 && b < 60) orange += 1;
    }
  }
  return {
    width,
    height,
    colorType,
    transparent,
    whiteOpaque,
    orange,
    alphaAt: (x: number, y: number) => (colorType === 6 ? out[y * stride + x * bpp + 3] : 255),
  };
}
