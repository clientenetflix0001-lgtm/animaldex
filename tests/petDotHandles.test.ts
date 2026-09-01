import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveAppLink } from '../lib/appLinks.ts';
import { isValidPublicUsername } from '../lib/publicHandles.ts';
import {
  aliasRowForUsernameChange,
  applyEditablePetBase,
  applySuggestionIfCurrent,
  allocateNextPetUsername,
  buildPetUsername,
  firstFreePetUsername,
  hasPetSuffix,
  isValidPetUsername,
  normalizePetUsernameBase,
  parsePetUsernameInput,
  petCanonicalPath,
  PET_TAKEN_ERROR,
  shouldCanonicalRedirectPetHandle,
  stripPetSuffix,
  suggestPetUsernameBase,
} from '../lib/petHandles.ts';
import { isPetHandleMigrationIdempotent, planPetHandleMigration } from '../lib/petHandleMigration.ts';
import { resolveScannedValue } from '../lib/qr.ts';
import { petAllowedForAuthorIdentity } from '../lib/petOwnership.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
const addPet = readFileSync(join(root, 'screens/AddPetScreen.tsx'), 'utf8');
const app = readFileSync(join(root, 'App.tsx'), 'utf8');
const pages = readFileSync(join(root, 'cf-pages-worker.src.js'), 'utf8');
const createPost = readFileSync(join(root, 'screens/CreatePostScreen.tsx'), 'utf8');
const createReel = readFileSync(join(root, 'screens/CreateReelScreen.tsx'), 'utf8');
const qr = readFileSync(join(root, 'lib/qr.ts'), 'utf8');
const share = readFileSync(join(root, 'lib/share.ts'), 'utf8');
const migrationSql = readFileSync(join(root, 'migrations/004_pet_dot_handles.sql'), 'utf8');

function action(name: string) {
  const start = worker.indexOf(`if (action === '${name}')`);
  assert.ok(start >= 0, name);
  const next = worker.indexOf('if (action ===', start + 10);
  return worker.slice(start, next > start ? next : undefined);
}

describe('generación .pet', () => {
  it('1. Nina → nina.pet', () => {
    assert.equal(buildPetUsername(suggestPetUsernameBase('Nina')), 'nina.pet');
    assert.equal(isValidPetUsername('nina.pet'), true);
  });

  it('2. Toby → toby.pet', () => {
    assert.equal(buildPetUsername(suggestPetUsernameBase('Toby')), 'toby.pet');
  });

  it('3. pegar nina.pet no produce nina.pet.pet', () => {
    assert.equal(applyEditablePetBase('nina.pet'), 'nina');
    assert.equal(buildPetUsername(applyEditablePetBase('nina.pet')), 'nina.pet');
    assert.equal(parsePetUsernameInput('nina.pet.pet'), 'nina.pet');
    assert.equal(normalizePetUsernameBase('luna.pet'), 'luna');
  });

  it('4. normalización segura (espacios, acentos, Toby 55)', () => {
    assert.equal(buildPetUsername(suggestPetUsernameBase('Nina Luna')), 'nina_luna.pet');
    assert.equal(buildPetUsername(suggestPetUsernameBase('Ñaña')), 'nana.pet');
    assert.equal(buildPetUsername(suggestPetUsernameBase('Toby 55')), 'toby_55.pet');
    assert.equal(isValidPetUsername(buildPetUsername(suggestPetUsernameBase('Ñaña'))), true);
  });
});

describe('unicidad / sugerencia', () => {
  it('5. luna.pet libre → luna.pet', () => {
    assert.equal(firstFreePetUsername('luna', []), 'luna.pet');
  });

  it('6. luna.pet ocupado → alternativa libre', () => {
    assert.equal(allocateNextPetUsername('luna', ['luna.pet']), 'luna2.pet');
  });

  it('7. luna.pet + luna2.pet ocupados → siguiente libre', () => {
    assert.equal(allocateNextPetUsername('luna', ['luna.pet', 'luna2.pet']), 'luna3.pet');
  });

  it('8. nunca sugerir username conocido como ocupado', () => {
    const taken = ['luna.pet', 'luna2.pet', 'luna3.pet'];
    const next = allocateNextPetUsername('luna', taken);
    assert.ok(next);
    assert.equal(taken.includes(next!), false);
  });

  it('9. respuesta async vieja no reemplaza sugerencia actual', () => {
    assert.equal(
      applySuggestionIfCurrent({
        requestId: 1,
        latestId: 4,
        userTouched: false,
        suggestion: 'lu.pet',
        available: false,
      }),
      null
    );
    assert.equal(
      applySuggestionIfCurrent({
        requestId: 4,
        latestId: 4,
        userTouched: false,
        suggestion: 'luna4.pet',
        available: false,
      }),
      'luna4'
    );
  });
});

