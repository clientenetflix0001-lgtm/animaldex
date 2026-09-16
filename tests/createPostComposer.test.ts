import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CREATE_POST_SUCCESS_NAV,
  backgroundIdForCreatePost,
  endPublish,
  navigateAfterSuccessfulCreatePost,
  shouldShowBackgroundPreview,
  shouldShowPhotoPreview,
  toggleCreatePostPanel,
  tryBeginPublish,
} from '../lib/createPostPublish.ts';
import {
  DEFAULT_POST_BACKGROUND_ID,
  POST_BACKGROUNDS,
  POST_CAPTION_MAX,
  getActivePostBackgrounds,
  isAllowedBackgroundId,
  resolvePostBackground,
} from '../lib/postBackgrounds.ts';
import { pawLayoutIndexForBackgroundId, PAW_LAYOUTS } from '../lib/pawPrintLayout.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function src(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

const createPost = src('screens/CreatePostScreen.tsx');
const app = src('App.tsx');
const chooser = src('lib/createChooser.ts');
const card = src('components/PostBackgroundCard.tsx');
const overlay = src('components/PawPrintOverlay.tsx');
const switcher = src('features/profiles/ProfileSwitcher.tsx');
const feed = src('screens/FeedScreen.tsx');

describe('Nueva publicación — jerarquía', () => {
  it('1. abrir Nueva publicación desde Crear sigue yendo a CreatePost', () => {
    assert.match(app, /name="CreatePost"/);
    assert.match(app, /component=\{CreatePostScreen\}/);
    assert.match(chooser, /return 'CreatePost'/);
    assert.match(createPost, /export default function CreatePostScreen/);
    assert.match(createPost, /Nueva publicación/);
    assert.match(createPost, /accessibilityLabel="Cerrar"/);
    assert.match(createPost, />Publicar</);
  });

  it('2. texto primero: placeholder, límite 1000 y publicación solo texto', () => {
    assert.match(createPost, /¿Qué querés compartir\?/);
    assert.match(createPost, /maxLength=\{POST_CAPTION_MAX\}/);
    assert.equal(POST_CAPTION_MAX, 1000);
    assert.match(createPost, /db\.createPost\(/);
    assert.match(createPost, /caption\.trim\(\)/);
    assert.match(createPost, /photo \|\| ''/);
    assert.equal(isAllowedBackgroundId(DEFAULT_POST_BACKGROUND_ID), true);
    assert.equal(backgroundIdForCreatePost(false, DEFAULT_POST_BACKGROUND_ID), DEFAULT_POST_BACKGROUND_ID);
  });

  it('3. publicación con fondo: preview solo si el usuario eligió fondo', () => {
    assert.equal(shouldShowBackgroundPreview(false, false), false);
    assert.equal(shouldShowBackgroundPreview(false, true), true);
    assert.equal(shouldShowBackgroundPreview(true, true), false);
    assert.match(createPost, /shouldShowBackgroundPreview/);
    assert.match(createPost, /<PostBackgroundChip/);
    assert.match(createPost, /setBackgroundTouched\(true\)/);
    assert.doesNotMatch(createPost, /Vista previa/);
  });

  it('4. publicación con foto reutiliza picker/upload actual', () => {
    assert.match(createPost, /GALLERY_IMAGE_PICKER_OPTIONS/);
    assert.match(createPost, /uploadImage\(dataUrl\)/);
    assert.match(createPost, /<SelectedImagePreview uri=\{previewUri \|\| photo!\}/);
    assert.equal(shouldShowPhotoPreview(null, null), false);
    assert.equal(shouldShowPhotoPreview('https://img/x', null), true);
    assert.equal(backgroundIdForCreatePost(true, DEFAULT_POST_BACKGROUND_ID), null);
  });

  it('5. protagonista usa el sistema actual y se expande al tocar', () => {
    assert.match(createPost, /petsForPublishingIdentity/);
    assert.match(createPost, /reconcileSelectedPetId/);
    assert.match(createPost, /¿Quién protagoniza esta publicación\?/);
    assert.match(createPost, />Ninguno</);
    assert.match(createPost, /toggleCreatePostPanel\(current, next\)/);
    assert.equal(toggleCreatePostPanel('none', 'pet'), 'pet');
    assert.equal(toggleCreatePostPanel('pet', 'pet'), 'none');
  });

  it('6. Publicar como reutiliza ProfileSwitcher compacto', () => {
    assert.match(createPost, /<ProfileSwitcher compact \/>/);
    assert.match(createPost, /activeProfileId/);
    assert.match(switcher, /PROFILE_TYPE_LABEL/);
    assert.match(switcher, /setActiveProfileId\(p\.id\)/);
  });
});

describe('Nueva publicación — éxito, error y lock', () => {
  it('7. éxito navega a Tabs/Inicio (Feed), no a la ruta Inicio suelta', () => {
    assert.deepEqual(CREATE_POST_SUCCESS_NAV, { name: 'Tabs', params: { screen: 'Inicio' } });
    const calls: unknown[] = [];
    navigateAfterSuccessfulCreatePost({
      navigate: (name, params) => {
        calls.push({ name, params });
      },
    });
    assert.deepEqual(calls, [{ name: 'Tabs', params: { screen: 'Inicio' } }]);
    assert.match(createPost, /navigateAfterSuccessfulCreatePost\(navigation\)/);
    assert.doesNotMatch(createPost, /navigation\.navigate\('Inicio'\)/);
  });

  it('8. publicación creada entra al Feed por notifyPostCreated', () => {
    assert.match(createPost, /notifyPostCreated\(apiPostToPost\(post\)\)/);
    assert.match(feed, /createdPosts/);
    assert.match(feed, /consumeCreatedPosts\(\)/);
  });

  it('9. error no cierra ni limpia: catch solo alerta', () => {
    const publishCatch = createPost.slice(createPost.indexOf("Alert.alert('Error', e?.message || 'No se pudo publicar')"));
    assert.match(publishCatch, /Alert\.alert\('Error'/);
    assert.doesNotMatch(publishCatch.slice(0, 400), /navigateAfterSuccessfulCreatePost/);
    assert.ok(createPost.indexOf("Alert.alert('Error', e?.message || 'No se pudo publicar')") > createPost.indexOf('navigateAfterSuccessfulCreatePost(navigation)'));
  });

  it('10. doble toque Publicar no arranca dos envíos', () => {
    const lock = { current: false };
    assert.equal(tryBeginPublish(lock, false), true);
    assert.equal(tryBeginPublish(lock, false), false);
    assert.equal(tryBeginPublish(lock, false), false);
    endPublish(lock);
    assert.equal(tryBeginPublish(lock, true), false);
    assert.equal(tryBeginPublish(lock, false), true);
    assert.match(createPost, /tryBeginPublish\(publishLock, uploading\)/);
    assert.match(createPost, /disabled=\{publishing \|\| uploading\}/);
  });
});

describe('Fondos — background_id y huellas', () => {
  it('11. fondos mantienen ids y el contrato background_id', () => {
    const ids = POST_BACKGROUNDS.map((bg) => bg.id);
    assert.ok(ids.includes('orange-gradient-01'));
    assert.ok(ids.includes('animaldex-paws-01'));
    assert.equal(DEFAULT_POST_BACKGROUND_ID, 'orange-gradient-01');
    assert.equal(resolvePostBackground('solid-navy-01').id, 'solid-navy-01');
    assert.equal(backgroundIdForCreatePost(false, 'teal-gradient-01'), 'teal-gradient-01');
    assert.match(createPost, /backgroundIdForCreatePost\(!!photo, backgroundId\)/);
  });

  it('12. todos los fondos activos decoran con huellas vectoriales, no emoji', () => {
    const active = getActivePostBackgrounds();
    assert.ok(active.length >= 12);
    const indexes = new Set(active.map((bg) => pawLayoutIndexForBackgroundId(bg.id)));
    assert.equal(PAW_LAYOUTS.length, 3);
    assert.ok(indexes.size >= 2);
    assert.match(card, /<PawPrintOverlay color=\{bg\.textColor\} backgroundId=\{bg\.id\}/);
    assert.doesNotMatch(card, /pattern === 'paws'/);
    assert.doesNotMatch(overlay, /🐾/);
    assert.match(overlay, /name="paw"/);
    assert.doesNotMatch(overlay, /require\(/);
  });

  it('13. posts antiguos siguen resolviendo background_id y foto', () => {
    assert.equal(resolvePostBackground('missing-old-id').id, 'orange-gradient-01');
    assert.match(card, /isTextBackgroundPost\(post\) && post\.backgroundId/);
    assert.match(card, /PostBackgroundTile backgroundId=\{post\.backgroundId\}/);
    assert.match(createPost, /photo \? photoDimensions\?\.width/);
  });
});
