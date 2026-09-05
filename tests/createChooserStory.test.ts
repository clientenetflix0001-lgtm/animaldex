import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createChooserDestination } from '../lib/createChooser.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chooser = readFileSync(join(root, 'screens/CreateChooserScreen.tsx'), 'utf8');
const app = readFileSync(join(root, 'App.tsx'), 'utf8');
const createStory = readFileSync(join(root, 'screens/CreateStoryScreen.tsx'), 'utf8');
const createPost = readFileSync(join(root, 'screens/CreatePostScreen.tsx'), 'utf8');
const createReel = readFileSync(join(root, 'screens/CreateReelScreen.tsx'), 'utf8');
const viewer = readFileSync(join(root, 'screens/StoryViewerScreen.tsx'), 'utf8');
const feed = readFileSync(join(root, 'screens/FeedScreen.tsx'), 'utf8');
const scanner = readFileSync(join(root, 'screens/QRScannerScreen.tsx'), 'utf8');
const ownership = readFileSync(join(root, 'lib/petOwnership.ts'), 'utf8');

describe('botón + Crear historia', () => {
  it('28. aparece Crear historia', () => {
    assert.match(chooser, /accessibilityLabel="Crear historia"/);
    assert.match(chooser, />Historia</);
  });

  it('29. abre CreateStory existente', () => {
    assert.equal(createChooserDestination('story'), 'CreateStory');
    assert.match(chooser, /open\('story'\)/);
    assert.match(app, /name="CreateStory"/);
    assert.match(app, /component=\{CreateStoryScreen\}/);
    assert.match(createStory, /export default function CreateStoryScreen/);
  });

  it('30. Crear publicación intacto', () => {
    assert.equal(createChooserDestination('post'), 'CreatePost');
    assert.match(chooser, /open\('post'\)/);
    assert.match(chooser, />Publicación</);
    assert.match(createPost, /export default function CreatePostScreen/);
  });

  it('31. Crear Reel intacto', () => {
    assert.equal(createChooserDestination('reel'), 'CreateReel');
    assert.match(chooser, /open\('reel'\)/);
    assert.match(chooser, />Reel</);
    assert.match(createReel, /export default function CreateReelScreen/);
  });

  it('32. identidad activa intacta', () => {
    assert.match(createStory, /<ProfileSwitcher compact \/>/);
    assert.match(createStory, /authorProfileId: activeProfileId/);
    assert.match(createStory, /petsForPublishingIdentity/);
  });
});

describe('regresiones puntuales', () => {
  it('33–38. Stories V8, Feed, Reels, QR, perfiles, ownership', () => {
    assert.match(viewer, /Gesture\.Simultaneous\(hold, pan\)/);
    assert.match(viewer, /styles\.stageShell/);
    assert.match(viewer, /storyExplicitSurfaceStyle\(stageBox\)/);
    assert.match(feed, /PostCard/);
    assert.match(app, /name="Reels"/);
    assert.match(scanner, /resolveScannedValue/);
    assert.match(app, /name="UserProfile"/);
    assert.match(app, /name="PublicProfile"/);
    assert.match(ownership, /petsForPublishingIdentity/);
    assert.doesNotMatch(viewer, /createChooserDestination/);
  });
});
