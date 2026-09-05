import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { APP_LINK_HTTPS_HOSTS, APP_LINK_PREFIXES, resolveAppLink } from '../lib/appLinks.ts';
import { adoptionInquiryMessage } from '../lib/adoptionContact.ts';
import { petCanonicalPath } from '../lib/petHandles.ts';
import {
  ACCEPTED_PUBLIC_WEB_HOSTS,
  generatesWww,
  isAcceptedPublicWebHost,
  isGeneratedPublicUrl,
  LEGACY_WEB_ORIGIN,
  PUBLIC_WEB_HOST,
  PUBLIC_WEB_ORIGIN,
  publicWebUrl,
} from '../lib/publicWeb.ts';
import { extractTagCode } from '../lib/tags.ts';
import { APP_WEB_ORIGIN, buildTagUrl } from '../lib/tags.ts';
import { resolveScannedValue } from '../lib/qr.ts';
import { reelActivityAbsoluteUrl, reelIdFromActivityUrl } from '../lib/reelActivity.ts';
import { reelShareUrl } from '../lib/reels.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const appJson = JSON.parse(read('app.json'));
const pages = read('cf-pages-worker.src.js');
const share = read('lib/share.ts');
const db = read('lib/db.ts');
const api = read('lib/api.ts');
const worker = read('worker/index.js');
const stories = read('lib/stories.ts');
const storiesScreen = read('screens/StoryViewerScreen.tsx');
const qr = read('lib/qr.ts');
const transfer = read('lib/petTransfer.ts');
const feed = read('screens/FeedScreen.tsx');
const alerts = read('lib/alerts.ts');
const admin = read('screens/AdminTagsScreen.tsx');
const editProfile = read('screens/EditProfileScreen.tsx');

const EAS_SHA = 'AF:CE:8E:B1:04:D3:4C:6F:DF:61:C3:5F:15:73:3D:58:D9:F3:AE:90:41:2F:BA:BE:0C:FC:FB:C9:C0:C5:17:E6';
const PLAY_SHA = '9D:2A:54:C2:2D:DA:99:C0:39:BB:A2:73:B5:B3:8A:80:2D:22:05:D8:E2:7B:1D:6C:20:30:F9:58:51:8B:44:46';
const PLAY_DEVICE_SHA = '6B:C8:C8:C8:84:F6:8A:46:8E:F6:BA:A2:AB:5D:D1:FF:FB:DC:90:EF:A6:BE:12:20:C4:F1:C2:69:94:45:74:F3';

function parseAssetLinksFromSource(src: string) {
  const start = src.indexOf('const ASSETLINKS_JSON = JSON.stringify(');
  assert.notEqual(start, -1);
  const open = src.indexOf('[', start);
  const close = src.indexOf(']);', open);
  return Function(`"use strict"; return (${src.slice(open, close + 1)});`)();
}

