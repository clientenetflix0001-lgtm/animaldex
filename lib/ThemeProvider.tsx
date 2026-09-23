import React, { useEffect, useMemo, useState } from 'react';
import { Appearance, AppState, type AppStateStatus, type ColorSchemeName } from 'react-native';
import { colorsForScheme, shadowForScheme } from './appTheme.ts';
import { ThemeContext, type ThemeContextValue } from './themeContext.ts';
import { schemeFromSystemAppearance } from './themeRuntime.ts';

export { useAppTheme } from './themeContext.ts';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [scheme, setScheme] = useState(() => schemeFromSystemAppearance(Appearance.getColorScheme()));

  useEffect(() => {
    const apply = (colorScheme?: ColorSchemeName) => {
      setScheme(schemeFromSystemAppearance(colorScheme ?? Appearance.getColorScheme()));
    };
    apply();
    const appearance = Appearance.addChangeListener(({ colorScheme }: { colorScheme: ColorSchemeName }) => {
      apply(colorScheme);
    });
    const app = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') apply();
    });
    return () => {
      appearance.remove();
      app.remove();
    };
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      scheme,
      colors: colorsForScheme(scheme),
      shadow: shadowForScheme(scheme),
    }),
    [scheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
