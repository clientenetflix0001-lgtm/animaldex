import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const petProfile = readFileSync(join(root, 'screens/PetProfileScreen.tsx'), 'utf8');
const userProfile = readFileSync(join(root, 'screens/UserProfileScreen.tsx'), 'utf8');
const publicProfile = readFileSync(join(root, 'screens/PublicProfileScreen.tsx'), 'utf8');
const db = readFileSync(join(root, 'lib/db.ts'), 'utf8');
const types = readFileSync(join(root, 'lib/types.ts'), 'utf8');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');

describe('perfil mascota: encabezado compacto', () => {
  it('1. el avatar ya no usa el tamaño gigante anterior', () => {
    assert.doesNotMatch(petProfile, /Math\.min\(288/);
    assert.doesNotMatch(petProfile, /availW \* 0\.62/);
    assert.doesNotMatch(petProfile, /avatarSection/);
    assert.doesNotMatch(petProfile, /width: AVATAR/);
    assert.match(petProfile, /avatarPress: \{ width: 84, height: 84/);
    assert.match(petProfile, /avatar: \{\s*width: 84,\s*height: 84,\s*borderRadius: 42/);
  });

  it('2. la estructura es información + avatar', () => {
    assert.match(petProfile, /identityRow/);
    assert.match(petProfile, /identityCopy/);
    assert.match(petProfile, /flexDirection: 'row'/);
    const rowIdx = petProfile.indexOf('styles.identityRow');
    const copyIdx = petProfile.indexOf('styles.identityCopy');
    const avatarIdx = petProfile.indexOf('styles.avatarPress');
    assert.ok(rowIdx > 0 && copyIdx > rowIdx && avatarIdx > copyIdx);
    assert.match(petProfile, /numberOfLines=\{2\}/);
    assert.match(petProfile, /ellipsizeMode="tail"/);
  });

  it('3. el username .pet sigue visible como @{petHandle}', () => {
    assert.match(petProfile, /@\{petHandle\}/);
    assert.match(petProfile, /const petHandle = realPet\?\.username/);
    assert.doesNotMatch(petProfile, /stripPetSuffix/);
  });

  it('4. los datos de la mascota se conservan', () => {
    assert.match(petProfile, /statusText/);
    assert.match(petProfile, /speciesLabel/);
    assert.match(petProfile, /\{breed\}/);
    assert.match(petProfile, /\{age\}/);
    assert.match(petProfile, /sizeText/);
    assert.match(petProfile, /neuteredText/);
    assert.match(petProfile, /waitText/);
    assert.match(petProfile, /\{bio\}/);
    assert.match(petProfile, /careStatusLabel/);
    assert.match(petProfile, /ageLabelFromBirthDate/);
  });

  it('5. las estadísticas se conservan', () => {
    assert.match(petProfile, /label="Posts"/);
    assert.match(petProfile, /label="Seguidores"/);
    assert.match(petProfile, /label="Siguiendo"/);
    assert.match(petProfile, /<FollowButton/);
  });

  it('6. seguir y publicaciones siguen accesibles', () => {
    assert.match(petProfile, /toggleFollowPet\(petId\)/);
    assert.match(petProfile, /accessibilityLabel="Publicaciones"/);
    assert.match(petProfile, /accessibilityLabel="Reels"/);
    assert.match(petProfile, /PostGridMedia/);
    assert.match(petProfile, /galleryTab === 'posts'/);
  });
});

describe('perfil personal: layout intacto + fondo blanco', () => {
  it('7. el layout avatar + información se conserva', () => {
    assert.match(userProfile, /styles\.infoRow/);
    assert.match(
      userProfile,
      /infoRow: \{\s*flexDirection: 'row',\s*alignItems: 'center',\s*paddingHorizontal: spacing\.lg,\s*gap: spacing\.xl,/
    );
    assert.match(
      userProfile,
      /avatar: \{ width: 84, height: 84, borderRadius: 42, borderWidth: 3/
    );
    assert.match(userProfile, /Editar perfil/);
    assert.match(userProfile, /Mis mascotas/);
    assert.match(userProfile, /Mis páginas/);
  });

  it('8. el fondo del perfil personal es blanco', () => {
    assert.match(userProfile, /safe: \{ flex: 1, backgroundColor: '#FFFFFF' \}/);
    assert.doesNotMatch(userProfile, /safe: \{ flex: 1, backgroundColor: colors\.bg \}/);
  });
});

describe('perfil mascota: fondo blanco', () => {
  it('9. el fondo del perfil de mascota es blanco', () => {
    assert.match(petProfile, /safe: \{ flex: 1, backgroundColor: '#FFFFFF' \}/);
    assert.doesNotMatch(petProfile, /safe: \{ flex: 1, backgroundColor: colors\.bg \}/);
  });
});

describe('página empresa / bienestar animal: layout intacto', () => {
  it('10. avatar centrado arriba, información debajo', () => {
    assert.match(publicProfile, /head: \{ alignItems: 'center'/);
    assert.match(
      publicProfile,
      /avatar: \{\s*width: 96,\s*height: 96,\s*borderRadius: 48/
    );
    assert.match(publicProfile, /safeWhite: \{ flex: 1, backgroundColor: '#FFFFFF' \}/);
    assert.match(publicProfile, /<ProfileBadge type=\{profile\.type\} \/>/);
  });
});

describe('contratos internos intactos', () => {
  it('11. type protector y rutas no se refactorizan', () => {
    assert.match(worker, /type === 'protector'|type === \"protector\"|type: 'protector'/);
    assert.match(db, /profileId|profile_id/);
    assert.match(types, /PetProfile/);
    assert.doesNotMatch(db, /author_page_id/);
    assert.doesNotMatch(worker, /type = 'bienestar'/);
  });
});