describe('cliente AddPet', () => {
  it('10. .pet visible y no editable', () => {
    assert.match(addPet, /handleSuffix/);
    assert.match(addPet, />\.pet</);
    assert.match(addPet, /PET_BASE_MAX/);
  });

  it('11. base editable', () => {
    assert.match(addPet, /applyEditablePetBase/);
    assert.match(addPet, /setUserTouched\(true\)/);
  });

  it('12. username completo enviado al backend', () => {
    assert.match(addPet, /buildPetUsername\(username \|\| name\)/);
    assert.match(addPet, /username: handle/);
  });

  it('13. ocupado no permite submit', () => {
    assert.match(addPet, /available === false && !createdPetRef/);
    assert.match(addPet, /PET_TAKEN_ERROR/);
  });

  it('14. disponible permite submit', () => {
    assert.match(addPet, /isValidPetUsername\(handle\)/);
    assert.match(addPet, /db\.createPet\(payload\)/);
  });
});

describe('servidor createPet / namespace', () => {
  it('15–17. mascota sin .pet rechazada; válida aceptada; duplicate 409', () => {
    const create = action('createPet');
    assert.match(create, /parsePetUsernameInput/);
    assert.match(create, /PET_USERNAME_INVALID_ERROR/);
    assert.match(create, /PET_TAKEN_ERROR/);
    assert.match(create, /409/);
    const handles = readFileSync(join(root, 'lib/petHandles.ts'), 'utf8');
    assert.match(handles, /Este usuario ya está en uso\. Elegí otro\./);
    assert.match(worker, /PET_TAKEN_ERROR/);
    assert.equal(parsePetUsernameInput('luna'), null);
    assert.equal(parsePetUsernameInput('luna.pet'), 'luna.pet');
  });

  it('18. usuario personal intentando *.pet → rechazado', () => {
    assert.match(action('register'), /PET_SUFFIX_RESERVED_ERROR/);
    assert.match(action('registerEmail'), /PET_SUFFIX_RESERVED_ERROR/);
    assert.match(action('updateProfile'), /PET_SUFFIX_RESERVED_ERROR/);
    assert.equal(isValidPublicUsername('lucas.pet'), false);
    assert.equal(hasPetSuffix('lucas.pet'), true);
  });

  it('19. Página intentando *.pet → rechazado', () => {
    assert.match(action('createProfile'), /PET_SUFFIX_RESERVED_ERROR/);
    assert.match(action('updatePublicProfile'), /PET_SUFFIX_RESERVED_ERROR/);
    assert.match(action('checkProfileUsername'), /reserved_pet/);
    assert.equal(isValidPublicUsername('veterinaria.pet'), false);
  });

  it('20. carrera de duplicados protegida (UNIQUE + post-insert)', () => {
    const create = action('createPet');
    assert.match(create, /isUniqueConstraintError/);
    assert.match(create, /SELECT id FROM pets WHERE LOWER\(username\) = \?/);
    assert.match(create, /dups\.length > 1/);
    const uniqueSql = readFileSync(join(root, 'migrations/005_pet_dot_handles_unique.sql'), 'utf8');
    assert.match(uniqueSql, /idx_pets_username_lower/);
    assert.doesNotMatch(migrationSql, /idx_pets_username_lower/);
    assert.match(migrationSql, /NO crea el UNIQUE index/);
  });
});

describe('rutas públicas', () => {
  it('21. /nina.pet → PetProfile', () => {
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/nina.pet'), {
      screen: 'PetProfile',
      params: { petId: 'nina.pet' },
    });
    assert.match(app, /getStateFromPath/);
    assert.match(app, /target\?\.screen === 'PetProfile'/);
  });

  it('22. /lucas → PublicProfile', () => {
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/lucas'), {
      screen: 'PublicProfile',
      params: { username: 'lucas' },
    });
  });

  it('23. /empresa → PublicProfile (Página)', () => {
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/empresa'), {
      screen: 'PublicProfile',
      params: { username: 'empresa' },
    });
  });

  it('24. /pet/:petId legacy sigue', () => {
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/pet/pet-99'), {
      screen: 'PetProfile',
      params: { petId: 'pet-99' },
    });
    assert.match(app, /PetProfile: 'pet\/:petId'/);
  });

  it('25–28. /p /r /a /m intactos', () => {
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/p/post-1').screen, 'PostDetail');
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/r/reel-1').screen, 'ReelViewer');
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/a/alert-1').screen, 'AlertDetail');
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/m/list-1').screen, 'ListingDetail');
  });
});

