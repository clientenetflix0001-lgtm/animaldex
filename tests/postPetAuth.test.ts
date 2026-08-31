import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  POST_PET_IDENTITY_ERROR,
  POST_PET_NOT_OWNED_ERROR,
  petAllowedForAuthorIdentity,
} from '../lib/petOwnership.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
const db = readFileSync(join(root, 'lib/db.ts'), 'utf8');
const ownership = readFileSync(join(root, 'lib/petOwnership.ts'), 'utf8');

const ACCOUNT = 'u-lucas';
const OTHER = 'u-otro';
const personal = { id: 'pr-me', type: 'personal', accountId: ACCOUNT };
const apan = { id: 'pr-apan', type: 'protector', accountId: ACCOUNT };
const shop = { id: 'pr-shop', type: 'business', accountId: ACCOUNT };
const pageB = { id: 'pr-b', type: 'protector', accountId: ACCOUNT };
const foreignPage = { id: 'pr-x', type: 'protector', accountId: OTHER };

const nina = { userId: ACCOUNT, profileId: null, careStatus: 'en_casa' };
const lunaPersonal = { userId: ACCOUNT, profileId: 'pr-me', careStatus: 'en_adopcion' };
const firulais = { userId: ACCOUNT, profileId: 'pr-apan', careStatus: 'en_casa' };
const shopPet = { userId: ACCOUNT, profileId: 'pr-shop' };
const pageBPet = { userId: ACCOUNT, profileId: 'pr-b' };
const foreignPet = { userId: OTHER, profileId: null };

function gate(partial: Parameters<typeof petAllowedForAuthorIdentity>[0]) {
  return petAllowedForAuthorIdentity({ accountId: ACCOUNT, ...partial });
}

describe('createPost: autorización identidad ↔ mascota', () => {
  it('1. personal + mascota personal NULL profile_id → permitido', () => {
    assert.deepEqual(gate({ pet: nina, author: personal }), { ok: true });
  });

  it('2. personal + mascota profile type personal propia → permitido', () => {
    assert.deepEqual(gate({ pet: lunaPersonal, author: personal, petProfile: personal }), { ok: true });
  });

  it('3. personal + mascota protectora → 403', () => {
    assert.deepEqual(gate({ pet: firulais, author: personal, petProfile: apan }), {
      ok: false,
      code: 'identity_mismatch',
    });
  });

  it('4. Página A + mascota Página A → permitido', () => {
    assert.deepEqual(gate({ pet: firulais, author: apan, petProfile: apan }), { ok: true });
  });

  it('5. Página A + mascota personal → 403', () => {
    assert.deepEqual(gate({ pet: nina, author: apan }), { ok: false, code: 'identity_mismatch' });
  });

  it('6. Página A + mascota Página B → 403', () => {
    assert.deepEqual(gate({ pet: pageBPet, author: apan, petProfile: pageB }), {
      ok: false,
      code: 'identity_mismatch',
    });
  });

  it('7. Página business + mascota de esa Página → permitido', () => {
    assert.deepEqual(gate({ pet: shopPet, author: shop, petProfile: shop }), { ok: true });
  });

  it('8. Página business + mascota personal → 403', () => {
    assert.deepEqual(gate({ pet: nina, author: shop }), { ok: false, code: 'identity_mismatch' });
  });

  it('9. Página sin pet_id → permitido', () => {
    assert.deepEqual(gate({ pet: null, author: apan }), { ok: true });
    assert.deepEqual(gate({ author: shop }), { ok: true });
  });

  it('10. personal sin pet_id → permitido', () => {
    assert.deepEqual(gate({ pet: null, author: personal }), { ok: true });
    assert.deepEqual(gate({ author: null }), { ok: true });
  });

  it('11. author_profile_id de otra cuenta → rechazado como actualmente', () => {
    assert.match(worker, /Ese perfil no es tuyo/);
    assert.match(worker, /SELECT id, type, account_id FROM profiles WHERE id = \? AND account_id = \?/);
    assert.deepEqual(gate({ pet: nina, author: foreignPage }), { ok: false, code: 'identity_mismatch' });
  });

  it('12. pet_id de otra cuenta → rechazado sin filtrar información', () => {
    assert.deepEqual(gate({ pet: foreignPet, author: personal }), { ok: false, code: 'pet_not_owned' });
    assert.match(worker, /POST_PET_NOT_OWNED_ERROR/);
    assert.equal(POST_PET_NOT_OWNED_ERROR, 'Esa mascota no es tuya');
    assert.doesNotMatch(worker, /La mascota .* pertenece a @/);
  });

  it('13. care_status no cambia autorización', () => {
    assert.deepEqual(gate({ pet: lunaPersonal, author: personal, petProfile: personal }), { ok: true });
    assert.deepEqual(gate({ pet: firulais, author: personal, petProfile: apan }), {
      ok: false,
      code: 'identity_mismatch',
    });
    assert.doesNotMatch(ownership, /input\.pet\.care|pet\.careStatus/);
  });

  it('14. mascota legacy profile_id NULL funciona como personal', () => {
    assert.deepEqual(gate({ pet: { userId: ACCOUNT, profileId: null }, author: personal }), { ok: true });
    assert.deepEqual(gate({ pet: { userId: ACCOUNT, profileId: '' }, author: null }), { ok: true });
  });

  it('15. payload y contratos existentes siguen iguales', () => {
    assert.match(db, /action: 'createPost'/);
    assert.match(db, /authorProfileId: authorProfileId \?\? null/);
    assert.match(worker, /INSERT INTO posts [^\n]+author_profile_id/);
    assert.match(worker, /petAllowedForAuthorIdentity/);
    assert.match(worker, /POST_PET_IDENTITY_ERROR/);
    assert.equal(
      POST_PET_IDENTITY_ERROR,
      'La mascota seleccionada no pertenece al perfil o página desde la que estás publicando.'
    );
    assert.match(worker, /return json\(\{ error: POST_PET_IDENTITY_ERROR \}, 403\)/);
    assert.match(worker, /return json\(\{ error: POST_PET_NOT_OWNED_ERROR \}, 403\)/);
    assert.match(worker, /return json\(\{ error: 'Ese perfil no es tuyo' \}, 403\)/);
  });
});

describe('createPost worker: cableado mínimo', () => {
  it('usa SELECT de pet con profile_id y no exige pet_id', () => {
    assert.match(worker, /SELECT id, user_id, profile_id FROM pets WHERE id = \? AND user_id = \?/);
    assert.match(worker, /if \(ownedPet\)/);
    assert.match(worker, /if \(petId\)/);
  });
});
