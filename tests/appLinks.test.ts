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
const pagesWorker = readFileSync(join(root, 'cf-pages-worker.src.js'), 'utf8');

afterEach(() => {
  clearPendingAppLink();
});

const HOSTS = ['https://animaldex-web.pages.dev'];
const SHA_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const EAS_SHA = 'AF:CE:8E:B1:04:D3:4C:6F:DF:61:C3:5F:15:73:3D:58:D9:F3:AE:90:41:2F:BA:BE:0C:FC:FB:C9:C0:C5:17:E6';
const PLAY_SHA = '9D:2A:54:C2:2D:DA:99:C0:39:BB:A2:73:B5:B3:8A:80:2D:22:05:D8:E2:7B:1D:6C:20:30:F9:58:51:8B:44:46';
const PLAY_DEVICE_SHA = '6B:C8:C8:C8:84:F6:8A:46:8E:F6:BA:A2:AB:5D:D1:FF:FB:DC:90:EF:A6:BE:12:20:C4:F1:C2:69:94:45:74:F3';

function parseAssetLinksFromSource(src: string) {
  const start = src.indexOf('const ASSETLINKS_JSON = JSON.stringify(');
  assert.notEqual(start, -1);
  const open = src.indexOf('[', start);
  const close = src.indexOf(']);', open);
  const literal = src.slice(open, close + 1);
  return Function(`"use strict"; return (${literal});`)();
}

describe('resolveAppLink: recursos públicos pages.dev', () => {
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
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/p/post-abc?d=xyz'), {
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

  it('reel /r/:id → ReelViewer', () => {
    for (const host of HOSTS) {
      assert.deepEqual(resolveAppLink(`${host}/r/reel-1`), {
        screen: 'ReelViewer',
        params: { reelId: 'reel-1' },
      });
    }
    assert.deepEqual(resolveAppLink('animaldex://r/reel-1'), {
      screen: 'ReelViewer',
      params: { reelId: 'reel-1' },
    });
  });

  it('mercado /m/:id → ListingDetail', () => {
    for (const host of HOSTS) {
      assert.deepEqual(resolveAppLink(`${host}/m/listing-7`), {
        screen: 'ListingDetail',
        params: { listingId: 'listing-7' },
      });
    }
  });

  it('mascota /nina.pet → PetProfile (no PublicProfile)', () => {
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/nina.pet'), {
      screen: 'PetProfile',
      params: { petId: 'nina.pet' },
    });
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/toby.pet/'), {
      screen: 'PetProfile',
      params: { petId: 'toby.pet' },
    });
    assert.deepEqual(resolveAppLink('animaldex://nina.pet'), {
      screen: 'PetProfile',
      params: { petId: 'nina.pet' },
    });
  });

  it('usuario / empresa / refugio /:username → PublicProfile', () => {
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/lucasfuentes'), {
      screen: 'PublicProfile',
      params: { username: 'lucasfuentes' },
    });
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/TiendaLuna'), {
      screen: 'PublicProfile',
      params: { username: 'tiendaluna' },
    });
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/abdulprotege/'), {
      screen: 'PublicProfile',
      params: { username: 'abdulprotege' },
    });
  });

  it('no trata rutas reservadas como username ni otros hosts', () => {
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/reels'), {
      screen: 'Tabs',
      params: { screen: 'Reels' },
    });
    assert.equal(resolveAppLink('https://animaldex-web.pages.dev/entrar'), null);
    assert.equal(resolveAppLink('https://otro-dominio.com/p/x'), null);
    assert.equal(resolveAppLink('https://animaldex.com/p/post-abc'), null);
    assert.equal(resolveAppLink('https://www.animaldex.com/lucasfuentes'), null);
  });
});

describe('cola cold start / background / foreground', () => {
  it('cold start espera authReady y luego navega PostDetail', () => {
    const calls: Array<{ name: string; params?: object }> = [];
    rememberIncomingAppLink('https://animaldex-web.pages.dev/p/post-cold');
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
    rememberIncomingAppLink('https://animaldex-web.pages.dev/actividad');
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
    rememberIncomingAppLink('https://animaldex-web.pages.dev/m/oferta-1');
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

describe('App.tsx y app.json solo pages.dev', () => {
  it('linking usa scheme + pages.dev y conserva las rutas públicas', () => {
    assert.match(app, /APP_LINK_PREFIXES/);
    assert.match(app, /prefixes: \[\.\.\.APP_LINK_PREFIXES\]/);
    assert.deepEqual([...APP_LINK_PREFIXES], ['animaldex://', 'https://animaldex-web.pages.dev']);
    assert.deepEqual([...APP_LINK_HTTPS_HOSTS], ['animaldex-web.pages.dev']);
    assert.match(app, /PostDetail: 'p\/:postId'/);
    assert.match(app, /PetProfile: 'pet\/:petId'/);
    assert.match(app, /AlertDetail: 'a\/:alertId'/);
    assert.match(app, /ListingDetail: 'm\/:listingId'/);
    assert.match(app, /ReelViewer: 'r\/:reelId'/);
    assert.match(app, /PublicProfile: ':username'/);
    assert.match(app, /function AppLinkHandler/);
    assert.match(app, /name="ListingDetail"/);
    assert.match(app, /getInitialURL/);
    assert.doesNotMatch(app, /animaldex\.com/);
  });

  it('intentFilters de pages.dev intactos y sin animaldex.com', () => {
    const filters = appJson.expo.android.intentFilters;
    const hosts = [
      ...new Set(filters.flatMap((f: { data: Array<{ host: string }> }) => f.data.map((d) => d.host))),
    ];
    assert.deepEqual(hosts, ['animaldex-web.pages.dev']);
    const serialized = JSON.stringify(filters);
    assert.match(serialized, /"pathPrefix":"\/p\/"/);
    assert.match(serialized, /"pathPrefix":"\/pet\/"/);
    assert.match(serialized, /"pathPrefix":"\/a\/"/);
    assert.match(serialized, /"pathPrefix":"\/m\/"/);
    assert.match(serialized, /"pathPrefix":"\/r\/"/);
    assert.match(serialized, /pathAdvancedPattern/);
    assert.doesNotMatch(serialized, /animaldex\.com/);
    assert.equal(filters.length, 2);
    assert.equal(
      filters.every((f: { autoVerify: boolean }) => f.autoVerify === true),
      true
    );
  });
});

describe('assetlinks.json propuesto (Pages, sin deploy)', () => {
  it('mismo package con SHA EAS, SHA Play Console y SHA del APK instalado', () => {
    const statements = parseAssetLinksFromSource(pagesWorker);
    assert.equal(Array.isArray(statements), true);
    assert.equal(statements.length, 1);
    const stmt = statements[0];
    assert.deepEqual(stmt.relation, ['delegate_permission/common.handle_all_urls']);
    assert.equal(stmt.target.namespace, 'android_app');
    assert.equal(stmt.target.package_name, 'com.lucasap123.animaldex');
    const fps: string[] = stmt.target.sha256_cert_fingerprints;
    assert.equal(fps.length, 3);
    for (const fp of fps) assert.match(fp, SHA_RE);
    assert.equal(fps[0], EAS_SHA);
    assert.equal(fps[1], PLAY_SHA);
    assert.equal(fps[2], PLAY_DEVICE_SHA);
    assert.equal(fps.includes(EAS_SHA), true);
    assert.equal(fps.includes(PLAY_DEVICE_SHA), true);
    assert.equal(new Set(fps).size, 3);
    JSON.parse(JSON.stringify(statements));
  });
});
