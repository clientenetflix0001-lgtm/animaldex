/**
 * Condiciones puras del banner de permiso Push (sin React Native).
 *
 * En Android 13+ (API 33), expo-notifications reporta el permiso nunca
 * pedido como status=denied (no undetermined), con canAskAgain=true.
 */

export const PUSH_PROMPT_DISMISSED_KEY = 'animaldex-push-prompt-dismissed';

export type PushPermissionKind = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export function interpretNotificationPermission(input: {
  granted?: boolean;
  canAskAgain?: boolean;
  status?: string | null;
} | null | undefined): PushPermissionKind {
  if (!input) return 'unavailable';
  if (input.granted || input.status === 'granted') return 'granted';
  if (input.status === 'unavailable') return 'unavailable';
  if (input.status === 'undetermined') return 'undetermined';
  // Nunca pedido o rechazable de nuevo: tratarlo como "todavía se puede pedir".
  if (input.canAskAgain !== false) return 'undetermined';
  return 'denied';
}

export function shouldShowPushPrompt(input: {
  hasPets: boolean;
  dismissed: boolean;
  permission: PushPermissionKind;
}): boolean {
  if (!input.hasPets || input.dismissed) return false;
  if (input.permission === 'granted' || input.permission === 'unavailable') return false;
  return true;
}