describe('links / share / OG / QR', () => {
  it('29. public handle genera /nina.pet', () => {
    assert.equal(petCanonicalPath('nina.pet'), '/nina.pet');
    assert.equal(petCanonicalPath('nina'), '/pet/nina');
  });

  it('30. share mascota genera /nina.pet', () => {
    assert.match(share, /export function petProfileShareUrl/);
    assert.match(share, /isValidPetUsername\(raw\)/);
    assert.match(share, /encodeURIComponent\(raw\)/);
    assert.match(share, /\/pet\/\$\{encodeURIComponent\(petId\)\}/);
    assert.equal(petCanonicalPath('nina.pet'), '/nina.pet');
    assert.equal(`https://animaldex-web.pages.dev${petCanonicalPath('nina.pet')}`, 'https://animaldex-web.pages.dev/nina.pet');
    assert.equal(`https://animaldex-web.pages.dev${petCanonicalPath('pet-1')}`, 'https://animaldex-web.pages.dev/pet/pet-1');
  });

  it('31. WhatsApp/OG usa username nuevo', () => {
    assert.match(pages, /\.pet\$\/i\.test\(handle\)/);
    assert.match(pages, /origin\}\/\$\{publicHandle\}/);
    assert.match(pages, /maybePet = \/\^\\\/pet/);
  });

  it('32. QR legacy no se rompe', () => {
    assert.equal(resolveScannedValue('https://animaldex-web.pages.dev/?qr=1234').kind, 'tag');
    assert.equal(resolveScannedValue('https://animaldex-web.pages.dev/pet/pet-99').kind, 'pet');
    assert.equal(resolveScannedValue('https://animaldex-web.pages.dev/pet/pet-99').id, 'pet-99');
    assert.match(qr, /\?qr=/);
  });

  it('33. App Link reconoce /nina.pet', () => {
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/nina.pet')?.screen, 'PetProfile');
  });
});

describe('ownership CreatePost / CreateReel', () => {
  it('34–36. ownership por id/profile_id, no por username', () => {
    assert.match(createPost, /petsForPublishingIdentity/);
    assert.match(createReel, /petsForPublishingIdentity/);
    const ownership = readFileSync(join(root, 'lib/petOwnership.ts'), 'utf8');
    assert.doesNotMatch(ownership, /username/);
    assert.equal(
      petAllowedForAuthorIdentity({
        accountId: 'u-1',
        pet: { userId: 'u-1', profileId: null },
        author: { id: 'prf-1', type: 'personal', accountId: 'u-1' },
      }).ok,
      true
    );
    assert.equal(
      petAllowedForAuthorIdentity({
        accountId: 'u-1',
        pet: { userId: 'u-1', profileId: 'prf-prot' },
        author: { id: 'prf-prot', type: 'protector', accountId: 'u-1' },
        petProfile: { id: 'prf-prot', type: 'protector', accountId: 'u-1' },
      }).ok,
      true
    );
  });
});

describe('migración local (no ejecutada)', () => {
  it('37. nina → nina.pet', () => {
    const plan = planPetHandleMigration([{ id: 'pet-a', username: 'nina' }]);
    assert.deepEqual(plan, [
      { petId: 'pet-a', oldUsername: 'nina', newUsername: 'nina.pet', alias: 'nina', changed: true },
    ]);
  });

  it('38. colisión produce nina2.pet', () => {
    const plan = planPetHandleMigration([
      { id: 'pet-a', username: 'nina.pet' },
      { id: 'pet-b', username: 'nina' },
    ]);
    assert.equal(plan.find((p) => p.petId === 'pet-a')?.newUsername, 'nina.pet');
    assert.equal(plan.find((p) => p.petId === 'pet-b')?.newUsername, 'nina2.pet');
  });

  it('39. múltiples colisiones no duplican', () => {
    const plan = planPetHandleMigration([
      { id: 'pet-a', username: 'nina' },
      { id: 'pet-b', username: 'nina' },
      { id: 'pet-c', username: 'nina' },
    ]);
    const names = plan.map((p) => p.newUsername);
    assert.deepEqual(new Set(names).size, names.length);
    assert.ok(names.every((n) => isValidPetUsername(n)));
  });

  it('40. migración idempotente', () => {
    const pets = [
      { id: 'pet-a', username: 'nina' },
      { id: 'pet-b', username: 'nina.pet' },
      { id: 'pet-c', username: 'toby' },
    ];
    assert.equal(isPetHandleMigrationIdempotent(pets), true);
  });

  it('41. mascota que ya termina .pet no recibe .pet.pet', () => {
    const plan = planPetHandleMigration([{ id: 'pet-a', username: 'nina.pet' }]);
    assert.equal(plan[0].newUsername, 'nina.pet');
    assert.equal(plan[0].changed, false);
    assert.equal(stripPetSuffix('nina.pet'), 'nina');
    assert.match(migrationSql, /NO ejecutar contra D1 remoto/);
  });
});

