import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { resolveAppLink } from '../lib/appLinks.ts';
import { isReservedPublicUsername } from '../lib/publicHandles.ts';
import { isPublicLegalPath, legalPageAssetPath } from '../lib/legalPages.ts';
import { getStateFromPublicPath, isWebRootPath, setLinkingHasUser } from '../lib/webLinking.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const privacy = read('web/legal/privacidad/index.html');
const deletion = read('web/legal/eliminar-cuenta/index.html');
const css = read('web/legal/legal.css');
const pages = read('cf-pages-worker.src.js');
const deploy = read('scripts/deploy-cf-pages.sh');
const copy = read('scripts/copy-legal-pages.sh');
const workerApi = read('worker/index.js');
const app = read('App.tsx');

describe('páginas legales públicas Play', () => {
  it('archivos HTML existen y no son PDF', () => {
    assert.equal(existsSync(join(root, 'web/legal/privacidad/index.html')), true);
    assert.equal(existsSync(join(root, 'web/legal/eliminar-cuenta/index.html')), true);
    assert.equal(existsSync(join(root, 'web/legal/legal.css')), true);
    assert.equal(existsSync(join(root, 'web/legal/assets/animaldex-logo-mark.png')), true);
    assert.match(privacy, /<!DOCTYPE html>/i);
    assert.match(deletion, /<!DOCTYPE html>/i);
    assert.doesNotMatch(privacy, /\.pdf/i);
    assert.doesNotMatch(deletion, /\.pdf/i);
  });

  it('/privacidad es la Política de Privacidad de Animaldex', () => {
    assert.match(privacy, /<title>Política de Privacidad de Animaldex<\/title>/);
    assert.match(privacy, /Última actualización: septiembre de 2026/);
    assert.match(privacy, /1\. Introducción/);
    assert.match(privacy, /2\. Información que puede recopilar Animaldex/);
    assert.match(privacy, /Información de cuenta/i);
    assert.match(privacy, /Información publicada por el usuario/i);
    assert.match(privacy, /Información sobre mascotas/i);
    assert.match(privacy, /Ubicación/);
    assert.match(privacy, /Fotografías, cámara y archivos/);
    assert.match(privacy, /3\. Cómo utilizamos la información/);
    assert.match(privacy, /4\. Contenido público/);
    assert.match(privacy, /5\. Compartición y proveedores tecnológicos/);
    assert.match(privacy, /Animaldex no vende los datos personales/);
    assert.match(privacy, /6\. Publicidad/);
    assert.match(privacy, /7\. Seguridad/);
    assert.match(privacy, /8\. Conservación de datos/);
    assert.match(privacy, /9\. Eliminación de cuenta y datos/);
    assert.match(privacy, /10\. Permisos del dispositivo/);
    assert.match(privacy, /11\. Menores/);
    assert.match(privacy, /12\. Cambios en esta política/);
    assert.match(privacy, /13\. Contacto/);
    assert.match(privacy, /Animaldex/);
    assert.match(privacy, /Argentina/);
    assert.match(privacy, /href="\/eliminar-cuenta"/);
    assert.match(privacy, /Solicitar eliminación de cuenta/);
    assert.match(privacy, /canonical" href="https:\/\/animaldex\.com\/privacidad"/);
    assert.doesNotMatch(privacy, /COPPA|menores de 13|no permitimos menores/);
  });

  it('/eliminar-cuenta explica la solicitud sin fingir borrado', () => {
    assert.match(deletion, /<title>Eliminar cuenta de Animaldex<\/title>/);
    assert.match(deletion, /Podés solicitar la eliminación permanente de tu cuenta de Animaldex y de los datos asociados/);
    assert.match(deletion, /Identificá la cuenta/);
    assert.match(deletion, /Solicitá la eliminación/);
    assert.match(deletion, /Animaldex procesará la solicitud/);
    assert.match(deletion, /Se eliminarán la cuenta y los datos asociados/);
    assert.match(deletion, /href="\/privacidad"/);
    assert.match(deletion, /Política de Privacidad/);
    assert.match(deletion, /no elimina la cuenta al instante ni simula que ya fue borrada/);
    assert.doesNotMatch(deletion, /fetch\(|\/api\/|createAlert|deleteAccount/);
    assert.doesNotMatch(deletion, /Tu cuenta fue eliminada|cuenta eliminada con éxito/i);
  });

  it('diseño Animaldex local, sin servicios externos', () => {
    assert.match(css, /#fff9f2/i);
    assert.match(css, /#ff6b4a/i);
    assert.match(privacy, /animaldex-logo-mark\.png/);
    assert.match(deletion, /animaldex-logo-mark\.png/);
    assert.doesNotMatch(privacy, /fonts\.google|googleapis|gstatic|cdn\.jsdelivr|unpkg|canva/i);
    assert.doesNotMatch(deletion, /fonts\.google|googleapis|gstatic|cdn\.jsdelivr|unpkg|canva/i);
    assert.doesNotMatch(privacy, /mailto:/i);
    assert.doesNotMatch(deletion, /mailto:/i);
  });

  it('Pages intercepta las URLs antes de OG y de la SPA', () => {
    assert.match(pages, /function legalPageAssetPath/);
    assert.match(pages, /p === '\/privacidad'/);
    assert.match(pages, /p === '\/eliminar-cuenta'/);
    const legalIdx = pages.indexOf('legalPageAssetPath(url.pathname)');
    const botIdx = pages.indexOf('BOT_RE.test(ua)');
    const spaIdx = pages.indexOf("env.ASSETS.fetch(new Request(indexUrl.toString(), request))");
    assert.ok(legalIdx > 0 && legalIdx < botIdx);
    assert.ok(botIdx < spaIdx);
    assert.match(pages, /'privacidad'/);
    assert.match(deploy, /copy-legal-pages\.sh/);
    assert.match(copy, /dist\/privacidad\/index.html/);
    assert.match(copy, /dist\/eliminar-cuenta\/index.html/);
  });

  it('no caen a mascota, QR, Auth ni username', () => {
    assert.equal(isPublicLegalPath('/privacidad'), true);
    assert.equal(isPublicLegalPath('/privacidad/'), true);
    assert.equal(isPublicLegalPath('/eliminar-cuenta?x=1'), true);
    assert.equal(isPublicLegalPath('/nina.pet'), false);
    assert.equal(legalPageAssetPath('/privacidad/'), '/privacidad/index.html');
    assert.equal(legalPageAssetPath('/eliminar-cuenta'), '/eliminar-cuenta/index.html');
    assert.equal(isReservedPublicUsername('privacidad'), true);
    assert.equal(resolveAppLink('https://animaldex.com/privacidad'), null);
    assert.equal(resolveAppLink('https://animaldex.com/eliminar-cuenta'), null);
    assert.equal(resolveAppLink('https://animaldex.com/nina.pet')?.screen, 'PetProfile');
    assert.equal(isWebRootPath('/privacidad'), false);
    setLinkingHasUser(false);
    const guestRoot = getStateFromPublicPath('/');
    assert.deepEqual(guestRoot.routes.map((r: { name: string }) => r.name), ['Auth']);
    const legalState = getStateFromPublicPath('/privacidad');
    assert.equal(legalState, null);
    assert.doesNotMatch(JSON.stringify(legalState), /PetProfile|TagWelcome/);
    assert.match(app, /getStateFromPublicPath/);
  });

  it('no toca Worker API, D1 ni endpoints inventados', () => {
    assert.doesNotMatch(workerApi, /eliminar-cuenta|legalPageAssetPath/);
    assert.doesNotMatch(pages, /env\.DB|d1Query\(env.*eliminar/);
    assert.doesNotMatch(deletion, /action:\s*'delete/);
  });

  it('copy-legal-pages.sh deja los HTML en dist/', () => {
    const result = spawnSync('bash', [join(root, 'scripts/copy-legal-pages.sh')], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(existsSync(join(root, 'dist/privacidad/index.html')), true);
    assert.equal(existsSync(join(root, 'dist/eliminar-cuenta/index.html')), true);
    assert.equal(existsSync(join(root, 'dist/legal/legal.css')), true);
    assert.equal(existsSync(join(root, 'dist/legal/animaldex-logo-mark.png')), true);
    assert.match(read('dist/privacidad/index.html'), /Política de Privacidad de Animaldex/);
  });
});
