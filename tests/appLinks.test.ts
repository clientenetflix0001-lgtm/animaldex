import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APP_LINK_HTTPS_HOSTS,
  APP_LINK_PREFIXES,
  applyAppLinkIfReady,
  clearPendingAppLink,
  rememberIncomingAppLink,
  resolveAppLink,
} from '../lib/appLinks.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'App.tsx'), 'utf8');
const appJson = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));

afterEach(() => {
  clearPendingAppLink();
});

const HOSTS = [
  'https://animaldex.com',
  'https://www.animaldex.com',
  'https://animaldex-web.pages.dev',
];

describe('resolveAppLink: recursos públicos', () => {
  it('publicación /p/:id → PostDetail', () => {
    for (const host of HOSTS) {
      assert.deepEqual(resolveAppLink(`${host}/p/post-abc`), {
        screen: 'PostDetail',
        params: { postId: 'post-abc' },
      });
    }
    assert.deepEqual(resolveAppLink('animaldex://p/post-abc'), {
      screen: 'PostDetail',
      params: { postId: 'post-abc' },
    });
    assert.deepEqual(resolveAppLink('https://animaldex.com/p/post-abc?d=xyz'), {
      screen: 'PostDetail',
      params: { postId: 'post-abc', d: 'xyz' },
    });
  });

  it('mascota /pet/:handle-o-id → PetProfile', () => {
    for (const host of HOSTS) {
      assert.deepEqual(resolveAppLink(`${host}/pet/lunaqr13`), {
        screen: 'PetProfile',
        params: { petId: 'lunaqr13' },
      });
      assert.deepEqual(resolveAppLink(`${host}/pet/pet-99/`), {
        screen: 'PetProfile',
        params: { petId: 'pet-99' },
      });
    }
  });

  it('alerta /a/:id → AlertDetail', () => {
    for (const host of HOSTS) {
      assert.deepEqual(resolveAppLink(`${host}/a/alert-1`), {
        screen: 'AlertDetail',
        params: { alertId: 'alert-1' },
      });
    }
  });

  it('mercado /m/:id → ListingDetail', () => {
    for (const host of HOSTS) {
      assert.deepEqual(resolveAppLink(`${host}/m/listing-7`), {
        screen: 'ListingDetail',
        params: { listingId: 'listing-7' },
      });
    }
  });

  it('usuario / empresa / refugio /:username → PublicProfile', () => {
    assert.deepEqual(resolveAppLink('https://animaldex.com/lucasfuentes'), {
      screen: 'PublicProfile',
      params: { username: 'lucasfuentes' },
    });
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/TiendaLuna'), {
      screen: 'PublicProfile',
      params: { username: 'tiendaluna' },
    });
    assert.deepEqual(resolveAppLink('https://www.animaldex.com/apansalta/'), {
      screen: 'PublicProfile',
      params: { username: 'apansalta' },
    });
  });

  it('no trata rutas reservadas como username', () => {
    assert.deepEqual(resolveAppLink('https://animaldex.com/reels'), {
      screen: 'Tabs',
      params: { screen: 'Reels' },
    });
    assert.equal(resolveAppLink('https://animaldex.com/entrar'), null);
    assert.equal(resolveAppLink('https://otro-dominio.com/p/x'), null);
  });
});

describe('cola cold start / background / foreground', () => {
  it('cold start espera authReady y luego navega PostDetail', () => {
    const calls: Array<{ name: string; params?: object }> = [];
    rememberIncomingAppLink('https://animaldex.com/p/post-cold');
    assert.equal(
      applyAppLinkIfReady({
        authReady: false,
        navReady: true,
        hasUser: false,
        isReady: () => true,
        navigate: (name, params) => calls.push({ name, params }),
      }),
      'wait'
    );
    assert.equal(calls.length, 0);
    assert.equal(
      applyAppLinkIfReady({
        authReady: true,
        navReady: true,
        hasUser: false,
        isReady: () => true,
        navigate: (name, params) => calls.push({ name, params }),
      }),
      'applied'
    );
    assert.deepEqual(calls, [{ name: 'PostDetail', params: { postId: 'post-cold' } }]);
  });

  it('background/foreground con nav listo aplica PetProfile al toque', () => {
    const calls: Array<{ name: string; params?: object }> = [];
    rememberIncomingAppLink('https://animaldex-web.pages.dev/pet/lunaqr13');
    assert.equal(
      applyAppLinkIfReady({
        authReady: true,
        navReady: true,
        hasUser: true,
        isReady: () => true,
        navigate: (name, params) => calls.push({ name, params }),
      }),
      'applied'
    );
    assert.deepEqual(calls, [{ name: 'PetProfile', params: { petId: 'lunaqr13' } }]);
  });

  it('Tabs espera sesión; invitado sí abre mercado y perfiles', () => {
    const calls: Array<{ name: string; params?: object }> = [];
    rememberIncomingAppLink('https://animaldex.com/actividad');
    assert.equal(
      applyAppLinkIfReady({
        authReady: true,
        navReady: true,
        hasUser: false,
        isReady: () => true,
        navigate: (name, params) => calls.push({ name, params }),
      }),
      'wait'
    );
    clearPendingAppLink();
    rememberIncomingAppLink('https://animaldex.com/m/oferta-1');
    assert.equal(
      applyAppLinkIfReady({
        authReady: true,
        navReady: true,
        hasUser: false,
        isReady: () => true,
        navigate: (name, params) => calls.push({ name, params }),
      }),
      'applied'
    );
    assert.deepEqual(calls, [{ name: 'ListingDetail', params: { listingId: 'oferta-1' } }]);
  });
});

describe('App.tsx y app.json coinciden con el parser', () => {
  it('linking usa todos los prefijos y conserva las rutas públicas', () => {
    assert.match(app, /APP_LINK_PREFIXES/);
    assert.match(app, /prefixes: \[\.\.\.APP_LINK_PREFIXES\]/);
    assert.deepEqual([...APP_LINK_PREFIXES], [
      'animaldex://',
      'https://animaldex-web.pages.dev',
      'https://animaldex.com',
      'https://www.animaldex.com',
    ]);
    assert.match(app, /PostDetail: 'p\/:postId'/);
    assert.match(app, /PetProfile: 'pet\/:petId'/);
    assert.match(app, /AlertDetail: 'a\/:alertId'/);
    assert.match(app, /ListingDetail: 'm\/:listingId'/);
    assert.match(app, /PublicProfile: ':username'/);
    assert.match(app, /function AppLinkHandler/);
    assert.match(app, /name="ListingDetail"/);
    assert.match(app, /getInitialURL/);
  });

  it('intentFilters cubren pages.dev y animaldex.com por separado', () => {
    const filters = appJson.expo.android.intentFilters;
    const hosts = new Set(
      filters.flatMap((f: { data: Array<{ host: string }> }) => f.data.map((d) => d.host))
    );
    for (const host of APP_LINK_HTTPS_HOSTS) {
      assert.equal(hosts.has(host), true, host);
    }
    const pages = filters.filter((f: { data: Array<{ host: string }> }) =>
      f.data.every((d) => d.host === 'animaldex-web.pages.dev')
    );
    const custom = filters.filter((f: { data: Array<{ host: string }> }) =>
      f.data.every((d) => d.host === 'animaldex.com' || d.host === 'www.animaldex.com')
    );
    assert.equal(pages.length >= 2, true);
    assert.equal(custom.length >= 2, true);
    assert.equal(
      filters.every((f: { autoVerify: boolean }) => f.autoVerify === true),
      true
    );
  });
});
