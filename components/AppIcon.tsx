import React from 'react';
import { Platform } from 'react-native';
import VectorIcon from '@expo/vector-icons/Ionicons';
import { resolveUiIconColor } from '../lib/webIconColor';
import { useAppTheme } from '../lib/theme';

type Props = React.ComponentProps<typeof VectorIcon>;

/**
 * Ionicons de interfaz. El scheme lo entrega ThemeProvider (Appearance /
 * prefers-color-scheme). No se infiere de colors.bg estático.
 * Web: #000 en claro, #FFF en oscuro. Native: no remapea.
 */
export default function AppIcon(props: Props) {
  const { scheme } = useAppTheme();
  return <VectorIcon {...props} color={resolveUiIconColor(props.color, scheme, Platform.OS)} />;
}
