// ============================================================
// Primer ingreso: ubicación y luego notificaciones.
// Puro, sin React Native. La persistencia vive en AsyncStorage.
// ============================================================

export const FIRST_PERMISSIONS_ONBOARDING_KEY = 'animaldex-first-permissions-onboarding-done';

/** Android 13 (API 33) introduce el runtime POST_NOTIFICATIONS. */
export const ANDROID_POST_NOTIFICATIONS_SDK = 33;

export type FirstPermissionsStep = 'location' | 'notifications' | 'done';

export function androidNeedsPostNotificationsRuntime(sdk: number): boolean {
  return Number.isFinite(sdk) && sdk >= ANDROID_POST_NOTIFICATIONS_SDK;
}

export function shouldRequestOsNotificationPermission(input: {
  platform: string;
  androidSdk: number;
  alreadyGranted: boolean;
}): boolean {
  if (input.alreadyGranted) return false;
  if (input.platform === 'web') return false;
  if (input.platform === 'android') {
    return androidNeedsPostNotificationsRuntime(input.androidSdk);
  }
  return true;
}

export function shouldRequestOsLocationPermission(alreadyGranted: boolean): boolean {
  return !alreadyGranted;
}

export function nextFirstPermissionsStep(input: {
  onboardingDone: boolean;
  locationGranted: boolean;
  notificationsGranted: boolean;
  platform: string;
}): FirstPermissionsStep {
  if (input.onboardingDone) return 'done';
  if (input.platform === 'web') return 'done';
  if (!input.locationGranted) return 'location';
  if (input.notificationsGranted) return 'done';
  return 'notifications';
}
