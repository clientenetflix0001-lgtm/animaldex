import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  acceptedBio,
  BIO_WORD_LIMIT_ERROR,
  countBioWords,
  isBioWithinWordLimit,
  MAX_BIO_WORDS,
  sanitizeBio,
} from '../lib/bio.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const editProfile = readFileSync(join(root, 'screens/EditProfileScreen.tsx'), 'utf8');
const editPage = readFileSync(join(root, 'screens/EditPublicProfileScreen.tsx'), 'utf8');
const addPet = readFileSync(join(root, 'screens/AddPetScreen.tsx'), 'utf8');
const createSheet = readFileSync(join(root, 'features/profiles/CreateProfileSheet.tsx'), 'utf8');
const userProfile = readFileSync(join(root, 'screens/UserProfileScreen.tsx'), 'utf8');
const publicProfile = readFileSync(join(root, 'screens/PublicProfileScreen.tsx'), 'utf8');
const petProfile = readFileSync(join(root, 'screens/PetProfileScreen.tsx'), 'utf8');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
const createPost = readFileSync(join(root, 'screens/CreatePostScreen.tsx'), 'utf8');
const createStory = readFileSync(join(root, 'screens/CreateStoryScreen.tsx'), 'utf8');
const createReel = readFileSync(join(root, 'screens/CreateReelScreen.tsx'), 'utf8');

function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `p${i + 1}`).join(' ');
}

describe('biografías: 155 palabras', () => {
  it('13. helper cuenta palabras correctamente', () => {
    assert.equal(countBioWords('Hola soy Lucas'), 3);
    assert.equal(MAX_BIO_WORDS, 155);
    assert.equal(sanitizeBio('  hola  '), 'hola');
  });

  it('14. espacios múltiples no alteran conteo', () => {
    assert.equal(countBioWords('Hola    soy     Lucas'), 3);
  });

  it('15. saltos de línea no cuentan como palabras', () => {
    assert.equal(countBioWords('Hola\n\nsoy\nLucas'), 3);
    assert.equal(countBioWords('  \n  '), 0);
  });

  it('16. 155 palabras = válido', () => {
    assert.equal(countBioWords(words(155)), 155);
    assert.equal(isBioWithinWordLimit(words(155)), true);
    assert.equal(acceptedBio(words(155)).ok, true);
  });

  it('17. 156 palabras = inválido', () => {
    assert.equal(countBioWords(words(156)), 156);
    assert.equal(isBioWithinWordLimit(words(156)), false);
    assert.deepEqual(acceptedBio(words(156)), { ok: false, error: BIO_WORD_LIMIT_ERROR });
    assert.equal(BIO_WORD_LIMIT_ERROR, 'Máximo 155 palabras.');
  });

  it('18. personal respeta 155 palabras', () => {
    assert.match(editProfile, /isBioWithinWordLimit\(bio\)/);
    assert.match(editProfile, /<BioField/);
    assert.match(worker, /action === 'updateProfile'[\s\S]*acceptedBio\(body\.bio\)/);
    assert.doesNotMatch(editProfile, /maxLength=\{200\}/);
  });

  it('19. mascota respeta 155 palabras', () => {
    assert.match(addPet, /isBioWithinWordLimit\(bio\)/);
    assert.match(addPet, /<BioField/);
    assert.match(worker, /action === 'createPet'[\s\S]*acceptedBio\(body\.bio\)/);
    assert.match(worker, /action === 'updatePet'[\s\S]*acceptedBio\(body\.bio\)/);
  });

  it('20. empresa respeta 155 palabras', () => {
    assert.match(editPage, /isBioWithinWordLimit\(bio\)/);
    assert.match(createSheet, /isBioWithinWordLimit\(bio\)/);
    assert.match(worker, /action === 'createProfile'[\s\S]*acceptedBio\(body\.bio\)/);
    assert.match(worker, /action === 'updatePublicProfile'[\s\S]*acceptedBio\(body\.bio\)/);
  });

  it('21. Bienestar respeta 155 palabras', () => {
    assert.match(editPage, /profileType === 'protector'/);
    assert.match(createSheet, /Nueva página de Bienestar Animal/);
    assert.match(editPage, /<BioField/);
  });

  it('22. bio se muestra completa', () => {
    assert.match(userProfile, /\{displayBio\}/);
    assert.match(publicProfile, /\{profile\.bio\}/);
    assert.match(petProfile, /\{bio\}/);
  });

  it('23. no queda numberOfLines\/ellipsis que la corte', () => {
    const userBio = userProfile.slice(userProfile.indexOf('styles.bio}'), userProfile.indexOf('styles.bio}') + 80);
    assert.doesNotMatch(userProfile, /displayBio[\s\S]{0,80}numberOfLines/);
    assert.doesNotMatch(publicProfile, /profile\.bio[\s\S]{0,80}numberOfLines/);
    assert.doesNotMatch(petProfile, /\{bio\}[\s\S]{0,40}numberOfLines/);
    assert.doesNotMatch(userProfile, /displayBio[\s\S]{0,80}ellipsizeMode/);
    assert.doesNotMatch(publicProfile, /profile\.bio[\s\S]{0,80}ellipsizeMode/);
    assert.doesNotMatch(userBio, /unused/);
  });

  it('24. bio legacy >155 no se destruye automáticamente', () => {
    assert.doesNotMatch(worker, /clean\(body\.bio, 200\)/);
    assert.doesNotMatch(worker, /UPDATE users SET[\s\S]{0,80}bio = substring/);
    assert.match(worker, /if \(body\.bio != null\) \{\s*const bioRes = acceptedBio\(body\.bio\)/);
    assert.doesNotMatch(createPost, /MAX_BIO_WORDS|countBioWords/);
    assert.doesNotMatch(createStory, /MAX_BIO_WORDS|countBioWords/);
    assert.doesNotMatch(createReel, /MAX_BIO_WORDS|countBioWords/);
  });
});
