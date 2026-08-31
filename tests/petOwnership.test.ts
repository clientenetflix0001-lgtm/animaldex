import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isCommonUserPet } from '../lib/petBirthday.ts';
import {
  canAddPetForPublishingIdentity,
  filterPersonalPets,
  isPersonalPet,
  petBelongsToProfile,
  petsForPublishingIdentity,
  reconcileSelectedPetId,
} from '../lib/petOwnership.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const myPetsScreen = readFileSync(join(root, 'screens/MyPetsScreen.tsx'), 'utf8');
const userProfile = readFileSync(join(root, 'screens/UserProfileScreen.tsx'), 'utf8');
const createPost = readFileSync(join(root, 'screens/CreatePostScreen.tsx'), 'utf8');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
const db = readFileSync(join(root, 'lib/db.ts'), 'utf8');
const ownership = readFileSync(join(root, 'lib/petOwnership.ts'), 'utf8');

const personal = { id: 'pr-me', type: 'personal' };
const apan = { id: 'pr-apan', type: 'protector' };
const shop = { id: 'pr-shop', type: 'business' };
const otherShelter = { id: 'pr-other', type: 'protector' };
const profiles = [personal, apan, shop, otherShelter];

const nina = { id: 'nina', profileId: null, careStatus: 'en_casa' };
const nono = { id: 'nono', profileId: null, careStatus: 'perdido' };
const personalTyped = { id: 'luna', profileId: 'pr-me', careStatus: 'en_casa' };
const firulais = { id: 'firulais', profileId: 'pr-apan', careStatus: 'en_adopcion' };
const rocky = { id: 'rocky', profileId: 'pr-apan', careStatus: 'en_recuperacion' };
const shopPet = { id: 'sku', profileId: 'pr-shop', careStatus: 'en_casa' };
const otherPagePet = { id: 'milo', profileId: 'pr-other', careStatus: 'en_adopcion' };
const allPets = [nina, nono, personalTyped, firulais, rocky, shopPet, otherPagePet];

describe('1–4. regla de ownership', () => {
  it('profile_id NULL → personal', () => {
    assert.equal(isPersonalPet(nina, profiles), true);
    assert.equal(isCommonUserPet({ profileId: null }), true);
  });

  it('profile tipo personal → personal', () => {
    assert.equal(isPersonalPet(personalTyped, profiles), true);
    assert.equal(isCommonUserPet({ profileId: 'pr-me', profileType: 'personal' }), true);
  });

  it('profile protector → Página', () => {
    assert.equal(isPersonalPet(firulais, profiles), false);
    assert.equal(petBelongsToProfile(firulais, 'pr-apan'), true);
  });

  it('profile business → Página', () => {
    assert.equal(isPersonalPet(shopPet, profiles), false);
    assert.equal(petBelongsToProfile(shopPet, 'pr-shop'), true);
  });
});

describe('5–8. Mis mascotas y perfil personal', () => {
  it('MyPetsScreen excluye protectora y empresarial y conserva personales', () => {
    const shown = filterPersonalPets(allPets, profiles).map((p) => p.id);
    assert.deepEqual(shown, ['nina', 'nono', 'luna']);
    assert.ok(!shown.includes('firulais'));
    assert.ok(!shown.includes('sku'));
    assert.match(myPetsScreen, /filterPersonalPets\(myPets, profiles\)/);
    assert.match(myPetsScreen, /buildMyPetsGrid\(personalPets\)/);
  });

  it('UserProfile personal usa la misma regla', () => {
    assert.match(userProfile, /filterPersonalPets\(ownedPets/);
    assert.match(userProfile, /isMe \? myProfiles : accountProfiles/);
    assert.doesNotMatch(ownership, /careStatus/);
  });
});

describe('9–13. selector de protagonista', () => {
  it('publicar como personal: solo mascotas personales', () => {
    const ids = petsForPublishingIdentity(allPets, { profileId: 'pr-me', type: 'personal' }, profiles).map((p) => p.id);
    assert.deepEqual(ids, ['nina', 'nono', 'luna']);
    assert.match(createPost, /petsForPublishingIdentity/);
    assert.match(createPost, /pickerPets/);
  });

  it('publicar como protector: solo mascotas de esa Página', () => {
    const ids = petsForPublishingIdentity(allPets, { profileId: 'pr-apan', type: 'protector' }, profiles).map((p) => p.id);
    assert.deepEqual(ids, ['firulais', 'rocky']);
  });

  it('Página A no puede seleccionar mascota de Página B', () => {
    const ids = petsForPublishingIdentity(allPets, { profileId: 'pr-apan', type: 'protector' }, profiles).map((p) => p.id);
    assert.ok(!ids.includes('milo'));
  });

  it('Página no recibe mascota personal', () => {
    const ids = petsForPublishingIdentity(allPets, { profileId: 'pr-apan', type: 'protector' }, profiles).map((p) => p.id);
    assert.ok(!ids.includes('nina'));
    const business = petsForPublishingIdentity(allPets, { profileId: 'pr-shop', type: 'business' }, profiles).map((p) => p.id);
    assert.deepEqual(business, ['sku']);
    assert.equal(canAddPetForPublishingIdentity({ type: 'business' }), false);
    assert.equal(canAddPetForPublishingIdentity({ type: 'protector' }), true);
  });

  it('cambio de identidad invalida protagonista incompatible', () => {
    const personalIds = petsForPublishingIdentity(allPets, { type: 'personal' }, profiles);
    assert.equal(reconcileSelectedPetId('nina', personalIds), 'nina');
    const apanIds = petsForPublishingIdentity(allPets, { profileId: 'pr-apan', type: 'protector' }, profiles);
    assert.equal(reconcileSelectedPetId('nina', apanIds), null);
    assert.equal(reconcileSelectedPetId('firulais', apanIds), 'firulais');
    assert.match(createPost, /reconcileSelectedPetId/);
    assert.match(createPost, /activeProfileId, pickerPets/);
  });
});

describe('14–16. legacy, care_status y contratos', () => {
  it('profile_id NULL legacy sigue siendo personal', () => {
    assert.equal(isPersonalPet({ id: 'old', profileId: null, careStatus: 'en_adopcion' }), true);
    assert.equal(isPersonalPet({ id: 'old2', profileId: '', careStatus: 'en_recuperacion' }), true);
  });

  it('care_status no determina ownership', () => {
    assert.equal(isPersonalPet({ id: 'a', profileId: null, careStatus: 'en_adopcion' }, profiles), true);
    assert.equal(isPersonalPet({ id: 'b', profileId: 'pr-apan', careStatus: 'en_casa' }, profiles), false);
    assert.doesNotMatch(ownership, /careStatus/);
    assert.doesNotMatch(ownership, /en_adopcion|en_casa/);
  });

  it('no se alteran author_profile_id / pet_id', () => {
    assert.match(createPost, /activeProfileId/);
    assert.match(db, /authorProfileId/);
    assert.match(worker, /author_profile_id/);
    assert.match(worker, /INSERT INTO posts \(id, user_id, pet_id/);
    assert.match(worker, /SELECT id FROM pets WHERE id = \? AND user_id = \?/);
    assert.doesNotMatch(createPost, /author_page_id/);
  });
});
