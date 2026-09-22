import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyAppLinkIfReady, clearPendingAppLink, rememberIncomingAppLink, resolveAppLink } from '../lib/appLinks.ts';
import { buildTagUrl, extractTagCode } from '../lib/tags.ts';
import {
  guestTagWelcomeHome,
  publicTagTargetFromStatus,
  TAG_UNAVAILABLE_TITLE,
} from '../lib/tagPublicResolve.ts';
import { getStateFromPublicPath, setLinkingHasUser } from '../lib/webLinking.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('QR público: claimed / unclaimed / inválido', () => {
  it('1. guest + claimed → PetProfile', () => {
    assert.deepEqual(
      publicTagTargetFromStatus('6544FF', {
        exists: true,
        status: 'claimed',
        pet: { id: 'pet-luna' },
      }),
      { kind: 'pet', petId: 'pet-luna' }
    );
  });

  it('2. guest + unclaimed → claim / Auth', () => {
    assert.deepEqual(
      publicTagTargetFromStatus('AAA123', { exists: true, status: 'unclaimed', pet: null }),
      { kind: 'claim', code: 'AAA123' }
    );
    assert.equal(guestTagWelcomeHome(false), 'Auth');
  });

  it('3. guest + inválido → estado controlado', () => {
    assert.deepEqual(publicTagTargetFromStatus('ZZZ999', { exists: false }), {
      kind: 'unavailable',
      code: 'ZZZ999',
    });
    assert.deepEqual(publicTagTargetFromStatus('NOPE', null), {
      kind: 'unavailable',
      code: 'NOPE',
    });
    assert.equal(TAG_UNAVAILABLE_TITLE, 'Esta chapita no está disponible');
  });

  it('4. usuario logueado + QR claimed sigue yendo al perfil', () => {
    assert.equal(guestTagWelcomeHome(true), 'Tabs');
    const target = publicTagTargetFromStatus('17', {
      exists: true,
      status: 'claimed',
      pet: { id: 'pet-legacy' },
    });
    assert.equal(target.kind, 'pet');
    if (target.kind === 'pet') assert.equal(target.petId, 'pet-legacy');
  });

  it('5. /pet público no se toca', () => {
    setLinkingHasUser(false);
    const pet = getStateFromPublicPath('/pet/corason.pet');
    assert.deepEqual(pet.routes.map((r: { name: string }) => r.name), ['PetProfile']);
    const pretty = getStateFromPublicPath('/nina.pet');
    assert.deepEqual(pretty.routes.map((r: { name: string }) => r.name), ['PetProfile']);
  });

  it('6. /p /a /m siguen resolviendo públicos', () => {
    assert.equal(resolveAppLink('https://animaldex.com/p/post-1')?.screen, 'PostDetail');
    assert.equal(resolveAppLink('https://animaldex.com/a/alert-1')?.screen, 'AlertDetail');
    assert.equal(resolveAppLink('https://animaldex.com/m/list-1')?.screen, 'ListingDetail');
  });

  it('7. ?qr= claimed no cae en Auth; linking abre TagWelcome', () => {
    setLinkingHasUser(false);
    for (const path of [
      'https://animaldex.com/?qr=6544FF',
      'https://animaldex.com?qr=6544FF',
      '/?qr=6544FF',
      'https://animaldex-web.pages.dev?qr=17',
      'https://animaldex-web.pages.dev/?qr=17',
    ]) {
      const state = getStateFromPublicPath(path);
      assert.deepEqual(state.routes.map((r: { name: string }) => r.name), ['TagWelcome']);
      assert.ok(state.routes[0].params.code);
    }
    setLinkingHasUser(true);
    const authed = getStateFromPublicPath('https://animaldex.com/?qr=AAA123');
    assert.equal(authed.routes[0].name, 'Tabs');
    assert.equal(authed.routes[1].name, 'TagWelcome');
    assert.equal(authed.routes[1].params.code, 'AAA123');
    setLinkingHasUser(false);
    const root = getStateFromPublicPath('/');
    assert.deepEqual(root.routes.map((r: { name: string }) => r.name), ['Auth']);
  });

  it('8. QR antiguos numéricos y pages.dev siguen parseándose', () => {
    assert.equal(extractTagCode('https://animaldex.com?qr=17'), '17');
    assert.equal(extractTagCode('https://animaldex-web.pages.dev?qr=17'), '17');
    assert.equal(extractTagCode('https://animaldex.com/?qr=6544FF'), '6544FF');
    assert.equal(buildTagUrl('AAA123'), 'https://animaldex.com?qr=AAA123');
    assert.equal(buildTagUrl(17), 'https://animaldex.com?qr=17');
  });

  it('9. applyAppLinkIfReady no espera login para TagWelcome', () => {
    clearPendingAppLink();
    const calls: Array<{ name: string; params?: object }> = [];
    rememberIncomingAppLink('https://animaldex.com?qr=6544FF');
    const result = applyAppLinkIfReady({
      authReady: true,
      navReady: true,
      hasUser: false,
      isReady: () => true,
      navigate: (name, params) => calls.push({ name, params }),
    });
    assert.equal(result, 'applied');
    assert.deepEqual(calls, [{ name: 'TagWelcome', params: { code: '6544FF' } }]);
    clearPendingAppLink();
  });
});

