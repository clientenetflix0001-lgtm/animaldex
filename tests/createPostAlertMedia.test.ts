import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GALLERY_IMAGE_PICKER_OPTIONS } from '../lib/galleryImagePicker.ts';
import {
  FEED_MAX_LANDSCAPE_ASPECT,
  FEED_MIN_PORTRAIT_ASPECT,
  feedMediaBox,
} from '../lib/feedMediaLayout.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function src(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

const createStory = src('screens/CreateStoryScreen.tsx');
const createAlert = src('screens/CreateAlertScreen.tsx');
const alertCard = src('components/AlertCard.tsx');
const alertDetail = src('screens/AlertDetailScreen.tsx');
const myAlerts = src('screens/MyAlertsScreen.tsx');
const alertsFeed = src('screens/AlertsScreen.tsx');
const postCard = src('components/PostCard.tsx');
const adaptive = src('components/AdaptivePostImage.tsx');
const picker = src('lib/galleryImagePicker.ts');
const worker = src('worker/index.js');
const db = src('lib/db.ts');
const storiesViewer = src('screens/StoryViewerScreen.tsx');
const storiesTest = src('tests/stories.test.ts');
const feedScreen = src('screens/FeedScreen.tsx');

describe('Create Alert — picker sin recorte', () => {
  it('5. picker no fuerza crop', () => {
    assert.match(createAlert, /GALLERY_IMAGE_PICKER_OPTIONS/);
    assert.equal(GALLERY_IMAGE_PICKER_OPTIONS.allowsEditing, false);
    assert.doesNotMatch(picker, /allowsEditing:\s*true/);
    assert.doesNotMatch(createAlert, /allowsEditing:\s*true/);
    assert.doesNotMatch(createAlert, /aspect:\s*\[1,\s*1\]/);
  });

  it('6–8. vertical / horizontal / cuadrada conservan ratio (sin recorte a 1:1)', () => {
    const vertical = feedMediaBox(1080, 1920);
    assert.equal(vertical.kind, 'aspect');
    if (vertical.kind === 'aspect') assert.equal(vertical.aspectRatio, FEED_MIN_PORTRAIT_ASPECT);

    const horizontal = feedMediaBox(1920, 1080);
    assert.equal(horizontal.kind, 'aspect');
    if (horizontal.kind === 'aspect') {
      assert.ok(horizontal.aspectRatio <= FEED_MAX_LANDSCAPE_ASPECT);
      assert.ok(horizontal.aspectRatio > 1);
    }

    const square = feedMediaBox(1200, 1200);
    assert.deepEqual(square, { kind: 'aspect', aspectRatio: 1 });
    assert.doesNotMatch(createAlert, /aspect:\s*\[1,\s*1\]/);
  });
});

describe('Alert card — full width + preview del Feed', () => {
  it('9–11. imagen full-width con layout feed y sin margen lateral de card', () => {
    assert.match(alertCard, /<AdaptivePostImage/);
    assert.match(alertCard, /layout="feed"/);
    assert.match(alertCard, /width: '100%'/);
    assert.doesNotMatch(alertCard, /marginHorizontal: spacing\.lg/);
    assert.doesNotMatch(alertCard, /aspectRatio: 1/);
    assert.match(alertCard, /useImageNaturalSize\(alert\.image\)/);
    assert.match(alertCard, /imageWidth=\{natural\?\.width\}/);
    assert.match(alertCard, /imageHeight=\{natural\?\.height\}/);
  });

  it('12–13. tap abre AdaptivePostImage y X cierra', () => {
    assert.match(adaptive, /allowFullScreen = true/);
    assert.match(adaptive, /setModalVisible\(true\)/);
    assert.match(adaptive, /accessibilityLabel="Cerrar imagen completa"/);
    assert.match(adaptive, /onRequestClose=\{\(\) => setModalVisible\(false\)\}/);
    assert.match(alertCard, /<AdaptivePostImage/);
    assert.doesNotMatch(alertCard, /onDoubleTap/);
  });
});

describe('Alert detail — misma media', () => {
  it('14–15. imagen responsive y tap preview', () => {
    assert.match(alertDetail, /<AdaptivePostImage/);
    assert.match(alertDetail, /layout="feed"/);
    assert.match(alertDetail, /useImageNaturalSize\(alert\?\.image\)/);
    assert.doesNotMatch(alertDetail, /aspectRatio: 1/);
    assert.doesNotMatch(alertDetail, /style=\{styles\.image\}/);
  });
});

describe('regresiones Alertas / Feed / Stories', () => {
  it('16. Crear alerta intacto', () => {
    assert.match(createAlert, /ALERT_CREATE_PRIMARY/);
    assert.match(createAlert, /db\.createAlert\(/);
    assert.match(createAlert, /Publicar alerta/);
    assert.match(createAlert, /type: resolvedType/);
  });

  it('17. Mis alertas intacto', () => {
    assert.match(myAlerts, /myAlerts/);
    assert.match(alertsFeed, /navigate\('MyAlerts'\)/);
    assert.match(myAlerts, /alertResolveActionLabel/);
  });

  it('18. Renovar intacto', () => {
    assert.match(myAlerts, /renewAlert/);
    assert.match(db, /action: 'renewAlert'/);
    assert.match(worker, /if \(action === 'renewAlert'\)/);
  });

  it('19. Resolver intacto', () => {
    assert.match(myAlerts, /resolveAlert/);
    assert.match(db, /action: 'resolveAlert'/);
    assert.match(worker, /if \(action === 'resolveAlert'\)/);
  });

  it('20. Difundir intacto', () => {
    assert.match(alertCard, /DIFUNDIR/);
    assert.match(alertDetail, /DIFUNDIR/);
    assert.match(alertCard, /shareAlert\(alert\)/);
  });

  it('21. reportar no se introduce ni se borra lógica de alerta', () => {
    assert.doesNotMatch(alertCard, /reportAlert|reportar/);
    assert.doesNotMatch(alertDetail, /reportAlert|reportar/);
    assert.doesNotMatch(createAlert, /resolved_at|renewed_at/);
  });

  it('22. comentarios intactos', () => {
    assert.match(alertDetail, /db\.alertComment/);
    assert.match(alertCard, /onOpenComments/);
    assert.match(alertsFeed, /navigate\('AlertDetail'/);
  });

  it('23. Feed principal intacto', () => {
    assert.match(postCard, /layout="feed"/);
    assert.match(postCard, /<AdaptivePostImage/);
    assert.match(feedScreen, /onEndReached=\{loadMore\}/);
    assert.doesNotMatch(adaptive, /getSize/);
  });

  it('24. Stories V8 intactas', () => {
    assert.match(storiesViewer, /stageShell/);
    assert.match(storiesViewer, /Gesture\.Simultaneous\(hold, pan\)/);
    assert.match(storiesViewer, /progress\.value = withTiming/);
    assert.match(storiesTest, /stageShell/);
    assert.match(storiesTest, /Simultaneous/);
    assert.match(createStory, /SelectedImagePreview/);
  });

  it('backend: alerts siguen sin image_w/h; Worker no cambia schema', () => {
    const alertIface = db.slice(db.indexOf('export interface ApiAlert'), db.indexOf('export interface ApiListing'));
    assert.equal(alertIface.includes('imageWidth'), false);
    assert.equal(alertIface.includes('image_w'), false);
    assert.doesNotMatch(worker, /ALTER TABLE alerts ADD COLUMN image_w/);
    assert.match(worker, /INSERT INTO alerts \(id, user_id, type, status/);
  });
});
