import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { db } from './db';
import { EXPO_PROJECT_ID, PUSH_CHANNEL_PETS, PUSH_CHANNEL_PETS_URGENT, PUSH_CHANNEL_REMINDERS, isExpoPushToken, pushNavDestination, pushTapFlushDecision } from './pushPolicy';
import { interpretNotificationPermission, PUSH_PROMPT_DISMISSED_KEY } from './pushPrompt';
import { navigationRef } from './navigationRef';

const UNREGISTER_TIMEOUT_MS = 2500;

type NotificationsModule = typeof import('expo-notifications');
type DeviceModule = typeof import('expo-device');

let notificationsMod: NotificationsModule | null = null;
let deviceMod: DeviceModule | null = null;
let handlerReady = false;

async function loadNative(): Promise<{ Notifications: NotificationsModule; Device: DeviceModule } | null> {
  if (Platform.OS === 'web') return null;
  if (!notificationsMod) notificationsMod = await import('expo-notifications');
  if (!deviceMod) deviceMod = await import('expo-device');
  return { Notifications: notificationsMod, Device: deviceMod };
}

function projectId(): string {
  return Constants.expoConfig?.extra?.eas?.projectId || EXPO_PROJECT_ID;
}

export async function ensurePushHandler(): Promise<void> {
  if (handlerReady || Platform.OS === 'web') return;
  const native = await loadNative();
  if (!native) return;
  native.Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  handlerReady = true;
}

export async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const native = await loadNative();
  if (!native) return;
  await native.Notifications.setNotificationChannelAsync(PUSH_CHANNEL_PETS, {
    name: 'Mascotas',
    importance: native.Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 180],
    lightColor: '#FF6B4A',
  });
  await native.Notifications.setNotificationChannelAsync(PUSH_CHANNEL_PETS_URGENT, {
    name: 'Alertas importantes de mascotas',
    description: 'Ubicaciones y avisos urgentes de tus mascotas.',
    importance: native.Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 120, 250],
    lightColor: '#FF6B4A',
    sound: 'default',
    enableVibrate: true,
    showBadge: true,
    lockscreenVisibility: 1,
  });
  await native.Notifications.setNotificationChannelAsync(PUSH_CHANNEL_REMINDERS, {
    name: 'Recordatorios',
    importance: native.Notifications.AndroidImportance.DEFAULT,
  });
}

export async function getPushPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined' | 'unavailable'> {
  if (Platform.OS === 'web') return 'unavailable';
  const native = await loadNative();
  if (!native) return 'unavailable';
  const current = await native.Notifications.getPermissionsAsync();
  return interpretNotificationPermission({
    granted: current.granted,
    canAskAgain: current.canAskAgain,
    status: current.status,
  });
}

export async function wasPushPromptDismissed(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PUSH_PROMPT_DISMISSED_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function dismissPushPrompt(): Promise<void> {
  await AsyncStorage.setItem(PUSH_PROMPT_DISMISSED_KEY, '1').catch(() => {});
}

/** Para pruebas: borrar el "Ahora no" local. No toca el permiso de Android. */
export async function clearPushPromptDismissed(): Promise<void> {
  await AsyncStorage.removeItem(PUSH_PROMPT_DISMISSED_KEY).catch(() => {});
}

export async function requestPushPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const native = await loadNative();
  if (!native || !native.Device.isDevice) return false;
  await ensurePushHandler();
  await ensureAndroidChannels();
  const current = await native.Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const next = await native.Notifications.requestPermissionsAsync();
  return !!next.granted;
}

export async function registerPushTokenIfGranted(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const native = await loadNative();
  if (!native || !native.Device.isDevice) return null;
  await ensurePushHandler();
  await ensureAndroidChannels();
  const perm = await native.Notifications.getPermissionsAsync();
  if (!perm.granted) return null;
  const tokenRes = await native.Notifications.getExpoPushTokenAsync({ projectId: projectId() });
  const token = tokenRes.data;
  if (!isExpoPushToken(token)) return null;
  await db.registerPushToken(token, Platform.OS, native.Device.modelId || native.Device.modelName || null);
  return token;
}

export async function unregisterCurrentPushToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  const native = await loadNative();
  if (!native || !native.Device.isDevice) return;
  try {
    const perm = await native.Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    const tokenRes = await native.Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    if (isExpoPushToken(tokenRes.data)) {
      await db.unregisterPushToken(tokenRes.data);
    }
  } catch {
    // El logout no debe bloquearse si Expo/red fallan.
  }
}

export async function unregisterThen<T>(next: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      unregisterCurrentPushToken(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, UNREGISTER_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // continuar al logout
  } finally {
    if (timer) clearTimeout(timer);
  }
  return next();
}

type PushNavGate = {
  navReady: boolean;
  authReady: boolean;
  hasUser: boolean;
};

let pendingPushData: unknown = null;
let pushNavGate: PushNavGate = { navReady: false, authReady: false, hasUser: false };
let pushFlushTimer: ReturnType<typeof setTimeout> | null = null;

export function setPushNavGate(partial: Partial<PushNavGate>): void {
  pushNavGate = { ...pushNavGate, ...partial };
  flushPendingPushNav();
}

function navigatePushDestination(dest: NonNullable<ReturnType<typeof pushNavDestination>>): boolean {
  if (!navigationRef.isReady()) return false;
  if (dest.name === 'PetProfile') {
    navigationRef.navigate('PetProfile', dest.params);
    return true;
  }
  if (dest.name === 'ReelViewer') {
    navigationRef.navigate('ReelViewer', dest.params);
    return true;
  }
  navigationRef.navigate('Tabs', dest.params as never);
  return true;
}

export function flushPendingPushNav(): 'idle' | 'wait' | 'apply' | 'none' {
  const decision = pushTapFlushDecision({
    hasPending: pendingPushData != null,
    navReady: pushNavGate.navReady,
    authReady: pushNavGate.authReady,
    hasUser: pushNavGate.hasUser,
    navIsReady: navigationRef.isReady(),
  });
  if (decision !== 'apply') return decision;
  const dest = pushNavDestination(pendingPushData);
  if (!dest) {
    pendingPushData = null;
    return 'none';
  }
  try {
    if (!navigatePushDestination(dest)) return 'wait';
    pendingPushData = null;
    return 'apply';
  } catch {
    return 'wait';
  }
}

export function openFromPushData(data: unknown) {
  if (data == null) return;
  const dest = pushNavDestination(data);
  if (!dest) return;
  pendingPushData = data;
  const result = flushPendingPushNav();
  if (result === 'wait') {
    if (pushFlushTimer) clearTimeout(pushFlushTimer);
    let attempts = 0;
    const retry = () => {
      attempts += 1;
      const next = flushPendingPushNav();
      if (next === 'wait' && attempts < 40) {
        pushFlushTimer = setTimeout(retry, 100);
      }
    };
    pushFlushTimer = setTimeout(retry, 100);
  }
}

export async function attachPushResponseListeners(): Promise<() => void> {
  if (Platform.OS === 'web') return () => {};
  const native = await loadNative();
  if (!native) return () => {};
  await ensurePushHandler();
  const sub = native.Notifications.addNotificationResponseReceivedListener((response) => {
    openFromPushData(response.notification.request.content.data);
  });
  const last = await native.Notifications.getLastNotificationResponseAsync();
  if (last) openFromPushData(last.notification.request.content.data);
  return () => {
    sub.remove();
    if (pushFlushTimer) {
      clearTimeout(pushFlushTimer);
      pushFlushTimer = null;
    }
  };
}
