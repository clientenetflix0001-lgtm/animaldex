import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { db } from './db';
import { EXPO_PROJECT_ID, PUSH_CHANNEL_PETS, PUSH_CHANNEL_REMINDERS, isExpoPushToken, parsePushNav } from './pushPolicy';
import { navigationRef } from './navigationRef';

const PROMPT_DISMISSED_KEY = 'animaldex-push-prompt-dismissed';
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
  if (current.granted) return 'granted';
  if (!current.canAskAgain) return 'denied';
  return current.status === 'undetermined' ? 'undetermined' : 'denied';
}

export async function wasPushPromptDismissed(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PROMPT_DISMISSED_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function dismissPushPrompt(): Promise<void> {
  await AsyncStorage.setItem(PROMPT_DISMISSED_KEY, '1').catch(() => {});
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

export function openFromPushData(data: { type?: string; petId?: string; petUsername?: string; url?: string } | null | undefined) {
  if (!navigationRef.isReady()) return;
  const nav = parsePushNav(data);
  if (nav.kind === 'pet' && nav.petId) {
    navigationRef.navigate('PetProfile', { petId: nav.petId });
    return;
  }
  if (nav.kind === 'activity') {
    navigationRef.navigate('Tabs', { screen: 'Actividad' } as never);
  }
}

export async function attachPushResponseListeners(): Promise<() => void> {
  if (Platform.OS === 'web') return () => {};
  const native = await loadNative();
  if (!native) return () => {};
  await ensurePushHandler();
  const sub = native.Notifications.addNotificationResponseReceivedListener((response) => {
    openFromPushData(response.notification.request.content.data as never);
  });
  const last = await native.Notifications.getLastNotificationResponseAsync();
  if (last) openFromPushData(last.notification.request.content.data as never);
  return () => sub.remove();
}