describe('aliases al cambiar username', () => {
  it('1. nina.pet → ninita.pet crea alias nina.pet', () => {
    const row = aliasRowForUsernameChange({
      petId: 'pet-1',
      previousUsername: 'nina.pet',
      nextUsername: 'ninita.pet',
      now: 10,
    });
    assert.deepEqual(row, {
      oldUsername: 'nina.pet',
      petId: 'pet-1',
      newUsername: 'ninita.pet',
      createdAt: 10,
    });
    assert.match(worker, /rememberPetUsernameAlias/);
    assert.match(action('updatePet'), /rememberPetUsernameAlias/);
    assert.match(worker, /INSERT OR IGNORE INTO pet_username_aliases/);
  });

  it('2–3. /nina.pet resuelve alias y canonical es /ninita.pet', () => {
    assert.equal(shouldCanonicalRedirectPetHandle('nina.pet', 'ninita.pet'), 'ninita.pet');
    assert.equal(petCanonicalPath('ninita.pet'), '/ninita.pet');
    const petProfile = readFileSync(join(root, 'screens/PetProfileScreen.tsx'), 'utf8');
    assert.match(petProfile, /shouldCanonicalRedirectPetHandle/);
    assert.match(petProfile, /navigation\.replace\('PetProfile'/);
    assert.match(worker, /findPetByHandleOrAlias/);
  });

  it('4. nina.pet alias queda reservado', () => {
    assert.match(worker, /pet_username_aliases WHERE LOWER\(old_username\) = \?/);
    assert.match(worker, /allowPetId/);
  });

  it('5. update sin cambio de username no crea alias', () => {
    assert.equal(
      aliasRowForUsernameChange({
        petId: 'pet-1',
        previousUsername: 'nina.pet',
        nextUsername: 'nina.pet',
      }),
      null
    );
  });

  it('6. alias duplicado no se pisa (INSERT OR IGNORE)', () => {
    assert.match(worker, /INSERT OR IGNORE INTO pet_username_aliases/);
  });

  it('7–9. migration guarda old username; segundo run idempotente; UNIQUE después', () => {
    const plan = planPetHandleMigration([{ id: 'pet-a', username: 'nina' }]);
    assert.equal(plan[0].alias, 'nina');
    assert.equal(plan[0].newUsername, 'nina.pet');
    assert.equal(isPetHandleMigrationIdempotent([{ id: 'pet-a', username: 'nina' }]), true);
    const uniqueSql = readFileSync(join(root, 'migrations/005_pet_dot_handles_unique.sql'), 'utf8');
    assert.match(uniqueSql, /DESPUÉS del renombrado/);
    assert.doesNotMatch(readFileSync(join(root, 'migrations/004_pet_dot_handles.sql'), 'utf8'), /CREATE UNIQUE INDEX/);
  });

  it('10. Worker no explota si falta la tabla: try/catch + ensure', () => {
    assert.match(worker, /ensurePetHandleAliasSchema/);
    assert.match(worker, /catch \(_\) \{\}/);
    assert.match(worker, /CREATE TABLE IF NOT EXISTS pet_username_aliases/);
  });
});

describe('disponibilidad endpoint y reserved bases', () => {
  it('checkPetUsername devuelve available + suggestion sin datos privados', () => {
    const check = action('checkPetUsername');
    assert.match(check, /suggestion/);
    assert.match(check, /available/);
    assert.doesNotMatch(check, /owner|email|phone|user_id/);
    assert.match(worker, /takenPetHandleSet/);
    assert.match(worker, /LOWER\(username\) IN/);
  });

  it('bases peligrosas p/pet/a/m/r no son usernames de mascota', () => {
    assert.equal(isValidPetUsername('p.pet'), false);
    assert.equal(isValidPetUsername('pet.pet'), false);
    assert.equal(isValidPetUsername('a.pet'), false);
    assert.equal(isValidPetUsername('m.pet'), false);
    assert.equal(isValidPetUsername('r.pet'), false);
    assert.equal(isValidPetUsername('login.pet'), false);
  });

  it('QR /nina.pet es mascota, no handle humano', () => {
    const scan = resolveScannedValue('https://animaldex-web.pages.dev/nina.pet');
    assert.equal(scan.kind, 'pet');
    if (scan.kind === 'pet') assert.equal(scan.id, 'nina.pet');
  });
});