describe('QR público: wiring en App y TagWelcome', () => {
  it('PublicNavigator registra TagWelcome y PetProfile', () => {
    const app = read('App.tsx');
    assert.match(app, /function PublicNavigator/);
    assert.match(app, /name="TagWelcome" component=\{TagWelcomeScreen\}/);
    assert.match(app, /name="PetProfile" component=\{PetProfileScreen\}/);
  });

  it('TagWelcome claimed → PetProfile; unclaimed guest → Auth; inválido no va a Tabs', () => {
    const welcome = read('screens/TagWelcomeScreen.tsx');
    const linking = read('lib/webLinking.ts');
    assert.match(welcome, /publicTagTargetFromStatus/);
    assert.match(welcome, /replace\('PetProfile', \{ petId: target.petId, fromQr: true \}\)/);
    assert.match(welcome, /replace\('Auth', \{ mode: 'login' \}\)/);
    assert.match(welcome, /setPendingTagCode\(code\)/);
    assert.match(welcome, /TAG_UNAVAILABLE_TITLE/);
    assert.match(welcome, /guestTagWelcomeHome/);
    assert.match(linking, /extractTagCode\(path\)/);
    assert.doesNotMatch(welcome, /navigation\.replace\('Tabs'\)/);
  });
});

describe('regresión: GEO / flyer / feed / location_reference', () => {
  it('10. camino normal no llama geoResolveCoords', () => {
    assert.doesNotMatch(read('lib/placeLocate.ts'), /geoResolveCoords/);
    assert.doesNotMatch(read('lib/lastLocationSync.ts'), /geoResolveCoords/);
    assert.doesNotMatch(read('screens/FeedScreen.tsx'), /geoResolveCoords/);
    assert.doesNotMatch(read('screens/AlertsScreen.tsx'), /geoResolveCoords/);
    assert.doesNotMatch(read('screens/AdoptionDiscoveryScreen.tsx'), /geoResolveCoords/);
    assert.doesNotMatch(read('screens/MarketScreen.tsx'), /geoResolveCoords/);
    assert.doesNotMatch(read('screens/CreateAlertScreen.tsx'), /geoResolveCoords/);
    assert.doesNotMatch(read('components/PlacePicker.tsx'), /geoResolveCoords/);
    assert.match(read('lib/placeLocate.ts'), /reverseGeocodeAsync/);
  });

  it('11. Perdido / Encontrado / Adopción imprimen flyer.contact', () => {
    const canvas = read('components/AlertFlyerCanvas.tsx');
    const create = read('screens/CreateAlertScreen.tsx');
    assert.match(canvas, /☎ \{flyer\.contact\}/);
    assert.match(create, /parsePersonalAlertContact/);
    assert.match(create, /shouldCollectPersonalAlertContact/);
  });

  it('12. location_reference no es placeId', () => {
    const ref = read('lib/alertLocationReference.ts');
    assert.match(ref, /location_reference/);
    assert.match(ref, /reemplaza placeId/);
    assert.match(read('lib/theme.ts'), /FEED_POST_GAP = 7/);
  });

  it('13. overlay es Image, no 5 Ionicons; gap = 7', () => {
    const overlay = read('components/PawPrintOverlay.tsx');
    assert.match(overlay, /from 'expo-image'/);
    assert.doesNotMatch(overlay, /Ionicons/);
    assert.match(overlay, /paw-print-overlay/);
    assert.match(read('lib/theme.ts'), /FEED_POST_GAP = 7/);
    assert.match(read('components/PostCard.tsx'), /FEED_POST_GAP/);
  });

  it('14. flyer desde alerta publicada sigue sin hidratar teléfono (P2)', () => {
    const flyer = read('lib/alertFlyer.ts');
    const fromApi = flyer.slice(flyer.indexOf('export function flyerFromApiAlert'));
    assert.doesNotMatch(fromApi.slice(0, 800), /contactWhatsapp|contactPhone/);
  });

  it('15. Activity Mercado listing_comment ya está en HEAD', () => {
    assert.match(read('screens/ActivityScreen.tsx'), /listing_comment/);
    assert.match(read('screens/ActivityScreen.tsx'), /comentó tu producto/);
  });
});
