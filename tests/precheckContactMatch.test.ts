import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACCOUNT_VERIFIED_AVAILABLE,
  isAccountVerified,
  publicOwnerContactPayload,
  publicPayloadContainsStoredPhone,
  publicPetProfileContactJson,
  userContactSource,
  pageContactSource,
} from '../lib/petOwnerContact.ts';
import {
  lostBreedMatchGroupKey,
  lostBreedMatchIdempotencyKey,
  lostBreedMatchLocationKey,
  stableLocalityKey,
  stablePlaceId,
} from '../lib/lostBreedMatch.ts';
import { normalizeLocality } from '../lib/feedGeo.ts';
import { guestTagWelcomeHome, publicTagTargetFromStatus } from '../lib/tagPublicResolve.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
const migration = readFileSync(join(root, 'migrations/017_pet_contact_breed_match.sql'), 'utf8');
const linking = readFileSync(join(root, 'lib/webLinking.ts'), 'utf8');

const storedUserPhone = '+5493875551111';
const storedPagePhone = '+5493875554444';
const storedPageWa = '+5493875553333';

describe('precheck: privacidad API petProfile', () => {
  it('owner tiene teléfono + pet_contact_visible = 0 → respuesta pública NO contiene el teléfono', () => {
    const payload = publicPetProfileContactJson({
      user: {
        username: 'noelia',
        contactWhatsapp: storedUserPhone,
        contactPhone: storedUserPhone,
        petContactVisible: 0,
      },
    });
    assert.equal(payload.ownerContact?.whatsapp, null);
    assert.equal(payload.ownerContact?.phone, null);
    assert.equal(publicPayloadContainsStoredPhone(payload, storedUserPhone), false);
  });

  it('pet_contact_visible = 1 → sí contiene contacto público', () => {
    const payload = publicPetProfileContactJson({
      user: {
        username: 'noelia',
        contactWhatsapp: storedUserPhone,
        petContactVisible: 1,
      },
    });
    assert.equal(payload.ownerContact?.whatsapp, storedUserPhone);
    assert.equal(publicPayloadContainsStoredPhone(payload, storedUserPhone), true);
  });

  it('página privada no filtra teléfono', () => {
    const payload = publicPetProfileContactJson({
      petProfileId: 'prf-apan',
      page: {
        username: 'apansalta',
        phone: storedPagePhone,
        adoptionWhatsapp: storedPageWa,
        petContactVisible: 0,
      },
    });
    assert.equal(payload.ownerContact?.whatsapp, null);
    assert.equal(payload.ownerContact?.phone, null);
    assert.equal(payload.shelter?.phone, '');
    assert.equal(publicPayloadContainsStoredPhone(payload, storedPagePhone), false);
    assert.equal(publicPayloadContainsStoredPhone(payload, storedPageWa), false);
  });

  it('page visible sí devuelve contacto en ownerContact, no en shelter.phone', () => {
    const payload = publicPetProfileContactJson({
      petProfileId: 'prf-apan',
      page: {
        username: 'apansalta',
        phone: storedPagePhone,
        adoptionWhatsapp: storedPageWa,
        petContactVisible: true,
      },
    });
    assert.equal(payload.ownerContact?.whatsapp, storedPageWa);
    assert.equal(payload.shelter?.phone, '');
    assert.equal(publicPayloadContainsStoredPhone(payload.ownerContact, storedPageWa), true);
    assert.equal(publicPayloadContainsStoredPhone(payload.shelter, storedPagePhone), false);
    assert.equal(publicPayloadContainsStoredPhone(payload.shelter, storedPageWa), false);
  });

  it('Worker petProfile usa payload público y strip de shelter.phone', () => {
    const start = worker.indexOf("if (action === 'petProfile')");
    const block = worker.slice(start, start + 2800);
    assert.match(block, /publicOwnerContactPayload/);
    assert.match(block, /publicPetProfileShelter/);
    assert.doesNotMatch(block, /shelter: shelterRows\[0\] \? profileRow\(shelterRows\[0\]\) : null/);
    assert.match(block, /verified: false/);
  });
});

describe('precheck: verified_phone no es cuenta verificada', () => {
  it('verified_phone no se interpreta como insignia de cuenta', () => {
    assert.equal(ACCOUNT_VERIFIED_AVAILABLE, false);
    assert.equal(isAccountVerified({ verified: true }), false);
    const source = userContactSource({ username: 'noelia', verifiedPhone: '+5493875550000' });
    assert.equal(source?.verified, false);
    assert.equal(publicOwnerContactPayload(source)?.verified, false);
    assert.equal(pageContactSource({ username: 'apansalta' })?.verified, false);
  });
});

