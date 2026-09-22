import { lightColors, lightShadow } from './appTheme.ts';

export type { AppColorScheme, ThemeColors, ThemePreference } from './appTheme.ts';
export {
  CONTACT_THEME,
  FLYER_IGNORES_COLOR_SCHEME,
  NATIVE_AAB_REASONS,
  NOTIFICATION_ACCENT,
  NOTIFICATION_ICON_PATH,
  OTA_SAFE_CHANGES,
  PHOTO_FILTER_IN_DARK_MODE,
  POST_BACKGROUND_IGNORES_COLOR_SCHEME,
  THEME_PREFERENCE,
  colorsForScheme,
  darkColors,
  lightColors,
  navigationThemeColors,
  resolveAppScheme,
  shadowForScheme,
  statusBarStyleForScheme,
} from './appTheme.ts';
export { useAppTheme } from './themeContext.ts';

/**
 * Tokens claros actuales. Los tests y módulos sin hook siguen viendo
 * el diseño light. Las pantallas temáticas deben usar useAppTheme().
 */
export const colors = lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

/** Franja crema entre publicaciones del Feed (~2 mm físicos ≈ 7 dp). */
export const FEED_POST_GAP = 7;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  full: 999,
};

export const shadow = lightShadow;