describe('dominio público oficial animaldex.com', () => {
  it('1. nuevo QR usa https://animaldex.com?qr=AAA123', () => {
    assert.equal(PUBLIC_WEB_ORIGIN, 'https://animaldex.com');
    assert.equal(APP_WEB_ORIGIN, PUBLIC_WEB_ORIGIN);
    assert.equal(buildTagUrl('AAA123'), 'https://animaldex.com?qr=AAA123');
    assert.equal(publicWebUrl('?qr=AAA123'), 'https://animaldex.com?qr=AAA123');
    assert.match(admin, /buildTagUrl\(newCode\)/);
    assert.match(admin, /Link generado correctamente/);
  });

  it('2. legacy pages.dev QR sigue siendo reconocido', () => {
    assert.equal(extractTagCode('https://animaldex-web.pages.dev?qr=AAA123'), 'AAA123');
    assert.equal(extractTagCode('https://animaldex-web.pages.dev/?qr=17'), '17');
    assert.equal(resolveScannedValue('https://animaldex-web.pages.dev?qr=17').kind, 'tag');
    assert.equal(resolveScannedValue('https://animaldex.com?qr=AAA123').kind, 'tag');
    assert.equal(LEGACY_WEB_ORIGIN, 'https://animaldex-web.pages.dev');
  });

  it('3. canonical .pet usa animaldex.com', () => {
    assert.equal(petCanonicalPath('nina.pet'), '/nina.pet');
    assert.equal(publicWebUrl(petCanonicalPath('luchi.pet')), 'https://animaldex.com/luchi.pet');
    assert.equal(publicWebUrl(petCanonicalPath('nina.pet')), 'https://animaldex.com/nina.pet');
    assert.match(share, /petProfileShareUrl/);
    assert.match(share, /siteOrigin\(\)/);
    assert.match(share, /PUBLIC_WEB_ORIGIN/);
  });

  it('4. /pet/:id intacto', () => {
    assert.equal(petCanonicalPath('pet-99'), '/pet/pet-99');
    assert.equal(publicWebUrl('/pet/pet-99'), 'https://animaldex.com/pet/pet-99');
    assert.deepEqual(resolveAppLink('https://animaldex.com/pet/pet-99'), {
      screen: 'PetProfile',
      params: { petId: 'pet-99' },
    });
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/pet/pet-99'), {
      screen: 'PetProfile',
      params: { petId: 'pet-99' },
    });
    assert.equal(resolveScannedValue('https://animaldex-web.pages.dev/pet/pet-99').kind, 'pet');
  });

  it('5. perfil personal usa animaldex.com', () => {
    assert.equal(publicWebUrl('/lucasfuentes'), 'https://animaldex.com/lucasfuentes');
    assert.deepEqual(resolveAppLink('https://animaldex.com/lucasfuentes'), {
      screen: 'PublicProfile',
      params: { username: 'lucasfuentes' },
    });
    assert.match(editProfile, /PUBLIC_WEB_HOST/);
    assert.doesNotMatch(editProfile, /animaldex-web\.pages\.dev/);
  });

  it('6. Página usa animaldex.com', () => {
    assert.equal(publicWebUrl('/apansalta'), 'https://animaldex.com/apansalta');
    assert.deepEqual(resolveAppLink('https://animaldex.com/apansalta'), {
      screen: 'PublicProfile',
      params: { username: 'apansalta' },
    });
    assert.match(adoptionInquiryMessage('Good', 'good.pet'), /https:\/\/animaldex\.com\/good\.pet/);
  });

  it('7. /p/ share usa animaldex.com', () => {
    assert.equal(publicWebUrl('/p/post-abc'), 'https://animaldex.com/p/post-abc');
    assert.match(share, /\/p\/\$\{params\.postId\}/);
    assert.deepEqual(resolveAppLink('https://animaldex.com/p/post-abc'), {
      screen: 'PostDetail',
      params: { postId: 'post-abc' },
    });
  });

  it('8. /a/ share usa animaldex.com', () => {
    assert.equal(publicWebUrl('/a/alert-1'), 'https://animaldex.com/a/alert-1');
    assert.match(share, /\/a\/\$\{alertId\}/);
    assert.deepEqual(resolveAppLink('https://animaldex.com/a/alert-1'), {
      screen: 'AlertDetail',
      params: { alertId: 'alert-1' },
    });
  });

  it('9. OG usa animaldex.com', () => {
    assert.match(pages, /const PUBLIC_WEB_ORIGIN = 'https:\/\/animaldex\.com'/);
    assert.match(pages, /const origin = PUBLIC_WEB_ORIGIN/);
    assert.match(pages, /<link rel="canonical" href="\$\{esc\(url\)\}" \/>/);
    assert.match(pages, /<link rel="canonical" href="\$\{esc\(meta\.url\)\}" \/>/);
    assert.match(pages, /property="og:url"/);
    assert.doesNotMatch(pages, /const origin = url\.origin/);
  });

  it('10. /m/ usa animaldex.com', () => {
    assert.equal(publicWebUrl('/m/listing-7'), 'https://animaldex.com/m/listing-7');
    assert.match(share, /\/m\/\$\{listingId\}/);
    assert.deepEqual(resolveAppLink('https://animaldex.com/m/listing-7'), {
      screen: 'ListingDetail',
      params: { listingId: 'listing-7' },
    });
  });

  it('11. /r/ usa animaldex.com', () => {
    assert.equal(reelShareUrl('reel-9'), 'https://animaldex.com/r/reel-9');
    assert.equal(reelActivityAbsoluteUrl('reel-1'), 'https://animaldex.com/r/reel-1');
    assert.equal(reelIdFromActivityUrl('https://animaldex-web.pages.dev/r/reel-1'), 'reel-1');
    assert.deepEqual(resolveAppLink('https://animaldex.com/r/reel-9'), {
      screen: 'ReelViewer',
      params: { reelId: 'reel-9' },
    });
  });

  it('12. app nunca genera www', () => {
    const generated = [
      PUBLIC_WEB_ORIGIN,
      publicWebUrl('?qr=AAA123'),
      publicWebUrl('/nina.pet'),
      publicWebUrl('/lucasfuentes'),
      publicWebUrl('/p/1'),
      publicWebUrl('/a/1'),
      publicWebUrl('/m/1'),
      reelShareUrl('1'),
      adoptionInquiryMessage('Nala', 'nala.pet'),
    ];
    for (const url of generated) {
      assert.equal(generatesWww(url), false);
      assert.doesNotMatch(String(url), /www\.animaldex\.com/);
    }
    assert.equal(PUBLIC_WEB_HOST, 'animaldex.com');
  });

  it('13. API host SIGUE workers.dev', () => {
    assert.match(db, /export const API_ORIGIN = 'https:\/\/animaldex-api\.animaldex-api\.workers\.dev'/);
    assert.match(api, /API_ORIGIN/);
    assert.doesNotMatch(db, /api\.animaldex\.com/);
    assert.doesNotMatch(api, /api\.animaldex\.com/);
    assert.doesNotMatch(worker, /api\.animaldex\.com/);
  });

  it('14. legacy host permanece en App Links', () => {
    assert.equal(APP_LINK_PREFIXES.includes(LEGACY_WEB_ORIGIN), true);
    assert.equal(APP_LINK_HTTPS_HOSTS.includes('animaldex-web.pages.dev'), true);
    const hosts = [
      ...new Set(
        appJson.expo.android.intentFilters.flatMap((f: { data: Array<{ host: string }> }) =>
          f.data.map((d) => d.host)
        )
      ),
    ];
    assert.equal(hosts.includes('animaldex-web.pages.dev'), true);
  });

  it('15. animaldex.com agregado sin eliminar legacy', () => {
    assert.equal(APP_LINK_PREFIXES.includes(PUBLIC_WEB_ORIGIN), true);
    assert.equal(APP_LINK_HTTPS_HOSTS.includes('animaldex.com'), true);
    const serialized = JSON.stringify(appJson.expo.android.intentFilters);
    assert.match(serialized, /animaldex-web\.pages\.dev/);
    assert.match(serialized, /"host":"animaldex\.com"/);
    assert.deepEqual([...ACCEPTED_PUBLIC_WEB_HOSTS], [
      'animaldex.com',
      'animaldex-web.pages.dev',
      'www.animaldex.com',
    ]);
  });

  it('16. assetlinks package correcto', () => {
    const statements = parseAssetLinksFromSource(pages);
    assert.equal(statements[0].target.package_name, 'com.lucasap123.animaldex');
    assert.equal(appJson.expo.android.package, 'com.lucasap123.animaldex');
    assert.match(pages, /\/\.well-known\/assetlinks\.json/);
  });

  it('17. fingerprints existentes intactos', () => {
    const fps = parseAssetLinksFromSource(pages)[0].target.sha256_cert_fingerprints;
    assert.deepEqual(fps, [EAS_SHA, PLAY_SHA, PLAY_DEVICE_SHA]);
  });

  it('18. Stories V8 no inventan URL pública', () => {
    assert.doesNotMatch(stories, /animaldex-web\.pages\.dev/);
    assert.doesNotMatch(stories, /PUBLIC_WEB_ORIGIN|publicWebUrl/);
    assert.doesNotMatch(stories, /\/s\/\$\{/);
    assert.doesNotMatch(storiesScreen, /Share\.share/);
    assert.match(stories, /STORY_HOLD_MIN_DURATION_MS|storyExpiresAt|STORY_TTL_MS/);
  });

  it('19. QR association intacta', () => {
    assert.match(qr, /\?qr=/);
    assert.match(qr, /kind: 'tag'/);
    assert.equal(resolveScannedValue('https://animaldex.com?qr=AAA123').kind, 'tag');
    assert.equal(resolveScannedValue('https://animaldex-web.pages.dev?qr=AAA123').kind, 'tag');
  });

  it('20. transferencias intactas', () => {
    assert.match(transfer, /PET_TRANSFER_STALE|countsAsPageAdoption|transferRequestedCopy/);
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/transfer/ptr-9'), {
      screen: 'PetTransferRequest',
      params: { requestId: 'ptr-9' },
    });
    assert.deepEqual(resolveAppLink('https://animaldex.com/transfer/ptr-9'), {
      screen: 'PetTransferRequest',
      params: { requestId: 'ptr-9' },
    });
  });

  it('21. .pet intacto', () => {
    assert.equal(petCanonicalPath('nina.pet'), '/nina.pet');
    assert.deepEqual(resolveAppLink('https://animaldex.com/nina.pet'), {
      screen: 'PetProfile',
      params: { petId: 'nina.pet' },
    });
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/nina.pet'), {
      screen: 'PetProfile',
      params: { petId: 'nina.pet' },
    });
  });

  it('22. Alertas intactas', () => {
    assert.match(alerts, /alertShareMeta/);
    assert.match(share, /export function alertShareUrl/);
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/a/alert-1'), {
      screen: 'AlertDetail',
      params: { alertId: 'alert-1' },
    });
  });

  it('23. Feed intacto', () => {
    assert.match(feed, /animaldex-logo-mark\.png/);
    assert.doesNotMatch(feed, /www\.animaldex\.com/);
    assert.doesNotMatch(worker, /animaldex-web\.pages\.dev/);
    assert.doesNotMatch(worker, /api\.animaldex\.com/);
  });
});

describe('helpers y hosts aceptados', () => {
  it('publicWebUrl no genera www y marca URLs oficiales', () => {
    assert.equal(publicWebUrl(''), PUBLIC_WEB_ORIGIN);
    assert.equal(publicWebUrl('/'), PUBLIC_WEB_ORIGIN);
    assert.equal(publicWebUrl('p/x'), 'https://animaldex.com/p/x');
    assert.equal(isGeneratedPublicUrl('https://animaldex.com/p/x'), true);
    assert.equal(isGeneratedPublicUrl('https://animaldex-web.pages.dev/p/x'), false);
    assert.equal(isGeneratedPublicUrl('https://www.animaldex.com/p/x'), false);
    assert.equal(isAcceptedPublicWebHost('animaldex.com'), true);
    assert.equal(isAcceptedPublicWebHost('animaldex-web.pages.dev'), true);
    assert.equal(isAcceptedPublicWebHost('www.animaldex.com'), true);
    assert.equal(isAcceptedPublicWebHost('otro.com'), false);
  });
});
