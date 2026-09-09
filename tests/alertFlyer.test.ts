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
    assert.match(read('lib/alertFlyerShare.ts'), /captureRef/);
    assert.match(read('lib/alertFlyerShare.ts'), /Sharing\.shareAsync/);
    assert.match(read('components/AlertFlyerCanvas.tsx'), /animaldex\.com/);
  });
});
