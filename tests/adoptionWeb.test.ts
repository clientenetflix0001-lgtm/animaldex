import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ADOPTION_LOCALITIES,
  adoptionLocalityBySlug,
  adoptionPostPath,
  resolveAdoptionPath,
} from '../lib/adoptionLocalities.ts';
import {
  ADOPTION_CYCLE_MS,
  adoptionPostState,
  adoptionRemainingLabel,
  canPauseAdoptionPost,
  canRenewAdoptionPost,
  canResumeAdoptionPost,
} from '../lib/adoptionLifecycle.ts';
import { isReservedPublicUsername } from '../lib/publicHandles.ts';
import { resolveAppLink } from '../lib/appLinks.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const DAY = 24 * 60 * 60 * 1000;

describe('localidades de Adopciones', () => {
  it('Salta Capital usa el placeId del catálogo', () => {
    const p = adoptionLocalityBySlug('saltacapital');
    assert.equal(p?.placeId, 'AR:georef:66028050');
    assert.equal(p?.locality, 'Salta Capital');
    assert.equal(ADOPTION_LOCALITIES.length, 1);
  });

  it('resuelve muro, detalle y subrutas', () => {
    assert.deepEqual(resolveAdoptionPath(['adopciones', 'saltacapital']), {
      screen: 'AdoptionsWall',
      params: { city: 'saltacapital' },
    });
    assert.deepEqual(resolveAdoptionPath(['adopciones', 'saltacapital', 'alert-1-abc']), {
      screen: 'AdoptionPost',
      params: { city: 'saltacapital', alertId: 'alert-1-abc' },
    });
    assert.equal(resolveAdoptionPath(['adopciones', 'saltacapital', 'publicar'])?.screen, 'AdoptionPublish');
    assert.equal(resolveAdoptionPath(['adopciones', 'saltacapital', 'mis-publicaciones'])?.screen, 'AdoptionMine');
    assert.equal(resolveAdoptionPath(['adopciones', 'saltacapital', 'gestionar'])?.screen, 'AdoptionsWall');
    assert.equal(resolveAdoptionPath(['adopciones', 'cordoba']), null);
    assert.equal(adoptionPostPath('saltacapital', 'alert-1'), '/adopciones/saltacapital/alert-1');
  });

  it('"adopciones" está reservado y no se resuelve como perfil ni App Link', () => {
    assert.equal(isReservedPublicUsername('adopciones'), true);
    assert.equal(resolveAppLink('https://animaldex.com/adopciones'), null);
    assert.match(read('worker/index.js'), /'adopciones'/);
    assert.match(read('cf-pages-worker.src.js'), /'adopciones'/);
  });

  it('las rutas de adopciones son solo web', () => {
    const app = read('App.tsx');
    assert.match(app, /Platform\.OS === 'web' \? ADOPTION_WEB_SCREENS : \{\}/);
    assert.match(app, /if \(Platform\.OS !== 'web'\) return null;/);
  });
});

describe('ciclo de vida', () => {
  const now = 1_000 * DAY;

  it('filas antiguas (sin expires_at) no vencen', () => {
    assert.equal(adoptionPostState({ status: 'active', expiresAt: null }, now), 'active');
    assert.equal(adoptionRemainingLabel({ expiresAt: null }, now), 'Sin vencimiento');
    assert.equal(canRenewAdoptionPost({ expiresAt: null }, now), false);
  });

  it('7 días, pausa y renovación de usuarios registrados', () => {
    assert.equal(ADOPTION_CYCLE_MS, 7 * DAY);
    const active = { status: 'active', expiresAt: now + 3 * DAY, pausedAt: null };
    assert.equal(adoptionPostState(active, now), 'active');
    assert.equal(adoptionRemainingLabel(active, now), 'Quedan 3 días');
    assert.equal(canPauseAdoptionPost(active, now), true);
    assert.equal(canRenewAdoptionPost(active, now), false);
    const paused = { ...active, pausedAt: now - DAY };
    assert.equal(adoptionPostState(paused, now), 'paused');
    assert.equal(canResumeAdoptionPost(paused, now), true);
    const expired = { status: 'active', expiresAt: now - 1, pausedAt: null };
    assert.equal(adoptionPostState(expired, now), 'expired');
    assert.equal(canRenewAdoptionPost(expired, now), true);
  });

  it('una fila antigua activa no se puede pausar desde esta sección', () => {
    assert.equal(canPauseAdoptionPost({ status: 'active', expiresAt: null }, now), false);
  });
});

