import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MOBILE_TAB_ORDER,
  TAB_ICONS,
  TAB_LABELS,
  isMainTabActive,
  tabImmediatelyAfter,
} from '../lib/mainTabs.ts';
import {
  ADD_PET_ROUTE,
  ADOPT_ROUTE,
  PET_PROFILE_ROUTE,
  buildMyPetsGrid,
  petCardAgeLabel,
  petCardHandle,
  petProfileNavId,
} from '../lib/myPetsGrid.ts';
import { ageLabelFromBirthDate } from '../lib/birthDate.ts';
import {
  PROFILE_TYPE_LABEL,
  editIdentityLabel,
  isManagedPageType,
  limitMessage,
} from '../features/profiles/profileTypes.ts';
import { resolveAppLink } from '../lib/appLinks.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'App.tsx'), 'utf8');
const types = readFileSync(join(root, 'lib/types.ts'), 'utf8');
const tabStack = readFileSync(join(root, 'lib/tabProfileStack.tsx'), 'utf8');
const myPets = readFileSync(join(root, 'screens/MyPetsScreen.tsx'), 'utf8');
const userProfile = readFileSync(join(root, 'screens/UserProfileScreen.tsx'), 'utf8');
const petProfile = readFileSync(join(root, 'screens/PetProfileScreen.tsx'), 'utf8');
const publicProfile = readFileSync(join(root, 'screens/PublicProfileScreen.tsx'), 'utf8');
const editPublic = readFileSync(join(root, 'screens/EditPublicProfileScreen.tsx'), 'utf8');
const editPersonal = readFileSync(join(root, 'screens/EditProfileScreen.tsx'), 'utf8');
const switcher = readFileSync(join(root, 'features/profiles/ProfileSwitcher.tsx'), 'utf8');
const createSheet = readFileSync(join(root, 'features/profiles/CreateProfileSheet.tsx'), 'utf8');
const createPost = readFileSync(join(root, 'screens/CreatePostScreen.tsx'), 'utf8');
const db = readFileSync(join(root, 'lib/db.ts'), 'utf8');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
const store = readFileSync(join(root, 'lib/store.tsx'), 'utf8');
const packageJson = readFileSync(join(root, 'package.json'), 'utf8');
const handles = readFileSync(join(root, 'lib/publicHandles.ts'), 'utf8');

describe('1–3. tab Mascotas en barra inferior', () => {
  it('registra acceso Mascotas con icono paw de Ionicons', () => {
    assert.equal(TAB_LABELS.Mascotas, 'Mascotas');
    assert.deepEqual(TAB_ICONS.Mascotas, { on: 'paw', off: 'paw-outline' });
    assert.match(app, /name="Mascotas" component=\{MascotasStack\}/);
    assert.match(types, /Mascotas: NavigatorScreenParams/);
    assert.doesNotMatch(packageJson, /"@expo\/vector-icons": "[^"]+",[\s\S]*"new-icon/);
  });

  it('queda inmediatamente a la derecha de + y antes de Mercado', () => {
    assert.deepEqual(MOBILE_TAB_ORDER, [
      'Inicio',
      'Reels',
      'Alertas',
      'Crear',
      'Mascotas',
      'Mercado',
      'Perfil',
    ]);
    assert.equal(tabImmediatelyAfter(MOBILE_TAB_ORDER, 'Crear'), 'Mascotas');
    assert.equal(tabImmediatelyAfter(MOBILE_TAB_ORDER, 'Mascotas'), 'Mercado');
    assert.match(app, /Crear[\s\S]{0,120}Mascotas[\s\S]{0,80}Mercado/);
  });

  it('respeta activo/inactivo con el mismo patrón de iconos on/off', () => {
    assert.equal(isMainTabActive('Mascotas', 'Mascotas'), true);
    assert.equal(isMainTabActive('Inicio', 'Mascotas'), false);
    assert.match(app, /focused \? icons\.on : icons\.off/);
    assert.match(app, /accessibilityState=\{\{ selected: focused \}\}/);
    assert.equal(TAB_LABELS.Perfil, 'Perfil');
  });
});

