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
  GUEST_ADOPTION_TTL_MS,
  adoptionPostState,
  adoptionRemainingLabel,
  buildManageFragment,
  canPauseAdoptionPost,
  canRenewAdoptionPost,
  canResumeAdoptionPost,
  parseManageFragment,
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
    assert.equal(resolveAdoptionPath(['adopciones', 'saltacapital', 'gestionar'])?.screen, 'AdoptionManage');
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
    assert.equal(GUEST_ADOPTION_TTL_MS, 7 * DAY);
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

  it('las publicaciones sin cuenta no se renuevan ni se pausan', () => {
    const guest = { status: 'active', expiresAt: now - 1, isGuest: true };
    assert.equal(canRenewAdoptionPost(guest, now), false);
    assert.equal(canPauseAdoptionPost({ ...guest, expiresAt: now + DAY }, now), false);
  });
});

describe('enlace privado de gestión', () => {
  const token = 'a'.repeat(43);

  it('ida y vuelta del fragmento', () => {
    const frag = buildManageFragment('alert-1-abc', token);
    assert.deepEqual(parseManageFragment(`#${frag}`), { alertId: 'alert-1-abc', token });
  });

  it('rechaza fragmentos incompletos o con caracteres inválidos', () => {
    assert.equal(parseManageFragment(''), null);
    assert.equal(parseManageFragment('#alert-1'), null);
    assert.equal(parseManageFragment('#alert-1.corto'), null);
    assert.equal(parseManageFragment(`#alert 1.${token}`), null);
  });
});

describe('Worker: publicaciones sobre alerts', () => {
  const mod = read('worker/adoptionPosts.js');
  const worker = read('worker/index.js');

  it('no ejecuta ALTER TABLE', () => {
    assert.doesNotMatch(mod, /ALTER TABLE/);
  });

  it('guarda solo el hash del token y lo compara en tiempo constante', () => {
    assert.match(mod, /sha256Hex\(manageToken\)/);
    assert.match(mod, /timingSafeEqual/);
    assert.doesNotMatch(mod, /token_hash: manageToken/);
  });

  it('la visibilidad solo se agrega cuando existen las columnas', () => {
    assert.match(mod, /if \(!\(await adoptionLifecycleReady\(env\)\)\) return \{ sql: '', values: \[\] \}/);
    assert.match(worker, /alertVisibilitySql\(env, 'a', now\)/);
  });

  it('la limpieza programada solo toca publicaciones sin cuenta de adopción', () => {
    assert.match(mod, /WHERE is_guest = 1 AND type = 'adoption' AND expires_at IS NOT NULL AND expires_at <= \?/);
    assert.match(worker, /cleanupExpiredGuestAdoptions\(env, adoptionDeps\(\), nowMs\)/);
  });

  it('alertRow no expone la identidad interna de una publicación sin cuenta', () => {
    assert.match(worker, /userId: isGuest \? 'guest' : r\.user_id/);
  });

  it('createAlert (Android) no cambia', () => {
    assert.doesNotMatch(worker.slice(worker.indexOf("action === 'createAlert'"), worker.indexOf("action === 'myAlerts'")), /media_kind|is_guest/);
  });
});