describe('Worker: publicaciones sobre alerts', () => {
  const mod = read('worker/adoptionPosts.js');
  const worker = read('worker/index.js');

  it('no ejecuta ALTER TABLE', () => {
    assert.doesNotMatch(mod, /ALTER TABLE/);
  });

  it('publicar exige sesión y no existe el camino sin cuenta', () => {
    const pub = mod.slice(mod.indexOf('export async function handlePublicAdoptionAction'), mod.indexOf('export async function handleAuthAdoptionAction'));
    const auth = mod.slice(mod.indexOf('export async function handleAuthAdoptionAction'));
    assert.doesNotMatch(pub, /createAdoptionPost|guestAdoption|turnstile|is_guest/);
    assert.match(auth, /action === 'createAdoptionPost'/);
    assert.match(auth, /Iniciá sesión para publicar/);
    assert.doesNotMatch(mod, /guest:|adoption_guest|turnstile|is_guest/);
    assert.doesNotMatch(read('App.tsx'), /AdoptionManage/);
    assert.doesNotMatch(read('lib/db.ts'), /guestAdoption|turnstileToken/);
  });

  it('la visibilidad solo se agrega cuando existen las columnas', () => {
    assert.match(mod, /if \(!\(await adoptionLifecycleReady\(env\)\)\) return \{ sql: '', values: \[\] \}/);
    assert.match(worker, /alertVisibilitySql\(env, 'a', now\)/);
  });

  it('el vencimiento oculta en el listado y no borra la publicación', () => {
    assert.match(mod, /expires_at IS NULL OR \$\{alias\}\.expires_at > \?/);
    assert.doesNotMatch(mod, /cleanupExpiredGuestAdoptions/);
    assert.doesNotMatch(worker, /cleanupExpiredGuestAdoptions/);
  });

  it('una imagen se borra solo si ninguna alerta ni post la usa', () => {
    assert.match(mod, /SELECT image FROM alerts WHERE image IN/);
    assert.match(mod, /SELECT image FROM posts WHERE image IN/);
  });

  it('la imagen queda registrada en la misma transacción que borra la publicación', () => {
    const body = mod.slice(mod.indexOf('async function deleteAdoptionRows'));
    const batchAt = body.indexOf('await env.DB.batch(statements)');
    const insertAt = body.indexOf('pendingImageStatement(env, image, now)');
    assert.ok(insertAt > 0 && batchAt > insertAt);
    assert.match(mod, /INSERT INTO \$\{IMAGE_DELETE_TABLE\}/);
    assert.match(mod, /adoption_image_deletions/);
  });

  it('un fallo de Cloudflare conserva la tarea, revisa resp.ok y no reintenta en la misma pasada', () => {
    assert.match(mod, /resp\.status === 404/);
    assert.match(mod, /!resp\.ok/);
    assert.match(mod, /status = 'error'/);
    assert.match(mod, /imageDeleteBackoffMs\(row\.attempts\)/);
    assert.match(mod, /IMAGE_DELETE_MAX_ATTEMPTS/);
    assert.doesNotMatch(mod.slice(mod.indexOf('async function processImageDeletionPass'), mod.indexOf('export async function processPendingImageDeletions')), /for \(let attempt/);
  });

  it('el cron drena la cola de imágenes en lotes chicos', () => {
    assert.match(worker, /processPendingImageDeletions\(env, adoptionDeps\(\), nowMs, \{ maxPasses: 2, budgetMs: 4_000 \}\)/);
    assert.match(worker, /processPendingImageDeletions\(env, adoptionDeps\(\), nowMs, \{ maxPasses: 1, budgetMs: 4_000 \}\)/);
  });

  it('createAlert (Android) no cambia', () => {
    assert.doesNotMatch(worker.slice(worker.indexOf("action === 'createAlert'"), worker.indexOf("action === 'myAlerts'")), /media_kind|is_guest/);
  });
});