describe('4–10. pantalla Mis mascotas', () => {
  it('carga mascotas del usuario autenticado desde myPets / myState', () => {
    assert.match(myPets, /const \{ myPets, refreshMyPets \} = useStore\(\)/);
    assert.match(myPets, /refreshMyPets\(\)/);
    assert.match(myPets, /filterPersonalPets\(myPets, profiles\)/);
    assert.match(myPets, /buildMyPetsGrid\(personalPets\)/);
    assert.match(store, /refreshMyPets/);
    assert.match(store, /db\.myState\(\)/);
    assert.match(worker, /action === 'myState'/);
    assert.match(worker, /SELECT \* FROM pets WHERE user_id = \? AND archived_at IS NULL/);
    assert.doesNotMatch(myPets, /db\.petProfile\(/);
  });

  it('la primera tarjeta es Agregar mascota y abre AddPet existente', () => {
    const grid = buildMyPetsGrid([
      { id: 'p1', username: 'nina', avatarUrl: 'https://x/n.png', birthDate: '2023-08-30' },
      { id: 'p2', username: 'toby', birthDate: '2020-01-01' },
    ]);
    assert.equal(grid[0].kind, 'add');
    assert.equal(grid.length, 3);
    assert.match(myPets, /\+ Agregar mascota/);
    assert.match(myPets, /navigate\(ADD_PET_ROUTE\)/);
    assert.equal(ADD_PET_ROUTE, 'AddPet');
    assert.match(app, /name="AddPet"/);
  });

  it('la tarjeta de mascota abre PetProfile existente', () => {
    const pet = { id: 'pet-1', username: 'nina' };
    assert.equal(petProfileNavId(pet), 'nina');
    assert.equal(PET_PROFILE_ROUTE, 'PetProfile');
    assert.match(myPets, /navigate\(PET_PROFILE_ROUTE, \{ petId \}\)/);
    assert.match(tabStack, /name="PetProfile"/);
    assert.doesNotMatch(myPets, /PetProfileScreen/);
  });

  it('calcula edad desde birth_date y no como número fijo', () => {
    const now = new Date(2026, 7, 30);
    assert.equal(ageLabelFromBirthDate('2023-08-30', now), '3 años');
    assert.equal(petCardAgeLabel('2023-08-30', '99 años', now), '3 años');
    assert.match(myPets, /item\.ageLabel/);
  });

  it('fallback limpio sin birth_date ni avatar', () => {
    const now = new Date(2026, 7, 30);
    assert.equal(petCardAgeLabel(null, null, now), '');
    assert.equal(petCardHandle({ id: 'old-1' }), 'Mascota');
    const grid = buildMyPetsGrid([{ id: 'old-1', name: null, username: null, avatarUrl: null, birthDate: null }]);
    assert.equal(grid[1].kind, 'pet');
    if (grid[1].kind === 'pet') {
      assert.equal(grid[1].handle, 'Mascota');
      assert.equal(grid[1].ageLabel, '');
      assert.match(grid[1].avatarUri, /dicebear/);
    }
    assert.match(myPets, /item\.ageLabel \?/);
  });

  it('Quiero adoptar reutiliza WantToAdoptButton → AdoptionDiscovery', () => {
    assert.match(myPets, /WantToAdoptButton/);
    assert.match(myPets, /navigate\(ADOPT_ROUTE\)/);
    assert.equal(ADOPT_ROUTE, 'AdoptionDiscovery');
    assert.match(app, /name="AdoptionDiscovery"/);
    assert.match(tabStack, /name="AdoptionDiscovery"/);
  });

  it('la grilla crece dinámicamente y no recorta a 5', () => {
    const pets = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, username: `m${i}` }));
    const grid = buildMyPetsGrid(pets);
    assert.equal(grid.length, 9);
    assert.equal(grid.filter((x) => x.kind === 'pet').length, 8);
    assert.doesNotMatch(myPets, /slice\(0,\s*5\)/);
  });
});

describe('11–14. Perfil vs Página', () => {
  it('el perfil personal muestra Mis páginas y conserva Editar perfil', () => {
    assert.match(userProfile, /Mis páginas/);
    assert.match(userProfile, /Crear página/);
    assert.match(userProfile, /Editar perfil/);
    assert.doesNotMatch(userProfile, /Mis perfiles/);
    assert.doesNotMatch(userProfile, /Crear perfil/);
    assert.equal(PROFILE_TYPE_LABEL.personal, 'Perfil personal');
    assert.equal(editIdentityLabel('personal'), 'Editar perfil');
    assert.match(app, /name="EditProfile"[\s\S]{0,80}title: 'Editar perfil'/);
    assert.match(editPersonal, /Cambiar foto de perfil/);
  });

  it('empresa y proteccionista usan Página', () => {
    assert.equal(PROFILE_TYPE_LABEL.business, 'Página empresarial');
    assert.equal(PROFILE_TYPE_LABEL.protector, 'Página de proteccionista/refugio');
    assert.equal(isManagedPageType('business'), true);
    assert.equal(isManagedPageType('protector'), true);
    assert.equal(editIdentityLabel('business'), 'Editar página');
    assert.match(limitMessage('business'), /páginas empresariales/);
    assert.match(createSheet, /¿Qué página quieres crear\?/);
    assert.match(createSheet, /Crear página/);
    assert.match(createSheet, /Nueva página empresarial/);
    assert.match(createSheet, /Nueva página de proteccionista\/refugio/);
    assert.match(switcher, /Seleccionar perfil o página/);
    assert.match(switcher, /Crear página/);
    assert.match(app, /name="EditPublicProfile"[\s\S]{0,80}title: 'Editar página'/);
    assert.match(editPublic, /Cambiar foto de la página/);
    assert.match(publicProfile, /editIdentityLabel\(profile\.type\)/);
  });

  it('el perfil de mascota sigue llamándose perfil', () => {
    assert.match(petProfile, /perfil de la mascota/);
    assert.match(petProfile, /Cambiar foto de perfil/);
    assert.match(petProfile, /Cargando perfil/);
    assert.doesNotMatch(petProfile, /página de mascota/);
    assert.doesNotMatch(petProfile, /Editar página/);
  });
});

describe('15–16. contratos y publicación desde página', () => {
  it('no renombra profile_id / author_profile_id ni endpoints', () => {
    assert.match(worker, /author_profile_id/);
    assert.match(worker, /ALTER TABLE pets ADD COLUMN profile_id TEXT/);
    assert.match(db, /authorProfileId/);
    assert.match(db, /action: 'createPost'/);
    assert.match(db, /action: 'myState'/);
    assert.doesNotMatch(db, /author_page_id|page_id/);
    assert.doesNotMatch(worker, /author_page_id/);
  });

  it('publicar desde identidad activa sigue usando activeProfileId', () => {
    assert.match(createPost, /activeProfileId/);
    assert.match(createPost, /<ProfileSwitcher compact \/>/);
    assert.match(createPost, /db\.createPost\(/);
    assert.deepEqual(resolveAppLink('https://animaldex-web.pages.dev/mascotas'), {
      screen: 'Tabs',
      params: { screen: 'Mascotas' },
    });
    assert.match(handles, /'mascotas'/);
    assert.match(handles, /'perfil'/);
  });
});
