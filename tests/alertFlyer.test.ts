import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FLYER_ASPECT,
  FLYER_EXPORT_HEIGHT,
  FLYER_EXPORT_WIDTH,
  FLYER_FALLBACK_HEIGHT,
  FLYER_FALLBACK_WIDTH,
  FLYER_PHOTO_HEIGHT_COMPACT,
  FLYER_PHOTO_HEIGHT_NORMAL,
  FLYER_PHOTO_WIDTH,
  buildAlertFlyerData,
  finiteCoord,
  flyerAccentForType,
  flyerContentDensity,
  flyerDescriptionLines,
  flyerFactRows,
  flyerFromApiAlert,
  flyerHeadlineForType,
  flyerLocationLabelForType,
  flyerMetaLine,
  flyerPetPublicUrl,
  visibleFlyerFacts,
} from '../lib/alertFlyer.ts';
import {
  FLYER_ACCEPTABLE_BYTES,
  FLYER_HARD_MAX_BYTES,
  FLYER_IDEAL_MAX_BYTES,
  FLYER_IDEAL_MIN_BYTES,
  FLYER_JPEG_QUALITIES,
  FLYER_MAX_COMPRESS_ATTEMPTS,
  FLYER_SHARE_FORMAT,
  FLYER_SHARE_MIME,
  FLYER_SHARE_UTI,
  flyerFallbackShareSize,
  flyerJpegQualityForAttempt,
  flyerShareSize,
  pickSmallerFlyer,
  shouldFallbackFlyerResolution,
  shouldRetryFlyerCompress,
} from '../lib/alertFlyerOptimize.ts';
import {
  clearFlyerDraft,
  emptyFlyerDraft,
  getFlyerDraft,
  isFlyerDraftReady,
  resolveFlyerPreviewOrigin,
  setFlyerDraft,
  startEmptyFlyerDraft,
} from '../lib/alertFlyerSession.ts';
import { createChooserDestination, createChooserOpen, createChooserOpensInCrearStack, createChooserParams } from '../lib/createChooser.ts';
import { navigateRoot } from '../lib/rootNavigate.ts';
import {
  CREAR_FLYER_DRAFT_ROUTE,
  CREAR_FLYER_PREVIEW_ROUTE,
  nestedCrearRouteName,
  shouldHideCrearTabBar,
} from '../lib/crearFlyerRoutes.ts';
import { flyerPreviewFooterPadding, flyerPreviewFrameSize, flyerPreviewNeedsScroll } from '../lib/flyerPreviewLayout.ts';

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
    assert.equal(FLYER_ASPECT, 9 / 16);
    assert.equal(FLYER_EXPORT_WIDTH, 1080);
    assert.equal(FLYER_EXPORT_HEIGHT, 1920);
    assert.equal(flyerPetPublicUrl('nina.pet'), 'https://animaldex.com/nina.pet');
    assert.equal(flyerPetPublicUrl('@Nina.pet'), 'https://animaldex.com/nina.pet');
    assert.equal(flyerPetPublicUrl(''), undefined);
    assert.equal(flyerPetPublicUrl('pet_abc123'), undefined);
    assert.equal(flyerPetPublicUrl('nina'), undefined);
    assert.ok(!String(flyerPetPublicUrl('nina.pet')).includes('/pet/'));
    const withHandle = buildAlertFlyerData({
      type: 'lost',
      petName: 'Nina',
      species: 'perro',
      locality: 'Cerrillos',
      image: 'https://example.com/nina.jpg',
      petUsername: 'nina.pet',
    });
    assert.equal(withHandle.petPublicUrl, 'https://animaldex.com/nina.pet');
    assert.equal(flyerMetaLine(withHandle), 'Perro');
    const noHandle = buildAlertFlyerData({
      type: 'lost',
      petName: 'Nina',
      locality: 'Cerrillos',
      image: 'https://example.com/nina.jpg',
    });
    assert.equal(noHandle.petPublicUrl, undefined);
    const fromApi = flyerFromApiAlert({
      id: 'a1',
      userId: 'u1',
      type: 'lost',
      status: 'active',
      petName: 'Nina',
      species: 'perro',
      breed: '',
      description: 'ok',
      image: 'https://example.com/nina.jpg',
      locality: 'Cerrillos',
      province: 'Salta',
      country: 'AR',
      lat: null,
      lon: null,
      eventDate: null,
      createdAt: 1,
      likeCount: 0,
      commentCount: 0,
      isLiked: false,
      username: null,
      userName: null,
      userAvatar: null,
    });
    assert.equal(fromApi.petPublicUrl, undefined);
  });

  it('sin Canva ni APIs externas', () => {
    const files = [
      'lib/alertFlyer.ts',
      'lib/alertFlyerShare.ts',
      'lib/alertFlyerSession.ts',
      'lib/alertFlyerOptimize.ts',
      'lib/alertPhotoUpload.ts',
      'lib/rootNavigate.ts',
      'lib/pushRootScreen.ts',
      'lib/share.ts',
      'lib/createChooser.ts',
      'lib/crearFlyerRoutes.ts',
      'lib/flyerPreviewLayout.ts',
      'lib/flyerDebug.ts',
      'components/AlertFlyerCanvas.tsx',
      'components/FlyerFlowBoundary.tsx',
      'screens/CreateFlyerScreens.tsx',
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
    assert.equal(createChooserDestination('flyer'), 'CreateFlyerDraft');
    assert.equal(createChooserOpensInCrearStack('flyer'), true);
    assert.equal(createChooserOpensInCrearStack('post'), false);
    assert.deepEqual(createChooserParams('flyer'), { purpose: 'flyer' });
    assert.deepEqual(createChooserOpen('flyer'), { screen: 'CreateFlyerDraft', params: { purpose: 'flyer' } });
    assert.equal(createChooserDestination('post'), 'CreatePost');
    const chooser = read('screens/CreateChooserScreen.tsx');
    assert.match(chooser, /accessibilityLabel="Crear flyer"/);
    assert.match(chooser, /accessibilityLabel="Crear historia"/);
    assert.match(chooser, /createChooserOpen/);
    assert.match(chooser, /createChooserOpensInCrearStack/);
    assert.match(chooser, /navigation\.navigate\(screen, params\)/);
    assert.doesNotMatch(chooser, /getParent/);
    const tabStack = read('lib/tabProfileStack.tsx');
    assert.match(tabStack, /name="CreateFlyerDraft"/);
    assert.match(tabStack, /name="CreateFlyerPreview"/);
    assert.doesNotMatch(tabStack, /name="CreateAlert"/);
    assert.doesNotMatch(tabStack, /name="AlertFlyerPreview"/);
    const rootNav = read('lib/pushRootScreen.ts');
    assert.match(rootNav, /export function pushRootScreen/);
    assert.match(rootNav, /navigationRef\.isReady/);
    assert.match(rootNav, /navigationRef\.navigate/);
    const app = read('App.tsx');
    assert.match(app, /const CrearStack = createTabProfileStack\(CreateChooserScreen\)/);
    assert.match(app, /name="Crear" component=\{CrearStack\}/);
    const create = read('screens/CreateAlertScreen.tsx');
    assert.match(create, /Publicar alerta/);
    assert.match(create, /Generar flyer/);
    assert.match(create, /purpose === 'flyer'/);
    assert.match(create, /buildAlertFlyerData/);
    assert.match(create, /setFlyerDraft/);
    assert.match(create, /isFlyerDraftReady/);
    assert.match(create, /CREAR_FLYER_PREVIEW_ROUTE/);
    assert.match(create, /navigation\.navigate\(CREAR_FLYER_PREVIEW_ROUTE, \{ from: 'draft' \}\)/);
    assert.doesNotMatch(create, /pushRootScreen\('AlertFlyerPreview'/);
    assert.doesNotMatch(create, /navigateRoot/);
    assert.doesNotMatch(create, /getParent/);
    assert.doesNotMatch(create, /createPet/);
    assert.doesNotMatch(create, /AlertFlyerPreview',\s*\{\s*source/);
    assert.match(create, /Usar una de mis mascotas/);
    assert.match(create, /petsForPublishingIdentity/);
    assert.match(create, /if \(flyerMode\) \{\s*setImage\(dataUrl\);\s*return;/);
    assert.match(create, /petUsername: flyerPetUsername/);
    assert.match(create, /petId: activePetId/);
    const preview = read('screens/AlertFlyerPreviewScreen.tsx');
    assert.match(preview, /db\.createAlert/);
    assert.match(preview, /ensureAlertImageUploaded/);
    assert.match(preview, /shareFlyerCanvas/);
    assert.match(preview, /resolveFlyerPreviewOrigin/);
    assert.match(preview, /getFlyerDraft/);
    assert.match(preview, /FlyerRenderGuard/);
    assert.match(preview, /flyerPreviewFooterPadding/);
    assert.match(preview, /flyerPreviewFrameSize/);
    assert.match(preview, /paddingBottom: footerPad/);
    assert.match(preview, /styles\.footer/);
    assert.doesNotMatch(preview, /maxWidth: 520/);
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
    const upload = read('lib/alertPhotoUpload.ts');
    assert.match(upload, /export async function ensureAlertImageUploaded/);
    assert.match(upload, /registerImage/);
    const canvas = read('components/AlertFlyerCanvas.tsx');
    assert.match(canvas, /animaldex\.com/);
    assert.match(canvas, /animaldex-logo-mark\.png/);
    assert.match(canvas, /heroBand/);
    assert.match(canvas, /photoStage/);
    assert.match(canvas, /flyer\.contact/);
    assert.match(canvas, /flyer\.petPublicUrl/);
    assert.match(canvas, /backgroundColor: '#FFFFFF'/);
    assert.match(canvas, /FLYER_PHOTO_WIDTH/);
    assert.match(canvas, /alignSelf: 'center'/);
    assert.match(canvas, /flyerContentDensity/);
    assert.match(canvas, /FLYER_PHOTO_HEIGHT_COMPACT/);
    assert.match(canvas, /FLYER_PHOTO_HEIGHT_NORMAL/);
    assert.match(canvas, /numberOfLines=\{1\}/);
    assert.match(canvas, /numberOfLines=\{2\}/);
    assert.match(canvas, /ellipsizeMode="tail"/);
    assert.doesNotMatch(canvas, /minHeight: 168/);
    assert.doesNotMatch(canvas, /photoStage: \{[^}]*flex: 1/);
    assert.doesNotMatch(canvas, /position: 'absolute'/);
    assert.doesNotMatch(canvas, /name: \{[^}]*position: 'absolute'/);
    assert.doesNotMatch(canvas, /block: \{[^}]*position: 'absolute'/);
    assert.doesNotMatch(canvas, /ctaBand: \{[^}]*position: 'absolute'/);
  });
});

describe('flyer + draft preview', () => {
  it('CreateFlyerDraft nace vacío en memoria y no exige alerta ni mascota', () => {
    clearFlyerDraft();
    const draft = startEmptyFlyerDraft();
    assert.equal(draft.source, 'draft');
    assert.equal(draft.alertId, undefined);
    assert.equal(draft.petId, undefined);
    assert.equal(draft.petUsername, undefined);
    assert.equal(draft.flyer.type, 'lost');
    assert.equal(draft.flyer.image, undefined);
    assert.equal(draft.flyer.petPublicUrl, undefined);
    assert.equal(draft.publish, undefined);
    assert.equal(isFlyerDraftReady(draft), false);
    assert.equal(getFlyerDraft()?.source, 'draft');
    assert.deepEqual(resolveFlyerPreviewOrigin({ from: 'draft' }), { mode: 'invalid' });
    const blank = emptyFlyerDraft();
    assert.equal(blank.flyer.petPublicUrl, undefined);
    const screens = read('screens/CreateFlyerScreens.tsx');
    assert.match(screens, /startEmptyFlyerDraft/);
    assert.match(screens, /CREATE_FLYER_DRAFT_INIT/);
    assert.match(screens, /CREATE_FLYER_DRAFT_READY/);
    assert.match(screens, /CREATE_FLYER_DRAFT_ERROR/);
    assert.match(screens, /<CreateAlertScreen \/>/);
    assert.doesNotMatch(screens, /FlyerFlowBoundary route=\{CREAR_FLYER_DRAFT_ROUTE\}/);
    const create = read('screens/CreateAlertScreen.tsx');
    assert.match(create, /startEmptyFlyerDraft/);
    assert.match(create, /CREATE_FLYER_DRAFT_INIT/);
    assert.match(create, /Usar una de mis mascotas/);
    assert.match(create, /applyExistingPet/);
    assert.match(create, /setFlyerPetUsername\(pet\.username/);
    assert.doesNotMatch(create, /createPet/);
  });

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
    const withPet = buildAlertFlyerData({
      type: 'lost',
      petName: 'Nina',
      species: 'perro',
      sex: 'hembra',
      locality: 'Cerrillos',
      image: 'https://example.com/nina.jpg',
      petUsername: 'nina.pet',
    });
    setFlyerDraft({
      source: 'draft',
      petId: 'pet_1',
      petUsername: 'nina.pet',
      flyer: withPet,
      publish: {
        type: 'lost',
        species: 'perro',
        description: 'Collar rojo',
        image: 'https://example.com/nina.jpg',
        locality: 'Cerrillos',
      },
    });
    assert.equal(getFlyerDraft()?.petId, 'pet_1');
    assert.equal(getFlyerDraft()?.petUsername, 'nina.pet');
    assert.equal(getFlyerDraft()?.flyer.petPublicUrl, 'https://animaldex.com/nina.pet');
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
    assert.match(create, /navigation\.navigate\(CREAR_FLYER_PREVIEW_ROUTE, \{ from: 'draft' \}\)/);
    assert.doesNotMatch(create, /navigate[\s\S]*from: 'draft'[\s\S]*setFlyerDraft/);
    assert.doesNotMatch(create, /createPet/);
    assert.match(create, /if \(flyerMode\) \{\s*setImage\(dataUrl\);\s*return;/);
    assert.doesNotMatch(create, /flyerMode[\s\S]{0,80}db\.createAlert/);
    const calls: Array<[string, object?]> = [];
    const tooHigh = {
      navigate: () => {
        throw new Error('overshoot');
      },
      getState: () => ({ routeNames: [] as string[] }),
    };
    const root = {
      navigate: (n: string, p?: object) => calls.push([n, p]),
      getState: () => ({ routeNames: ['CreateAlert', 'AlertFlyerPreview', 'Tabs'] }),
      getParent: () => tooHigh,
    };
    const tabs = {
      getParent: () => root,
      navigate: () => {
        throw new Error('tab');
      },
      getState: () => ({ routeNames: ['Inicio', 'Crear'] }),
    };
    const screen = {
      getParent: () => tabs,
      navigate: () => {
        throw new Error('screen');
      },
      getState: () => ({ routeNames: ['Inicio', 'Crear'] }),
    };
    navigateRoot(screen, 'CreateAlert', { purpose: 'flyer' });
    navigateRoot(root, 'AlertFlyerPreview', { from: 'draft' });
    assert.deepEqual(calls, [
      ['CreateAlert', { purpose: 'flyer' }],
      ['AlertFlyerPreview', { from: 'draft' }],
    ]);
    clearFlyerDraft();
    assert.equal(isFlyerDraftReady(), false);
  });
});

describe('flyer + crear flyer root navigation', () => {
  it('+ abre CreateFlyerDraft en el stack del tab Crear', () => {
    const chooser = read('screens/CreateChooserScreen.tsx');
    assert.match(chooser, /createChooserOpensInCrearStack/);
    assert.match(chooser, /navigation\.navigate\(screen, params\)/);
    assert.doesNotMatch(chooser, /getParent\(\)/);
    assert.equal(createChooserDestination('flyer'), CREAR_FLYER_DRAFT_ROUTE);
    assert.deepEqual(createChooserOpen('flyer'), { screen: 'CreateFlyerDraft', params: { purpose: 'flyer' } });
    const tabStack = read('lib/tabProfileStack.tsx');
    assert.match(tabStack, /name="TabRoot"/);
    assert.match(tabStack, /name="CreateFlyerDraft"/);
    assert.match(tabStack, /name="CreateFlyerPreview"/);
    assert.doesNotMatch(tabStack, /name="CreateAlert"/);
    assert.doesNotMatch(tabStack, /name="AlertFlyerPreview"/);
    const app = read('App.tsx');
    assert.match(app, /name="CreateAlert"/);
    assert.match(app, /name="AlertFlyerPreview"/);
    assert.match(app, /const CrearStack = createTabProfileStack\(CreateChooserScreen\)/);
    assert.match(app, /shouldHideCrearTabBar/);
    assert.match(read('screens/MyAlertsScreen.tsx'), /navigate\('AlertFlyerPreview', \{ alertId: item\.id \}\)/);
    assert.match(read('lib/flyerDebug.ts'), /lastFlyerDebugStage/);
    assert.match(read('lib/flyerDebug.ts'), /FLYER_DEBUG_01_PRESS/);
    assert.doesNotMatch(read('lib/flyerDebug.ts'), /petName|photo|telefono|email|descripcion/i);
  });
});

describe('flyer preview footer and crear local routes', () => {
  it('footer usa inset real y + no cruza al Root Stack', () => {
    assert.equal(flyerPreviewFooterPadding(0), 12);
    assert.equal(flyerPreviewFooterPadding(24), 32);
    assert.equal(flyerPreviewFooterPadding(8), 16);
    const size = flyerPreviewFrameSize(390, 700);
    assert.ok(size.width <= 390 - 32);
    assert.equal(size.width, 390 - 32);
    assert.equal(Math.round((size.width / size.height) * 10000) / 10000, 9 / 16);
    assert.ok(size.height > 500);
    const short = flyerPreviewFrameSize(390, 200);
    assert.equal(short.width, size.width);
    assert.equal(Math.round((short.width / short.height) * 10000) / 10000, 9 / 16);
    assert.equal(flyerPreviewNeedsScroll(short.height, 200), true);
    assert.equal(flyerPreviewNeedsScroll(size.height, 700), false);
    const preview = read('screens/AlertFlyerPreviewScreen.tsx');
    assert.match(preview, /flyerPreviewNeedsScroll/);
    assert.match(preview, /styles\.scrollOverflow/);
    assert.equal(nestedCrearRouteName({ state: { index: 1, routes: [{ name: 'TabRoot' }, { name: CREAR_FLYER_DRAFT_ROUTE }] } }), CREAR_FLYER_DRAFT_ROUTE);
    assert.equal(shouldHideCrearTabBar('Crear', CREAR_FLYER_DRAFT_ROUTE), true);
    assert.equal(shouldHideCrearTabBar('Crear', CREAR_FLYER_PREVIEW_ROUTE), true);
    assert.equal(shouldHideCrearTabBar('Crear', 'TabRoot'), false);
    assert.equal(shouldHideCrearTabBar('Alertas', CREAR_FLYER_DRAFT_ROUTE), false);
    const preview = read('screens/AlertFlyerPreviewScreen.tsx');
    assert.match(preview, /useSafeAreaInsets/);
    assert.match(preview, /paddingBottom: footerPad/);
    assert.match(preview, /styles\.footer/);
    assert.match(preview, /styles\.previewArea/);
    const create = read('screens/CreateAlertScreen.tsx');
    assert.doesNotMatch(create, /pushRootScreen/);
    assert.doesNotMatch(create, /navigateRoot/);
  });
});

describe('flyer canvas long content fits 9:16', () => {
  it('compacta foto y textos cuando hay muchos datos', () => {
    assert.equal(FLYER_PHOTO_HEIGHT_NORMAL, '44%');
    assert.equal(FLYER_PHOTO_HEIGHT_COMPACT, '40%');
    assert.equal(FLYER_PHOTO_WIDTH, '92%');
    const short = buildAlertFlyerData({
      type: 'lost',
      petName: 'Nina',
      species: 'perro',
      locality: 'Cerrillos',
      image: 'https://example.com/nina.jpg',
    });
    assert.equal(flyerContentDensity(short), 'normal');
    assert.equal(flyerDescriptionLines('normal'), 3);
    const long = buildAlertFlyerData({
      type: 'lost',
      petName: 'Nina María de los Ángeles González',
      species: 'perro',
      sex: 'hembra',
      breed: 'Labrador mestizo de pelo largo',
      color: 'Negro con manchas blancas en el pecho',
      age: '3 años',
      locality: 'Barrio El Progreso, Cerrillos',
      province: 'Salta',
      description:
        'Se perdió cerca de la plaza. Lleva collar rojo, es muy mansa y responde al nombre. Tiene una mancha blanca en el pecho y una cicatriz pequeña en la pata trasera izquierda. Por favor contactar si la ven.',
      image: 'https://example.com/nina.jpg',
      petUsername: 'nina.pet',
      contactPhone: '3875551234',
    });
    assert.equal(flyerContentDensity(long), 'compact');
    assert.equal(flyerDescriptionLines('compact'), 2);
    assert.equal(long.petPublicUrl, 'https://animaldex.com/nina.pet');
    const canvas = read('components/AlertFlyerCanvas.tsx');
    assert.match(canvas, /numberOfLines=\{1\}/);
    assert.match(canvas, /numberOfLines=\{descLines\}/);
    assert.match(canvas, /flexGrow: 0/);
    assert.match(canvas, /flexShrink: 0/);
    assert.doesNotMatch(canvas, /minHeight: 168/);
    assert.doesNotMatch(canvas, /photoStage: \{[^}]*flex: 1/);
    assert.doesNotMatch(canvas, /position: 'absolute'/);
  });
});

describe('flyer weight', () => {
  it('exporta JPEG 1080x1920 con calidad adaptativa y tope de peso', () => {
    assert.equal(FLYER_SHARE_FORMAT, 'jpeg');
    assert.equal(FLYER_SHARE_MIME, 'image/jpeg');
    assert.equal(FLYER_SHARE_UTI, 'public.jpeg');
    assert.equal(FLYER_EXPORT_WIDTH, 1080);
    assert.equal(FLYER_EXPORT_HEIGHT, 1920);
    assert.equal(FLYER_ASPECT, 9 / 16);
    assert.equal(FLYER_FALLBACK_WIDTH, 900);
    assert.equal(FLYER_FALLBACK_HEIGHT, 1600);
    assert.deepEqual(flyerFallbackShareSize(), { width: 900, height: 1600 });
    assert.deepEqual([...FLYER_JPEG_QUALITIES], [0.7, 0.62, 0.54, 0.46]);
    assert.equal(FLYER_MAX_COMPRESS_ATTEMPTS, 4);
    assert.equal(flyerJpegQualityForAttempt(0), 0.7);
    assert.equal(flyerJpegQualityForAttempt(1), 0.62);
    assert.equal(flyerJpegQualityForAttempt(3), 0.46);
    assert.equal(FLYER_IDEAL_MIN_BYTES, 250 * 1024);
    assert.equal(FLYER_IDEAL_MAX_BYTES, 600 * 1024);
    assert.equal(FLYER_ACCEPTABLE_BYTES, 600 * 1024);
    assert.equal(FLYER_HARD_MAX_BYTES, 800 * 1024);
    assert.equal(shouldRetryFlyerCompress(200 * 1024, 0), false);
    assert.equal(shouldRetryFlyerCompress(601 * 1024, 0), true);
    assert.equal(shouldFallbackFlyerResolution(600 * 1024), false);
    assert.equal(shouldFallbackFlyerResolution(801 * 1024), true);
    assert.deepEqual(flyerShareSize(2160, 3840), { width: 1080, height: 1920 });
    assert.deepEqual(flyerShareSize(1080, 1920, 900, 1600), { width: 900, height: 1600 });
    const first = pickSmallerFlyer(null, { uri: 'a', bytes: 700_000, quality: 0.7 });
    const second = pickSmallerFlyer(first, { uri: 'b', bytes: 420_000, quality: 0.62 });
    assert.equal(second.uri, 'b');
    const share = read('lib/alertFlyerShare.ts');
    assert.match(share, /FLYER_FALLBACK_WIDTH/);
    assert.match(share, /shouldFallbackFlyerResolution/);
    assert.doesNotMatch(share, /SaveFormat\.PNG/);
  });
});
