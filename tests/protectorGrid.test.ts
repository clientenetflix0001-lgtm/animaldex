import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { filterProtectorPets } from '../lib/petFields.ts';
import { adoptionStatusOverlay, compactAgeLabel } from '../lib/compactTime.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = readFileSync(join(root, 'screens/PublicProfileScreen.tsx'), 'utf8');
const item = readFileSync(join(root, 'components/ProtectorPetGridItem.tsx'), 'utf8');
const app = readFileSync(join(root, 'App.tsx'), 'utf8');
const linking = readFileSync(join(root, 'app.json'), 'utf8');
const feed = readFileSync(join(root, 'screens/FeedScreen.tsx'), 'utf8');
const postCard = readFileSync(join(root, 'components/PostCard.tsx'), 'utf8');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');

describe('grilla compacta proteccionista', () => {
  it('usa 2 columnas, gap 3 y tiles aspectRatio 1', () => {
    assert.match(pub, /numColumns=\{2\}/);
    assert.match(pub, /PROTECTOR_GRID_GAP/);
    assert.match(item, /export const PROTECTOR_GRID_GAP = 3/);
    assert.match(item, /aspectRatio: 1/);
    assert.doesNotMatch(item, /onLayout/);
    assert.doesNotMatch(pub, /styles\.petTile/);
  });

  it('overlay: estado arriba, nombre abajo, edad a la derecha', () => {
    assert.match(item, /styles\.pill/);
    assert.match(item, /adoptionStatusOverlay/);
    assert.match(item, /compactAgeLabel/);
    assert.match(item, /LinearGradient/);
    assert.doesNotMatch(item, /backgroundColor: colors\.card/);
  });

  it('celdas navegan al perfil de mascota existente', () => {
    assert.match(pub, /navigate\('PetProfile', \{ petId: item\.username \|\| item\.id \}\)/);
  });
});

describe('overlays de datos', () => {
  it('adopción usa adoption_started_at; edad usa birth_date', () => {
    const now = new Date(2026, 7, 23).getTime();
    assert.equal(adoptionStatusOverlay('en_adopcion', new Date(2026, 7, 17).getTime(), now), 'En adopción · Esperando 6D');
    assert.equal(compactAgeLabel('2024-08-23', new Date(2026, 7, 23)), 'Edad 2 AÑOS');
    assert.match(item, /adoptionStartedAt/);
    assert.match(item, /birthDate/);
    assert.doesNotMatch(item, /created_at|createdAt/);
  });

  it('recuperación no muestra espera en la píldora', () => {
    assert.equal(adoptionStatusOverlay('en_recuperacion', Date.now()), 'En recuperación');
    const pets = [
      { careStatus: 'en_recuperacion', species: 'perro', adoptionStartedAt: 1 },
    ];
    assert.equal(filterProtectorPets(pets, 'en_recuperacion', 'todos').length, 1);
  });
});

describe('navegación: tabs anidados, linking intacto', () => {
  it('perfiles viven en createTabProfileStack y el Root Stack se conserva', () => {
    assert.match(app, /createTabProfileStack/);
    assert.match(app, /<Tab\.Screen name="Inicio" component=\{InicioStack\} \/>/);
    assert.match(app, /<Stack\.Screen name="PetProfile" component=\{PetProfileScreen\}/);
    assert.match(app, /function PublicNavigator/);
    assert.match(app, /PetProfile: 'pet\/:petId'/);
    assert.match(app, /PublicProfile: ':username'/);
    assert.doesNotMatch(app, /MobileTabBar[\s\S]{0,80}PetProfileScreen/);
  });

  it('no toca Feed, PostCard, app.json ni Worker', () => {
    assert.match(feed, /onEndReached=\{loadMore\}/);
    assert.match(postCard, /onOpenPet/);
    assert.match(linking, /pathPrefix": "\/pet\//);
    assert.match(worker, /action === 'claimTag'/);
    assert.match(worker, /POST_CAPTION_MAX = 1000/);
  });
});
