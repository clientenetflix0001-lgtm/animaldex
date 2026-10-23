import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { commitFeedPageFromOffset, pageFromPagerOffset, shouldHighlightTab } from '../lib/feedReelsNav.ts';
import { interpretPlayRejection, webHlsEngine, webReelVideoProps, WEB_REEL_FIRST_FRAME_TIMEOUT_MS } from '../lib/reelWebPlayback.ts';
import { chooseLocateResolution, geocodeHasText } from '../lib/placeLocateResolution.ts';
import { unambiguousPlace } from '../lib/placeResolution.ts';
import {
  isOnMediaIconColor,
  isSemanticIconColor,
  paletteIsDark,
  resolveUiIconColor,
  UI_ICON_DARK,
  UI_ICON_LIGHT,
} from '../lib/webIconColor.ts';
import { colors } from '../lib/theme.ts';
import { GEO_MAX_PLAUSIBLE_KM } from '../lib/geoplace/resolve.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Reels web: HLS real y spinner con error', () => {
  it('elige motor nativo o hls.js; sin ambos no hay reproducción', () => {
    assert.equal(webHlsEngine(() => 'maybe', false), 'native');
    assert.equal(webHlsEngine(() => '', true), 'hls.js');
    assert.equal(webHlsEngine(() => '', false), 'none');
  });

  it('autoplay bloqueado se reintenta silenciado; otro error falla', () => {
    assert.equal(interpretPlayRejection({ name: 'NotAllowedError' }), 'retry-muted');
    assert.equal(interpretPlayRejection(new Error('play() failed because the user didn\'t interact')), 'retry-muted');
    assert.equal(interpretPlayRejection({ name: 'AbortError' }), 'ignore');
    assert.equal(interpretPlayRejection(new Error('Decode error')), 'fail');
  });

  it('el <video> web va inline, sin controles nativos y con CORS', () => {
    const props = webReelVideoProps({ muted: true });
    assert.equal(props.playsInline, true);
    assert.equal(props.controls, false);
    assert.equal(props.crossOrigin, 'anonymous');
    assert.equal(props.muted, true);
  });

  it('ReelCard usa WebHlsVideo en web y no deja el spinner eterno', () => {
    const card = read('components/ReelCard.tsx');
    const web = read('components/WebHlsVideo.web.tsx');
    const pkg = JSON.parse(read('package.json'));
    assert.ok(pkg.dependencies['hls.js']);
    assert.match(card, /WebHlsVideo/);
    assert.match(card, /WEB_REEL_FIRST_FRAME_TIMEOUT_MS/);
    assert.equal(WEB_REEL_FIRST_FRAME_TIMEOUT_MS, 12000);
    assert.match(card, /setFailed\(true\)/);
    assert.match(card, /No se pudo reproducir/);
    assert.match(web, /from 'hls\.js'/);
    assert.match(web, /playsInline/);
    assert.match(web, /interpretPlayRejection/);
  });
});

describe('Pager Home↔Reels: una sola fuente de página', () => {
  it('el offset decide Inicio/Reels igual que el tap', () => {
    assert.equal(pageFromPagerOffset(0, 390), 0);
    assert.equal(pageFromPagerOffset(200, 390), 1);
    assert.equal(pageFromPagerOffset(390, 390), 1);
    assert.equal(commitFeedPageFromOffset(200, 390, 0), 1);
    assert.equal(commitFeedPageFromOffset(200, 390, 1), null);
    assert.equal(shouldHighlightTab('Reels', 'Inicio', 1), true);
    assert.equal(shouldHighlightTab('Inicio', 'Inicio', 1), false);
  });

  it('el swiper web commitea página sin depender solo de momentum', () => {
    const swiper = read('screens/FeedReelsSwiper.tsx');
    assert.match(swiper, /commitFeedPageFromOffset/);
    assert.match(swiper, /onScrollEndDrag/);
    assert.match(swiper, /Platform\.OS === 'web'/);
    assert.match(swiper, /fromUserScroll/);
    assert.match(swiper, /onMomentumScrollEnd/);
  });
});

