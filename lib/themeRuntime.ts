import { resolveAppScheme, type AppColorScheme } from './appTheme.ts';

/** System only. No persistencia propia. */
export function schemeFromSystemAppearance(system: string | null | undefined): AppColorScheme {
  return resolveAppScheme(system);
}

export function relaunchSchemePair(
  firstSystem: string | null | undefined,
  secondSystem: string | null | undefined
): {
  first: AppColorScheme;
  second: AppColorScheme;
  flippedWithoutSystemChange: boolean;
} {
  const first = schemeFromSystemAppearance(firstSystem);
  const second = schemeFromSystemAppearance(secondSystem);
  return {
    first,
    second,
    flippedWithoutSystemChange: firstSystem === secondSystem && first !== second,
  };
}

/** El AAB de Play Internal (e7fb77c) embebe userInterfaceStyle=light. */
export function embeddedAabLocksLight(userInterfaceStyle: string | null | undefined): boolean {
  return userInterfaceStyle === 'light';
}
