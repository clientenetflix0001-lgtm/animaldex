import React, { useEffect, useMemo, useState } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import { colorsForScheme, resolveAppScheme, shadowForScheme } from './appTheme.ts';
import { ThemeContext, type ThemeContextValue } from './themeContext.ts';

export { useAppTheme } from './themeContext.ts';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [scheme, setScheme] = useState(() => resolveAppScheme(Appearance.getColorScheme()));

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }: { colorScheme: ColorSchemeName }) => {
      setScheme(resolveAppScheme(colorScheme));
    });
    return () => sub.remove();
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
