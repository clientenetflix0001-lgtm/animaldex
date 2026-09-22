import { createContext, useContext } from 'react';
import {
  type AppColorScheme,
  type ThemeColors,
  colorsForScheme,
  shadowForScheme,
} from './appTheme.ts';

export type ThemeContextValue = {
  scheme: AppColorScheme;
  colors: ThemeColors;
  shadow: ReturnType<typeof shadowForScheme>;
};

export const ThemeContext = createContext<ThemeContextValue>({
  scheme: 'light',
  colors: colorsForScheme('light'),
  shadow: shadowForScheme('light'),
});

export function useAppTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
