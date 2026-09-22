import { WHATSAPP_GREEN, PHONE_ORANGE } from './petOwnerContact.ts';

export type AppColorScheme = 'light' | 'dark';
export type ThemePreference = 'system';

export const THEME_PREFERENCE: ThemePreference = 'system';

export const NOTIFICATION_ACCENT = '#FF6B4A';
export const NOTIFICATION_ICON_PATH = './assets/notification-icon.png';
export const NOTIFICATION_ICON_SIZE = 96;

/** Paleta clara actual de Animaldex. No cambiar estos valores. */
export const lightColors = {
  bg: '#FFF9F2',
  card: '#FFFFFF',
  primary: '#FF6B4A',
  primarysoft: '#FFE8E1',
  secondary: '#2EC4B6',
  secondarySoft: '#DDF6F3',
  text: '#2D2016',
  textMuted: '#9A8C7E',
  border: '#F0E6DA',
  heart: '#FF3B5C',
  gold: '#FFB800',
  background: '#FFF9F2',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  textSecondary: '#9A8C7E',
  separator: '#F0E6DA',
  inputBackground: '#FFFFFF',
  cardBackground: '#FFFFFF',
  icon: '#2D2016',
  accent: '#FF6B4A',
  dangerSoft: '#FFE8EC',
  warningSoft: '#FFF4E5',
} as const;

/** Oscuro cálido. Naranja, WhatsApp y teléfono se conservan. */
export const darkColors = {
  bg: '#16110E',
  card: '#221C18',
  primary: '#FF6B4A',
  primarysoft: '#3A241C',
  secondary: '#2EC4B6',
  secondarySoft: '#1A3330',
  text: '#F4EDE6',
  textMuted: '#B5A89C',
  border: '#3A322C',
  heart: '#FF3B5C',
  gold: '#FFB800',
  background: '#16110E',
  surface: '#221C18',
  surfaceElevated: '#2C241F',
  textSecondary: '#B5A89C',
  separator: '#3A322C',
  inputBackground: '#2C241F',
  cardBackground: '#221C18',
  icon: '#F4EDE6',
  accent: '#FF6B4A',
  dangerSoft: '#3A1E24',
  warningSoft: '#3A2E1C',
} as const;

export type ThemeColors = { [K in keyof typeof lightColors]: string };

export const lightShadow = {
  card: {
    shadowColor: '#3A2A1A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
};

export const darkShadow = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 3,
  },
};

export function resolveAppScheme(systemScheme: string | null | undefined): AppColorScheme {
  return systemScheme === 'dark' ? 'dark' : 'light';
}

export function colorsForScheme(scheme: AppColorScheme): ThemeColors {
  return scheme === 'dark' ? { ...darkColors } : { ...lightColors };
}

export function shadowForScheme(scheme: AppColorScheme) {
  return scheme === 'dark' ? darkShadow : lightShadow;
}

export function statusBarStyleForScheme(scheme: AppColorScheme): 'light' | 'dark' {
  return scheme === 'dark' ? 'light' : 'dark';
}

export function navigationThemeColors(scheme: AppColorScheme) {
  const c = colorsForScheme(scheme);
  return {
    primary: c.primary,
    background: c.bg,
    card: c.card,
    text: c.text,
    border: c.border,
    notification: c.primary,
  };
}

export function isLightTheme(scheme: AppColorScheme): boolean {
  return scheme === 'light';
}

export const FLYER_IGNORES_COLOR_SCHEME = true;
export const POST_BACKGROUND_IGNORES_COLOR_SCHEME = true;
export const PHOTO_FILTER_IN_DARK_MODE = false;

export const CONTACT_THEME = {
  whatsapp: WHATSAPP_GREEN,
  phone: PHONE_ORANGE,
} as const;

export const NATIVE_AAB_REASONS = [
  'expo-notifications small icon asset',
  'userInterfaceStyle automatic',
  'expo-system-ui Android appearance',
] as const;

export const OTA_SAFE_CHANGES = [
  'JS theme tokens and ThemeProvider',
  'screen chrome colors',
  'StatusBar style',
  'NavigationContainer theme colors',
] as const;
