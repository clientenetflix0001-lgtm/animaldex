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
  finiteCoord,
  flyerAccentForType,
  flyerFactRows,
  flyerHeadlineForType,
  flyerLocationLabelForType,
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
import {
  clearFlyerDraft,
  getFlyerDraft,
  isFlyerDraftReady,
  resolveFlyerPreviewOrigin,
  setFlyerDraft,
} from '../lib/alertFlyerSession.ts';
import { createChooserDestination, createChooserOpen, createChooserParams } from '../lib/createChooser.ts';
import { navigateRoot } from '../lib/rootNavigate.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('alert flyer data', () => {
  it('usa tipos reales y omite campos vacíos', () => {
    assert.equal(flyerHeadlineForType('lost'), '¡SE BUSCA!');
    assert.equal(flyerHeadlineForType('sighting'), 'MASCOTA AVISTADA');
    assert.equal(flyerHeadlineForType('found'), 'MASCOTA ENCONTRADA');
    assert.equal(flyerHeadlineForType('adoption'), 'BUSCA UN HOGAR');
    assert.equal(flyerLocationLabelForType('lost'), 'Última ubicación');
    assert.equal(flyerLocationLabelForType('sighting'), 'Lugar del avistamiento');
    assert.equal(flyerLocationLabelForType('found'), 'Lugar donde fue encontrada');
    assert.equal(flyerAccentForType('lost'), '#D97A68');
    assert.equal(flyerAccentForType('found'), '#6BAF7C');
    assert.equal(flyerAccentForType('sighting'), '#4E9C9A');
    assert.equal(flyerAccentForType('adoption'), '#A78BB8');
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
    assert.equal(flyer.speciesLabel, 'Perro');
    assert.equal(flyer.sexLabel, 'Hembra');
    assert.equal(flyer.ageLabel, undefined);
    assert.equal(flyer.sizeLabel, undefined);
    assert.equal(flyer.breed, undefined);
    assert.equal(flyer.colorLabel, undefined);
    assert.equal(flyer.contact, undefined);
    assert.equal(flyer.location, 'Cerrillos, Salta');
    assert.equal(flyer.locationLabel, 'Última ubicación');
    assert.deepEqual(
      flyerFactRows(flyer).map((row) => row.label),
      ['Especie', 'Sexo']
    );
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
    assert.deepEqual(createChooserOpen('flyer'), { screen: 'CreateAlert', params: { purpose: 'flyer' } });
    assert.equal(createChooserDestination('post'), 'CreatePost');
    const chooser = read('screens/CreateChooserScreen.tsx');
    assert.match(chooser, /accessibilityLabel="Crear flyer"/);
    assert.match(chooser, /accessibilityLabel="Crear historia"/);
    assert.match(chooser, /createChooserOpen/);
    assert.match(chooser, /navigateRoot\(navigation, screen, params\)/);
    assert.doesNotMatch(chooser, /getParent/);
    const create = read('screens/CreateAlertScreen.tsx');
    assert.match(create, /Publicar alerta/);
    assert.match(create, /Generar flyer/);
    assert.match(create, /purpose === 'flyer'/);
    assert.match(create, /buildAlertFlyerData/);
    assert.match(create, /setFlyerDraft/);
    assert.match(create, /isFlyerDraftReady/);
    assert.match(create, /navigateRoot\(navigation, 'AlertFlyerPreview', \{ from: 'draft' \}\)/);
    assert.doesNotMatch(create, /AlertFlyerPreview',\s*\{\s*source/);
    const preview = read('screens/AlertFlyerPreviewScreen.tsx');
    assert.match(preview, /db\.createAlert/);
    assert.match(preview, /shareFlyerCanvas/);
    assert.match(preview, /resolveFlyerPreviewOrigin/);
    assert.match(preview, /getFlyerDraft/);
    assert.match(preview, /FlyerRenderGuard/);
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
    const canvas = read('components/AlertFlyerCanvas.tsx');
    assert.match(canvas, /animaldex\.com/);
    assert.match(canvas, /animaldex-logo-mark\.png/);
    assert.match(canvas, /heroBand/);
    assert.match(canvas, /sidePanel/);
    assert.match(canvas, /SI TENÉS INFORMACIÓN/);
    assert.match(canvas, /Juntos los encontramos/);
    assert.match(canvas, /resizeMode="contain"/);
    assert.doesNotMatch(canvas, /resizeMode="cover"/);
    assert.match(canvas, /fontSize: 20/);
    assert.match(canvas, /paddingVertical: 7/);
  });
});