describe('Geolocalización web: catálogo local, no Georef remoto', () => {
  it('Android vacío no inventa lugar; web usa catálogo con confirmación', () => {
    const androidEmpty = chooseLocateResolution({
      platform: 'android',
      geocode: null,
      latitude: -24.7821,
      longitude: -65.4123,
    });
    assert.equal(androidEmpty.candidates.length, 0);
    assert.equal(androidEmpty.reason, 'no-candidates');
    assert.equal(unambiguousPlace(androidEmpty), null);

    const web = chooseLocateResolution({
      platform: 'web',
      geocode: { city: null, subregion: null, region: null },
      latitude: -24.88661,
      longitude: -65.46457,
    });
    assert.ok(web.candidates.length > 0);
    assert.equal(web.requiresConfirmation, true);
    assert.equal(unambiguousPlace(web), null);
    assert.ok((web.candidates[0]?.distanceKm ?? 0) < GEO_MAX_PLAUSIBLE_KM);
  });

  it('con texto de reverse geocode web y Android usan el mismo catálogo', () => {
    const hint = { city: 'Cerrillos', subregion: null, region: 'Salta' };
    assert.equal(geocodeHasText(hint), true);
    const android = chooseLocateResolution({ platform: 'android', geocode: hint, latitude: 0, longitude: 0 });
    const web = chooseLocateResolution({ platform: 'web', geocode: hint, latitude: 0, longitude: 0 });
    assert.equal(unambiguousPlace(android)?.placeId, 'AR:georef:66035010');
    assert.equal(unambiguousPlace(web)?.placeId, 'AR:georef:66035010');
  });

  it('fuera de Argentina no se afirma un municipio lejano', () => {
    const web = chooseLocateResolution({
      platform: 'web',
      geocode: null,
      latitude: 40.4168,
      longitude: -3.7038,
    });
    assert.equal(web.candidates.length, 0);
    assert.equal(web.reason, 'no-candidates');
  });

  it('el botón GPS muestra error claro y no llama a /geo', () => {
    const picker = read('components/PlacePicker.tsx');
    const locate = read('lib/placeLocate.ts');
    assert.match(picker, /reason: 'no-place'/);
    assert.match(picker, /No pudimos ubicar esa zona/);
    assert.match(picker, /Usar mi ubicación actual/);
    assert.match(locate, /getForegroundPermissionsAsync/);
    assert.doesNotMatch(locate, /geoResolveCoords/);
    assert.doesNotMatch(read('lib/placeLocateResolution.ts'), /geoResolveCoords/);
  });
});

describe('Iconos web: negro en claro, blanco en oscuro', () => {
  it('unifica chrome y conserva media y semántica', () => {
    assert.equal(UI_ICON_LIGHT, '#000000');
    assert.equal(UI_ICON_DARK, '#FFFFFF');
    assert.equal(resolveUiIconColor(colors.text, 'light', 'web'), '#000000');
    assert.equal(resolveUiIconColor(colors.primary, 'light', 'web'), '#000000');
    assert.equal(resolveUiIconColor(colors.textMuted, 'light', 'web'), '#000000');
    assert.equal(resolveUiIconColor(colors.text, 'dark', 'web'), '#FFFFFF');
    assert.equal(resolveUiIconColor(colors.heart, 'light', 'web'), colors.heart);
    assert.equal(resolveUiIconColor('#25D366', 'light', 'web'), '#25D366');
    assert.equal(resolveUiIconColor('#fff', 'light', 'web'), '#fff');
    assert.equal(resolveUiIconColor(colors.primary, 'light', 'android'), colors.primary);
    assert.equal(isOnMediaIconColor('#FFFFFF'), true);
    assert.equal(isSemanticIconColor('#E0483E'), true);
    assert.equal(paletteIsDark('#FFF9F2'), false);
    assert.equal(paletteIsDark('#121212'), true);
  });

  it('AppIcon envuelve Ionicons y las pantallas lo usan', () => {
    assert.match(read('components/AppIcon.tsx'), /resolveUiIconColor/);
    assert.match(read('App.tsx'), /from '\.\/components\/AppIcon'/);
    assert.match(read('App.tsx'), /from '@expo\/vector-icons\/Ionicons'/);
    assert.match(read('screens/FeedScreen.tsx'), /from '\.\.\/components\/AppIcon'/);
    assert.match(read('components/Sidebar.tsx'), /from '\.\/AppIcon'/);
  });
});