describe('precheck: group_key estable', () => {
  const lost = {
    id: 'lost-1',
    userId: 'owner-1',
    placeId: 'AR:georef:66028050',
    locality: 'Salta Capital',
  };
  const found = {
    id: 'found-1',
    userId: 'lucas',
    placeId: 'AR:georef:66028050',
    locality: 'Salta Capital',
  };

  it('group_key con placeId común', () => {
    assert.equal(lostBreedMatchLocationKey(lost, found), 'place:AR:georef:66028050');
    assert.equal(
      lostBreedMatchGroupKey({
        recipientUserId: 'owner-1',
        lostAlertId: 'lost-1',
        breedId: 'poodle',
        lost,
        found,
      }),
      'lost_breed_match:owner-1:lost-1:poodle:place:AR:georef:66028050'
    );
  });

  it('lost tiene placeId y found no → misma key place:lost', () => {
    const foundNoPlace = { ...found, placeId: null };
    assert.equal(lostBreedMatchLocationKey(lost, foundNoPlace), 'place:AR:georef:66028050');
    assert.equal(
      lostBreedMatchGroupKey({
        recipientUserId: 'owner-1',
        lostAlertId: 'lost-1',
        breedId: 'poodle',
        lost,
        found: foundNoPlace,
      }),
      lostBreedMatchGroupKey({
        recipientUserId: 'owner-1',
        lostAlertId: 'lost-1',
        breedId: 'poodle',
        lost,
        found,
      })
    );
  });

  it('found tiene placeId y lost no → locality normalizada, no place del found', () => {
    const lostNoPlace = { ...lost, placeId: null };
    assert.equal(lostBreedMatchLocationKey(lostNoPlace, found), 'locality:salta capital');
    assert.doesNotMatch(lostBreedMatchLocationKey(lostNoPlace, found), /place:/);
  });

  it('ninguno tiene placeId → locality normalizada estable', () => {
    const a = { placeId: null, locality: 'Salta Capital' };
    const b = { placeId: null, locality: 'salta capital' };
    assert.equal(lostBreedMatchLocationKey(a, b), 'locality:salta capital');
    assert.equal(stableLocalityKey('Salta Capital'), 'salta capital');
    assert.equal(normalizeLocality('Salta Capital'), 'salta capital');
  });

  it('no mezcla localidades distintas', () => {
    const keySalta = lostBreedMatchGroupKey({
      recipientUserId: 'o',
      lostAlertId: 'l1',
      breedId: 'poodle',
      lost: { placeId: null, locality: 'Salta Capital' },
      found: { placeId: null, locality: 'Salta Capital' },
    });
    const keyCafa = lostBreedMatchGroupKey({
      recipientUserId: 'o',
      lostAlertId: 'l1',
      breedId: 'poodle',
      lost: { placeId: null, locality: 'Cafayate' },
      found: { placeId: null, locality: 'Cafayate' },
    });
    assert.equal(keySalta, 'lost_breed_match:o:l1:poodle:locality:salta capital');
    assert.equal(keyCafa, 'lost_breed_match:o:l1:poodle:locality:cafayate');
    assert.notEqual(keySalta, keyCafa);
  });

  it('group_key nunca serializa undefined/null/[object Object]', () => {
    const ugly = lostBreedMatchLocationKey(
      { placeId: { id: 'x' }, locality: undefined },
      { placeId: null, locality: null }
    );
    assert.equal(ugly, 'locality:unknown');
    assert.equal(stablePlaceId(undefined), null);
    assert.equal(stablePlaceId(null), null);
    assert.equal(stablePlaceId({}), null);
    assert.equal(stablePlaceId('[object Object]'), null);
    assert.doesNotMatch(ugly, /undefined|null|\[object Object\]/);
    const key = lostBreedMatchGroupKey({
      recipientUserId: 'o',
      lostAlertId: 'l1',
      breedId: 'poodle',
      lost: { placeId: undefined, locality: null },
      found: { placeId: {}, locality: undefined },
    });
    assert.equal(key, 'lost_breed_match:o:l1:poodle:locality:unknown');
    assert.doesNotMatch(key, /undefined|null|\[object Object\]/);
  });
});

describe('precheck: idempotencia y migración', () => {
  it('idempotencia found+lost+recipient es estable', () => {
    const a = lostBreedMatchIdempotencyKey({
      foundAlertId: 'f1',
      lostAlertId: 'l1',
      recipientUserId: 'u1',
    });
    const b = lostBreedMatchIdempotencyKey({
      foundAlertId: 'f1',
      lostAlertId: 'l1',
      recipientUserId: 'u1',
    });
    assert.equal(a, b);
    assert.equal(a, 'lost_breed_match:f1:l1:u1');
    assert.match(worker, /INSERT OR IGNORE INTO activity_events/);
    assert.match(worker, /if \(!inserted \|\| !inserted\.meta \|\| inserted\.meta\.changes < 1\) continue/);
  });

  it('migration defaults: visible 0, match 1, breed_id NULL, sin backfill', () => {
    assert.match(migration, /users ADD COLUMN contact_whatsapp TEXT/);
    assert.match(migration, /users ADD COLUMN contact_phone TEXT/);
    assert.match(migration, /users ADD COLUMN pet_contact_visible INTEGER NOT NULL DEFAULT 0/);
    assert.match(migration, /profiles ADD COLUMN pet_contact_visible INTEGER NOT NULL DEFAULT 0/);
    assert.match(migration, /alerts ADD COLUMN breed_id TEXT/);
    assert.match(migration, /lost_breed_match INTEGER NOT NULL DEFAULT 1/);
    assert.doesNotMatch(migration, /UPDATE users SET pet_contact_visible/);
    assert.doesNotMatch(migration, /UPDATE profiles SET pet_contact_visible/);
    assert.doesNotMatch(migration, /verified_phone/);
  });
});

describe('precheck: QR claimed/unclaimed/invalid intacto', () => {
  it('claimed guest → pet; unclaimed → claim; invalid → unavailable', () => {
    assert.deepEqual(publicTagTargetFromStatus('6544FF', { exists: true, status: 'claimed', pet: { id: 'p1' } }), {
      kind: 'pet',
      petId: 'p1',
    });
    assert.equal(publicTagTargetFromStatus('AAA123', { exists: true, status: 'unclaimed' }).kind, 'claim');
    assert.equal(publicTagTargetFromStatus('ZZZ', { exists: false }).kind, 'unavailable');
    assert.equal(guestTagWelcomeHome(false), 'Auth');
    assert.match(linking, /TagWelcome/);
  });
});