describe('flyer + draft preview', () => {
  it('CreateChooser → draft válido abre preview; draft faltante no navega', () => {
    clearFlyerDraft();
    assert.equal(isFlyerDraftReady(), false);
    assert.deepEqual(resolveFlyerPreviewOrigin({}), { mode: 'invalid' });
    assert.deepEqual(resolveFlyerPreviewOrigin({ from: 'draft' }), { mode: 'invalid' });
    const flyer = buildAlertFlyerData({
      type: 'lost',
      petName: 'Nina',
      species: 'perro',
      locality: 'Cerrillos',
      image: 'https://example.com/nina.jpg',
      description: 'Collar rojo',
    });
    setFlyerDraft({
      source: 'draft',
      flyer: { ...flyer, image: undefined },
      publish: {
        type: 'lost',
        species: 'perro',
        description: 'Collar rojo',
        image: '',
        locality: 'Cerrillos',
      },
    });
    assert.equal(isFlyerDraftReady(), false);
    setFlyerDraft({
      source: 'draft',
      flyer,
      publish: {
        type: 'lost',
        species: 'perro',
        description: 'Collar rojo',
        image: 'https://example.com/nina.jpg',
        locality: 'Cerrillos',
      },
    });
    const draft = getFlyerDraft();
    assert.equal(draft?.source, 'draft');
    assert.equal(draft?.alertId, undefined);
    assert.equal(isFlyerDraftReady(), true);
    assert.deepEqual(resolveFlyerPreviewOrigin({ from: 'draft' }), { mode: 'draft' });
    assert.deepEqual(resolveFlyerPreviewOrigin({ alertId: 'alert_1' }), { mode: 'existing', alertId: 'alert_1' });
    assert.equal(finiteCoord(Number.NaN), null);
    assert.equal(finiteCoord(24.1), 24.1);
    const preview = read('screens/AlertFlyerPreviewScreen.tsx');
    assert.doesNotMatch(preview, /session\.alert\.id/);
    assert.match(preview, /origin\.mode === 'draft'/);
    assert.match(preview, /Preparando flyer/);
    assert.match(preview, /No pudimos preparar el flyer/);
    assert.match(read('screens/MyAlertsScreen.tsx'), /alertId: item\.id/);
    const create = read('screens/CreateAlertScreen.tsx');
    assert.match(create, /isFlyerDraftReady\(\)/);
    assert.doesNotMatch(create, /navigateRoot[\s\S]*from: 'draft'[\s\S]*setFlyerDraft/);
    const calls: Array<[string, object?]> = [];
    const root = { navigate: (n: string, p?: object) => calls.push([n, p]) };
    const tabs = { getParent: () => root, navigate: () => { throw new Error('tab'); } };
    const screen = { getParent: () => tabs, navigate: () => { throw new Error('screen'); } };
    navigateRoot(screen, 'CreateAlert', { purpose: 'flyer' });
    navigateRoot(screen, 'AlertFlyerPreview', { from: 'draft' });
    assert.deepEqual(calls, [
      ['CreateAlert', { purpose: 'flyer' }],
      ['AlertFlyerPreview', { from: 'draft' }],
    ]);
    clearFlyerDraft();
    assert.equal(isFlyerDraftReady(), false);
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
    assert.equal(FLYER_ACCEPTABLE_BYTES, 600 * 1024);
    assert.equal(FLYER_HARD_MAX_BYTES, 800 * 1024);
    assert.equal(shouldRetryFlyerCompress(200 * 1024, 0), false);
    assert.equal(shouldRetryFlyerCompress(601 * 1024, 0), true);
    assert.deepEqual(flyerShareSize(2160, 2700), { width: 1080, height: 1350 });
    const first = pickSmallerFlyer(null, { uri: 'a', bytes: 700_000, quality: 0.78 });
    const second = pickSmallerFlyer(first, { uri: 'b', bytes: 420_000, quality: 0.7 });
    assert.equal(second.uri, 'b');
  });
});
