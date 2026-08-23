import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SHARE_LOCATION_MAX,
  SHARE_LOCATION_WINDOW_MS,
  shareLocationLimited,
} from '../lib/shareLocationPolicy.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const screen = readFileSync(join(root, 'screens/PetProfileScreen.tsx'), 'utf8');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');

function shareLocationAction(src: string): string {
  const start = src.indexOf("if (action === 'shareLocation')");
  assert.ok(start >= 0, 'shareLocation action missing');
  const next = src.indexOf('if (action ===', start + 10);
  return src.slice(start, next > start ? next : undefined);
}

/** Modelo del lookup SQL: id interno o username → siempre pets.id */
function resolveSharePet(
  rows: Array<{ id: string; username: string; user_id: string }>,
  ref: string
) {
  const needle = String(ref || '').toLowerCase();
  return rows.find((p) => p.id === ref || p.username.toLowerCase() === needle) || null;
}

describe('PetProfileScreen envía el id interno', () => {
  it('shareMyLocation usa realPet.id y no route.params.petId', () => {
    assert.match(screen, /const internalId = realPet\?\.id/);
    assert.match(screen, /db\.shareLocation\(\s*internalId/);
    assert.doesNotMatch(screen, /db\.shareLocation\(\s*petId\s*,/);
    assert.match(screen, /disabled=\{sharingLocation \|\| locationDone \|\| \(!demoPet && !realPet\?\.id\)\}/);
    assert.match(screen, /Cargando perfil/);
  });

  it('no pide login solo para compartir ubicación (endpoint público)', () => {
    const start = screen.indexOf('const shareMyLocation');
    const end = screen.indexOf('}, [demoPet, realPet?.id, loading]');
    assert.ok(start >= 0 && end > start);
    const fn = screen.slice(start, end);
    assert.doesNotMatch(fn, /requireLogin/);
    assert.doesNotMatch(fn, /if \(guest\)/);
  });
});

describe('Worker shareLocation resuelve handle o id y persiste pet.id', () => {
  const action = shareLocationAction(worker);

  it('lookup acepta id o username, igual que petProfile', () => {
    assert.match(
      action,
      /SELECT id, name, user_id FROM pets WHERE id = \? OR LOWER\(username\) = LOWER\(\?\) LIMIT 1/
    );
    assert.match(action, /\[petRef, petRef\]/);
  });

  it('INSERT usa pet.id, no el handle recibido', () => {
    assert.match(action, /INSERT INTO location_shares[\s\S]*\[id, pet\.id, pet\.user_id/);
    assert.doesNotMatch(action, /\[id, petId,/);
    assert.doesNotMatch(action, /\[id, petRef,/);
  });

  it('dueño se toma de pets.user_id y la notificación une location_shares.pet_id = pets.id', () => {
    assert.match(action, /SELECT id, name, verified_phone FROM users WHERE id = \?[\s\S]*pet\.user_id/);
    assert.match(
      worker,
      /FROM location_shares ls JOIN pets pt ON pt\.id = ls\.pet_id\s+WHERE ls\.owner_id = \?/
    );
  });

  it('rate limit en memoria, sin tabla nueva', () => {
    assert.match(worker, /const SHARE_LOCATION_WINDOW_MS = 45 \* 1000/);
    assert.match(worker, /function shareLocationLimited/);
    assert.match(action, /shareLocationLimited\(ip, pet\.id, now\)/);
    assert.doesNotMatch(action, /CREATE TABLE.*location_share_limits/i);
  });
});

describe('resolución canónica (modelo SQL)', () => {
  const luna = { id: 'pet-1755830000000-abc12x', username: 'lunaqr13', user_id: 'u-owner-1' };

  it('handle /pet/lunaqr13 ≠ id interno y ambos resuelven el mismo pet.id', () => {
    assert.notEqual('lunaqr13', luna.id);
    assert.equal(resolveSharePet([luna], 'lunaqr13')?.id, luna.id);
    assert.equal(resolveSharePet([luna], luna.id)?.id, luna.id);
    assert.equal(resolveSharePet([luna], 'LUNAQR13')?.id, luna.id);
    assert.equal(resolveSharePet([luna], 'otrohandle'), null);
  });
});

describe('rate limit shareLocation', () => {
  it('el primer envío pasa; el inmediato por misma IP+mascota se bloquea', () => {
    const store = new Map();
    const t0 = 1_000_000;
    assert.equal(shareLocationLimited(store, '1.1.1.1', 'pet-1', t0), false);
    assert.equal(shareLocationLimited(store, '1.1.1.1', 'pet-1', t0 + 1000), true);
    assert.equal(shareLocationLimited(store, '1.1.1.1', 'pet-2', t0 + 1000), false);
    assert.equal(shareLocationLimited(store, '8.8.8.8', 'pet-1', t0 + 1000), false);
    assert.equal(shareLocationLimited(store, '1.1.1.1', 'pet-1', t0 + SHARE_LOCATION_WINDOW_MS), false);
    assert.equal(SHARE_LOCATION_MAX, 1);
    assert.equal(SHARE_LOCATION_WINDOW_MS, 45_000);
  });
});
