import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ANDROID_POST_NOTIFICATIONS_SDK,
  FIRST_PERMISSIONS_ONBOARDING_KEY,
  androidNeedsPostNotificationsRuntime,
  nextFirstPermissionsStep,
  shouldRequestOsLocationPermission,
  shouldRequestOsNotificationPermission,
} from '../lib/firstPermissionsOnboarding.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const feed = read('screens/FeedScreen.tsx');
const onboarding = read('components/FirstPermissionsOnboarding.tsx');
const locationPerm = read('lib/locationPermission.ts');
const push = read('lib/push.ts');
const appJson = read('app.json');
const store = read('lib/firstPermissionsOnboardingStore.ts');

describe('onboarding de ubicación y notificaciones', () => {
  it('aparece una sola vez: se persiste en AsyncStorage local', () => {
    assert.equal(FIRST_PERMISSIONS_ONBOARDING_KEY, 'animaldex-first-permissions-onboarding-done');
    assert.match(store, /FIRST_PERMISSIONS_ONBOARDING_KEY/);
    assert.match(store, /AsyncStorage\.setItem\(FIRST_PERMISSIONS_ONBOARDING_KEY, '1'\)/);
    assert.match(onboarding, /wasFirstPermissionsOnboardingDone/);
    assert.match(onboarding, /markFirstPermissionsOnboardingDone/);
    assert.equal(nextFirstPermissionsStep({
      onboardingDone: true,
      locationGranted: false,
      notificationsGranted: false,
      platform: 'android',
    }), 'done');
  });

  it('ubicación ya concedida → no vuelve a pedirla y pasa al siguiente paso', () => {
    assert.equal(shouldRequestOsLocationPermission(true), false);
    assert.equal(shouldRequestOsLocationPermission(false), true);
    assert.equal(nextFirstPermissionsStep({
      onboardingDone: false,
      locationGranted: true,
      notificationsGranted: false,
      platform: 'android',
    }), 'notifications');
    assert.match(locationPerm, /getForegroundPermissionsAsync/);
    assert.match(locationPerm, /if \(current\.status === 'granted'\) return true/);
    assert.doesNotMatch(locationPerm, /locateCurrentPlace|reverseGeocodeAsync|fromGeocode/);
  });

  it('notificaciones ya concedidas → no vuelve a pedirlas y cierra el flujo', () => {
    assert.equal(
      shouldRequestOsNotificationPermission({ platform: 'android', androidSdk: 33, alreadyGranted: true }),
      false
    );
    assert.equal(nextFirstPermissionsStep({
      onboardingDone: false,
      locationGranted: true,
      notificationsGranted: true,
      platform: 'android',
    }), 'done');
  });

  it('Android 13+ puede solicitar POST_NOTIFICATIONS', () => {
    assert.equal(ANDROID_POST_NOTIFICATIONS_SDK, 33);
    assert.equal(androidNeedsPostNotificationsRuntime(33), true);
    assert.equal(androidNeedsPostNotificationsRuntime(34), true);
    assert.equal(
      shouldRequestOsNotificationPermission({ platform: 'android', androidSdk: 33, alreadyGranted: false }),
      true
    );
    assert.match(push, /shouldRequestOsNotificationPermission/);
    assert.match(push, /requestPermissionsAsync/);
    assert.match(onboarding, /Activar notificaciones/);
  });

  it('Android 11/12 no intenta pedir un permiso runtime inexistente', () => {
    assert.equal(androidNeedsPostNotificationsRuntime(30), false);
    assert.equal(androidNeedsPostNotificationsRuntime(31), false);
    assert.equal(androidNeedsPostNotificationsRuntime(32), false);
    assert.equal(
      shouldRequestOsNotificationPermission({ platform: 'android', androidSdk: 30, alreadyGranted: false }),
      false
    );
    assert.equal(
      shouldRequestOsNotificationPermission({ platform: 'android', androidSdk: 32, alreadyGranted: false }),
      false
    );
    assert.match(push, /Android 12 e inferior no tienen popup runtime de POST_NOTIFICATIONS/);
  });

  it('"Ahora no" no rompe el ingreso al Feed', () => {
    assert.match(onboarding, /Ahora no/);
    assert.match(feed, /<FirstPermissionsOnboarding/);
    assert.match(feed, /bindLastLocationForegroundSync/);
    assert.match(onboarding, /advanceAfterLocation/);
    // El feed sigue montado debajo del modal.
    assert.match(feed, /composeHomeFeedPage/);
  });

  it('el Feed sigue cargando normalmente', () => {
    assert.match(feed, /fetchHomeFeedBuckets/);
    assert.match(feed, /readCachedHomeFeed/);
    assert.match(feed, /<FirstPermissionsOnboarding \/>/);
    assert.doesNotMatch(feed, /locateCurrentPlace/);
  });

  it('GEO actual sigue intacto', () => {
    const locate = read('lib/placeLocate.ts');
    assert.match(locate, /reverseGeocodeAsync/);
    assert.match(locate, /resolutionFromGeocode/);
    assert.doesNotMatch(onboarding, /locateCurrentPlace|fromGeocode|reverseGeocodeAsync/);
    assert.doesNotMatch(read('lib/firstPermissionsOnboarding.ts'), /locateCurrentPlace/);
    assert.match(read('screens/AlertsScreen.tsx'), /refreshAutoLocation/);
    assert.match(read('lib/alertsLocality.ts'), /AlertsLocalitySource/);
  });
});

describe('splash nativo Motorola / Android 11', () => {
  it('app.json declara splash Animaldex y no deja el default de Expo', () => {
    const cfg = JSON.parse(appJson);
    assert.equal(cfg.expo.splash.image, './assets/images/animaldex-logo-mark.png');
    assert.equal(cfg.expo.splash.backgroundColor, '#FD6904');
    assert.equal(cfg.expo.splash.resizeMode, 'contain');
    assert.equal(cfg.expo.android.splash.image, './assets/images/animaldex-logo-mark.png');
    assert.equal(cfg.expo.android.splash.backgroundColor, '#FD6904');
    assert.ok(existsSync(join(root, 'assets/images/animaldex-logo-mark.png')));
    assert.ok(existsSync(join(root, 'assets/splash-icon.png')));
    const plugin = cfg.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen');
    assert.ok(plugin);
    assert.equal(plugin[1].image, './assets/images/animaldex-logo-mark.png');
    assert.equal(plugin[1].backgroundColor, '#FD6904');
    assert.doesNotMatch(appJson, /splash-icon-dark|expo-template|target/);
  });

  it('no modifica el adaptive icon ya corregido', () => {
    const cfg = JSON.parse(appJson);
    assert.equal(cfg.expo.android.adaptiveIcon.backgroundColor, '#FD6904');
    assert.equal(cfg.expo.android.adaptiveIcon.foregroundImage, './assets/android-icon-foreground.png');
    assert.equal(cfg.expo.android.adaptiveIcon.monochromeImage, './assets/android-icon-monochrome.png');
  });
});
