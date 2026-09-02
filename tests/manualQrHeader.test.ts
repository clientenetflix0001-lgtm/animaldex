import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APP_WEB_ORIGIN,
  TAG_CODE_INVALID,
  TAG_CODE_TAKEN,
  buildTagUrl,
  extractTagCode,
  parseIncomingTagCode,
  parseManualTagCode,
} from '../lib/tags.ts';
import { resolveScannedValue } from '../lib/qr.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
const admin = readFileSync(join(root, 'screens/AdminTagsScreen.tsx'), 'utf8');
const feed = readFileSync(join(root, 'screens/FeedScreen.tsx'), 'utf8');
const appJson = readFileSync(join(root, 'app.json'), 'utf8');
const pages = readFileSync(join(root, 'cf-pages-worker.src.js'), 'utf8');
const migration = readFileSync(join(root, 'migrations/009_pet_tag_public_code.sql'), 'utf8');

function action(name: string) {
  const start = worker.indexOf(`if (action === '${name}')`);
  assert.ok(start >= 0, name);
  const next = worker.indexOf('if (action ===', start + 10);
  return worker.slice(start, next > start ? next : undefined);
}

describe('QR código manual', () => {
  it('1. acepta AAA123', () => {
    assert.equal(parseManualTagCode('AAA123'), 'AAA123');
    assert.equal(buildTagUrl('AAA123'), 'https://animaldex-web.pages.dev?qr=AAA123');
  });

  it('2. acepta aaa123 y normaliza a AAA123', () => {
    assert.equal(parseManualTagCode('aaa123'), 'AAA123');
  });

  it('3. acepta números antiguos/nuevos', () => {
    assert.equal(parseManualTagCode('17'), '17');
    assert.equal(parseManualTagCode('999999'), '999999');
    assert.equal(parseIncomingTagCode('17'), '17');
    assert.equal(extractTagCode('https://animaldex-web.pages.dev?qr=17'), '17');
    assert.equal(extractTagCode('https://animaldex-web.pages.dev/?qr=1234'), '1234');
  });

  it('4. máximo 6', () => {
    assert.equal(parseManualTagCode('ABC123'), 'ABC123');
    assert.equal(parseManualTagCode('AAAAAA'), 'AAAAAA');
    assert.equal(parseManualTagCode('AAAAAAA'), null);
    assert.match(admin, /maxLength=\{6\}/);
  });

  it('5. rechaza símbolos', () => {
    assert.equal(parseManualTagCode('AAA-12'), null);
    assert.equal(parseManualTagCode('@PET1'), null);
    assert.equal(TAG_CODE_INVALID, 'El código debe tener hasta 6 letras o números.');
    assert.match(admin, /TAG_CODE_INVALID/);
  });

  it('6. rechaza espacios', () => {
    assert.equal(parseManualTagCode('ABC 12'), null);
  });

  it('7. rechaza >6 caracteres', () => {
    assert.equal(parseManualTagCode('1234567'), null);
    assert.equal(parseManualTagCode('PET0001'), null);
  });

  it('8. duplicado rechazado', () => {
    const create = action('createTag');
    assert.match(create, /TAG_CODE_TAKEN/);
    assert.match(create, /public_code = \? OR CAST\(code AS TEXT\) = \?/);
    assert.doesNotMatch(create, /nextCode \+ 1/);
    assert.equal(TAG_CODE_TAKEN, 'Este código QR ya está en uso.');
    assert.match(migration, /LOCAL ONLY/);
  });

  it('9. URL final correcta', () => {
    assert.equal(APP_WEB_ORIGIN, 'https://animaldex-web.pages.dev');
    assert.equal(buildTagUrl('AAA123'), 'https://animaldex-web.pages.dev?qr=AAA123');
    assert.equal(buildTagUrl('PET001'), 'https://animaldex-web.pages.dev?qr=PET001');
    assert.match(admin, /Link generado correctamente/);
    assert.doesNotMatch(admin, /animaldex\.com/);
  });

  it('10. QR numérico antiguo sigue funcionando', () => {
    const scanned = resolveScannedValue('https://animaldex-web.pages.dev/?qr=17');
    assert.equal(scanned.kind, 'tag');
    if (scanned.kind === 'tag') assert.equal(scanned.code, '17');
    assert.equal(extractTagCode('https://animaldex-web.pages.dev?qr=17'), '17');
    assert.match(action('tagStatus'), /CAST\(code AS TEXT\) = \? OR public_code = \?/);
    assert.match(action('claimTag'), /tags\[0\]\.code/);
    assert.match(action('createTag'), /MAX\(code\)/);
  });
});

describe('HEADER visual', () => {
  it('11. componente visual muestra NIMALDEX junto al logo', () => {
    assert.match(feed, /animaldex-logo-mark\.png/);
    assert.match(feed, />Nimaldex</);
    assert.doesNotMatch(feed, />Animaldex</);
  });

  it('12. nombre general de la marca sigue siendo ANIMALDEX', () => {
    assert.match(appJson, /"name": "Animaldex"/);
    const auth = readFileSync(join(root, 'screens/AuthScreen.tsx'), 'utf8');
    assert.match(auth, />Animaldex</);
  });

  it('13. metadata no cambia', () => {
    assert.match(appJson, /"name": "Animaldex"/);
    assert.doesNotMatch(pages, /Nimaldex/);
  });

  it('14. URLs no cambian', () => {
    assert.equal(APP_WEB_ORIGIN, 'https://animaldex-web.pages.dev');
    assert.match(pages, /animaldex-web\.pages\.dev|ANIMALDEX_OG_IMAGE/);
    assert.doesNotMatch(feed, /animaldex\.com/);
  });
});
