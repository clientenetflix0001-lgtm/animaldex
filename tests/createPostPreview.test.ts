import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GALLERY_IMAGE_PICKER_OPTIONS } from '../lib/galleryImagePicker.ts';
import { feedMediaBoxStyle } from '../lib/feedMediaLayout.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function src(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

const createPost = src('screens/CreatePostScreen.tsx');
const createStory = src('screens/CreateStoryScreen.tsx');
const preview = src('components/SelectedImagePreview.tsx');

describe('Create Post — preview de foto de Stories', () => {
  it('1. seleccionar foto muestra preview inmediato con URI local', () => {
    assert.match(createPost, /setPreviewUri\(asset\.uri\)/);
    assert.match(createPost, /previewUri \|\| photo/);
    assert.match(createPost, /<SelectedImagePreview uri=\{previewUri \|\| photo!\}/);
  });

  it('2. preview reutiliza SelectedImagePreview (misma caja que Stories)', () => {
    assert.match(preview, /SELECTED_IMAGE_PREVIEW_HEIGHT = 280/);
    assert.match(preview, /contentFit="cover"/);
    assert.match(preview, /height: SELECTED_IMAGE_PREVIEW_HEIGHT/);
    assert.match(preview, /backgroundColor: '#111'/);
    assert.match(createStory, /<SelectedImagePreview uri=\{trimmedUri \|\| uri\}/);
    assert.match(createPost, /SelectedImagePreview/);
  });

  it('3. aspect ratio: caja fija 280 + cover, sin minHeight vacío', () => {
    assert.doesNotMatch(createPost, /previewImg/);
    assert.doesNotMatch(createPost, /minHeight: 180/);
    assert.doesNotMatch(createPost, /contentFit="contain"/);
    assert.match(createPost, /SelectedImagePreview/);
    const box = feedMediaBoxStyle(1080, 1350);
    assert.equal('aspectRatio' in box, true);
  });

  it('4. publicación sigue el flujo actual (upload + createPost + dimensiones)', () => {
    assert.match(createPost, /uploadImage\(dataUrl\)/);
    assert.match(createPost, /db\.createPost\(/);
    assert.match(createPost, /notifyPostCreated\(apiPostToPost\(post\)\)/);
    assert.match(createPost, /photo \? photoDimensions\?\.width/);
    assert.match(createPost, /GALLERY_IMAGE_PICKER_OPTIONS/);
    assert.equal(GALLERY_IMAGE_PICKER_OPTIONS.allowsEditing, false);
  });
});
