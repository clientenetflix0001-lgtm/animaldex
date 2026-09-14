import AsyncStorage from '@react-native-async-storage/async-storage';
import { FIRST_PERMISSIONS_ONBOARDING_KEY } from './firstPermissionsOnboarding';

export async function wasFirstPermissionsOnboardingDone(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(FIRST_PERMISSIONS_ONBOARDING_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markFirstPermissionsOnboardingDone(): Promise<void> {
  await AsyncStorage.setItem(FIRST_PERMISSIONS_ONBOARDING_KEY, '1').catch(() => {});
}
