import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAlertFlyerData, flyerHeadlineForType, visibleFlyerFacts } from '../lib/alertFlyer.ts';
import { createChooserDestination, createChooserParams } from '../lib/createChooser.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('alert flyer data', () => {
  it('usa tipos reales y omite campos vacíos', () => {
    assert.equal(flyerHeadlineForType('lost'), 'MASCOTA PERDIDA');
    assert.equal(flyerHeadlineForType('sighting'), 'MASCOTA AVISTADA');
    assert.equal(flyerHeadlineForType('found'), 'MASCOTA ENCONTRADA');
    assert.equal(flyerHeadlineForType('adoption'), 'EN ADOPCIÓN');
    const flyer = buildAlertFlyerData({
      type: 'lost',
      petName: 'Nina',
      species: 'perro',
      locality: 'Cerrillos',
      province: 'Salta',
      description: 'Es muy activa',
      image: 'https://example.com/nina.jpg',
    });
    assert.equal(flyer.petName, 'Nina');
    assert.equal(flyer.sexLabel, undefined);
    assert.equal(flyer.breed, undefined);
    assert.equal(flyer.contact, undefined);
    assert.equal(flyer.location, 'Cerrillos, Salta');
    assert.ok(!visibleFlyerFacts(flyer).includes('Edad: no disponible'));
    assert.ok(!JSON.stringify(flyer).includes('no disponible'));
  });

  it('Canva Autofill oficial y opcional', () => {
    const canva = read('lib/canvaConnect.ts');
    assert.match(canva, /api\.canva\.com\/rest\/v1\/autofills/);
    assert.match(canva, /create_from_brand_template/);
    assert.match(canva, /EXPO_PUBLIC_CANVA_ACCESS_TOKEN/);
    assert.match(canva, /canva\.com\/templates/);
    assert.match(read('screens/AlertFlyerPreviewScreen.tsx'), /createCanvaAutofillJob/);
    assert.match(read('screens/AlertFlyerPreviewScreen.tsx'), /canvaTemplateSearchUrl/);
  });
});

describe('flyer UI wiring', () => {
  it('Mis alertas solo activas; + reutiliza Crear alerta', () => {
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
    assert.match(read('screens/AlertFlyerPreviewScreen.tsx'), /db\.createAlert/);
    assert.match(read('lib/share.ts'), /shareAlertFlyer/);
  });
});
