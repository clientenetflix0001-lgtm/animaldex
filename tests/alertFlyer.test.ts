import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FLYER_ASPECT,
  FLYER_EXPORT_HEIGHT,
  FLYER_EXPORT_WIDTH,
  buildAlertFlyerData,
  flyerHeadlineForType,
  visibleFlyerFacts,
} from '../lib/alertFlyer.ts';
import {
  FLYER_ACCEPTABLE_BYTES,
  FLYER_HARD_MAX_BYTES,
  FLYER_JPEG_QUALITIES,
  FLYER_MAX_COMPRESS_ATTEMPTS,
  FLYER_SHARE_FORMAT,
  FLYER_SHARE_MIME,
  FLYER_SHARE_UTI,
  flyerJpegQualityForAttempt,
  flyerShareSize,
  pickSmallerFlyer,
  shouldRetryFlyerCompress,
} from '../lib/alertFlyerOptimize.ts';
import { createChooserDestination, createChooserParams } from '../lib/createChooser.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('alert flyer data', () => {
  it('usa tipos reales y omite campos vacíos', () => {
    assert.equal(flyerHeadlineForType('lost'), '🚨 MASCOTA PERDIDA');
    assert.equal(flyerHeadlineForType('sighting'), '👀 MASCOTA AVISTADA');
    assert.equal(flyerHeadlineForType('found'), '🟢 MASCOTA ENCONTRADA');
    assert.equal(flyerHeadlineForType('adoption'), '💜 EN ADOPCIÓN');
    const flyer = buildAlertFlyerData({
      type: 'lost',
      petName: 'Nina',
      species: 'perro',
      sex: 'hembra',
      locality: 'Cerrillos',
      province: 'Salta',
      description: 'Es muy activa',
      image: 'https://example.com/nina.jpg',
    });
    assert.equal(flyer.petName, 'Nina');
    assert.equal(flyer.speciesLabel, 'Perra');
    assert.equal(flyer.ageLabel, undefined);
    assert.equal(flyer.sizeLabel, undefined);
    assert.equal(flyer.contact, undefined);
    assert.equal(flyer.location, 'Cerrillos, Salta');
    assert.ok(!visibleFlyerFacts(flyer).includes('Edad: no disponible'));
    assert.ok(!JSON.stringify(flyer).includes('no disponible'));
    assert.equal(FLYER_ASPECT, 4 / 5);
    assert.equal(FLYER_EXPORT_WIDTH, 1080);
    assert.equal(FLYER_EXPORT_HEIGHT, 1350);
  });

  it('sin Canva ni APIs externas', () => {
    const files = [
      'lib/alertFlyer.ts',
      'lib/alertFlyerShare.ts',
      'lib/share.ts',
      'screens/AlertFlyerPreviewScreen.tsx',
      'screens/MyAlertsScreen.tsx',
      'screens/CreateChooserScreen.tsx',
      'screens/CreateAlertScreen.tsx',
    ];
    for (const file of files) {
      assert.doesNotMatch(read(file), /api\.canva\.com|EXPO_PUBLIC_CANVA|Editar en Canva|canvaConnect|canvaBrandTemplate/i);
    }
    assert.throws(() => read('lib/canvaConnect.ts'));
  });
});

describe('flyer UI wiring', () => {
  it('Mis alertas solo activas; + reutiliza Crear alerta; comparte imagen', () => {
    const mine = read('screens/MyAlertsScreen.tsx');
    assert.match(mine, /Crear flyer/);
    assert.match(mine, /navigate\('AlertFlyerPreview', \{ alertId: item\.id \}\)/);
    assert.match(mine, /!resolved \? \(/);
    assert.equal(createChooserDestination('flyer'), 'CreateAlert');
    assert.deepEqual(createChooserParams('flyer'), { purpose: 'flyer' });
    assert.equal(createChooserDestination('post'), 'CreatePost');
    const chooser = read('screens/CreateChooserScreen.tsx');
    assert.match(chooser, /accessibilityLabel="Crear flyer"/);
    assert.match(chooser, /accessibilityLabel="Crear historia"/);
    const create = read('screens/CreateAlertScreen.tsx');
    assert.match(create, /Publicar alerta/);
    assert.match(create, /Generar flyer/);
    assert.match(create, /purpose === 'flyer'/);
    assert.match(create, /buildAlertFlyerData/);
    const preview = read('screens/AlertFlyerPreviewScreen.tsx');
    assert.match(preview, /db\.createAlert/);
    assert.match(preview, /shareFlyerCanvas/);
    assert.doesNotMatch(preview, /Editar en Canva/);
    assert.match(preview, /aspectRatio: FLYER_ASPECT/);
    const share = read('lib/alertFlyerShare.ts');
    assert.match(share, /react-native-view-shot/);
    assert.match(share, /Sharing\.shareAsync/);
    assert.match(share, /FLYER_SHARE_MIME/);
    assert.match(share, /image-manipulator/);
    assert.doesNotMatch(share, /mimeType: 'image\/png'/);
    assert.doesNotMatch(share, /import \{ captureRef \} from 'react-native-view-shot'/);
    assert.match(share, /deleteFlyerTemp/);
    assert.doesNotMatch(share, /cloudflare|workers\.dev|animaldex-db/i);
    assert.match(read('components/AlertFlyerCanvas.tsx'), /animaldex\.com/);
  });
});

describe('flyer weight', () => {
  it('exporta JPEG 1080x1350 con calidad adaptativa y tope de peso', () => {
    assert.equal(FLYER_SHARE_FORMAT, 'jpeg');
    assert.equal(FLYER_SHARE_MIME, 'image/jpeg');
    assert.equal(FLYER_SHARE_UTI, 'public.jpeg');
    assert.equal(FLYER_EXPORT_WIDTH, 1080);
    assert.equal(FLYER_EXPORT_HEIGHT, 1350);
    assert.equal(FLYER_ASPECT, 4 / 5);
    assert.deepEqual([...FLYER_JPEG_QUALITIES], [0.78, 0.7, 0.68]);
    assert.equal(FLYER_MAX_COMPRESS_ATTEMPTS, 3);
    assert.equal(flyerJpegQualityForAttempt(0), 0.78);
    assert.equal(flyerJpegQualityForAttempt(1), 0.7);
    assert.equal(flyerJpegQualityForAttempt(2), 0.68);
    assert.equal(flyerJpegQualityForAttempt(9), 0.68);
    assert.equal(FLYER_ACCEPTABLE_BYTES, 600 * 1024);
    assert.equal(FLYER_HARD_MAX_BYTES, 800 * 1024);
    assert.equal(shouldRetryFlyerCompress(200 * 1024, 0), false);
    assert.equal(shouldRetryFlyerCompress(601 * 1024, 0), true);
    assert.equal(shouldRetryFlyerCompress(700 * 1024, 2), false);
    assert.deepEqual(flyerShareSize(1080, 1350), { width: 1080, height: 1350 });
    assert.deepEqual(flyerShareSize(2160, 2700), { width: 1080, height: 1350 });
    const first = pickSmallerFlyer(null, { uri: 'a', bytes: 700_000, quality: 0.78 });
    const second = pickSmallerFlyer(first, { uri: 'b', bytes: 420_000, quality: 0.7 });
    assert.equal(second.uri, 'b');
    assert.equal(pickSmallerFlyer(second, { uri: 'c', bytes: 500_000, quality: 0.68 }).uri, 'b');
  });
});
