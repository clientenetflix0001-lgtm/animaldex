import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveAppLink } from '../lib/appLinks.ts';
import { postOwnerSubtitle } from '../lib/postDisplay.ts';
import {
  getStateFromPublicPath,
  isWebRootPath,
  setLinkingHasUser,
  shouldAutoOpenPendingTag,
  webHomeState,
} from '../lib/webLinking.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'App.tsx'), 'utf8');
const pages = readFileSync(join(root, 'cf-pages-worker.src.js'), 'utf8');

describe('web root animaldex.com', () => {
  it('pathname / es raíz y no hereda mascota', () => {
    assert.equal(isWebRootPath('/'), true);
    assert.equal(isWebRootPath('https://animaldex.com/'), true);
    assert.equal(isWebRootPath('https://animaldex.com'), true);
    assert.equal(isWebRootPath('/nina.pet'), false);
    assert.equal(isWebRootPath('/pet/nina'), false);
    setLinkingHasUser(false);
    const guest = getStateFromPublicPath('/');
    assert.deepEqual(guest.routes.map((r: { name: string }) => r.name), ['Auth']);
    assert.ok(!JSON.stringify(guest).includes('nina'));
    setLinkingHasUser(true);
    const home = getStateFromPublicPath('/');
    assert.equal(home.routes[0].name, 'Tabs');
    assert.equal(home.routes[0].state.routes[0].name, 'Inicio');
    const afterPet = getStateFromPublicPath('/');
    assert.ok(!JSON.stringify(afterPet).includes('PetProfile'));
    assert.deepEqual(webHomeState(true).routes[0].name, 'Tabs');
  });

  it('ruta mascota y QR siguen resolviendo', () => {
    setLinkingHasUser(false);
    const pet = getStateFromPublicPath('/nina.pet');
    assert.deepEqual(pet.routes.map((r: { name: string }) => r.name), ['PetProfile']);
    assert.equal(pet.routes[0].params.petId, 'nina.pet');
    setLinkingHasUser(true);
    const authed = getStateFromPublicPath('/toby.pet');
    assert.equal(authed.routes[0].name, 'Tabs');
    assert.equal(authed.routes[1].name, 'PetProfile');
    assert.equal(authed.routes[1].params.petId, 'toby.pet');
    assert.equal(resolveAppLink('https://animaldex.com/pet/abc')?.screen, 'PetProfile');
    assert.equal(resolveAppLink('https://animaldex.com/?qr=AAA123')?.screen, 'Tabs');
    assert.match(app, /getStateFromPublicPath/);
    assert.match(app, /WebUrlSync/);
    assert.match(pages, /index\.html/);
    assert.doesNotMatch(pages, /301.*www/);
  });

  it('QR pendiente no reabre al escribir /; ?qr= sí abre', () => {
    assert.equal(
      shouldAutoOpenPendingTag({ platform: 'web', href: '/', pendingTagCode: 'AAA123' }),
      false
    );
    assert.equal(
      shouldAutoOpenPendingTag({ platform: 'web', href: 'https://animaldex.com/', pendingTagCode: 'AAA123' }),
      false
    );
    assert.equal(
      shouldAutoOpenPendingTag({ platform: 'web', href: 'https://animaldex.com/?qr=AAA123', pendingTagCode: 'AAA123' }),
      true
    );
    assert.equal(
      shouldAutoOpenPendingTag({ platform: 'web', href: '/entrar', pendingTagCode: 'AAA123' }),
      true
    );
    assert.equal(
      shouldAutoOpenPendingTag({ platform: 'ios', href: '/', pendingTagCode: 'AAA123' }),
      true
    );
    const root = getStateFromPublicPath('https://animaldex.com/');
    assert.ok(!JSON.stringify(root).includes('TagWelcome'));
    assert.ok(!JSON.stringify(root).includes('qr'));
    assert.ok(!JSON.stringify(root).includes('petId'));
    assert.match(app, /shouldAutoOpenPendingTag/);
    assert.equal(postOwnerSubtitle('otro', 'lucasfuentes'), 'mascota de (lucasfuentes)');
    assert.doesNotMatch(postOwnerSubtitle('otro', 'lucasfuentes'), /otro de/);
  });
});
