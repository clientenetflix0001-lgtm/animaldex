import React from 'react';
import { Platform } from 'react-native';
import VectorIcon from '@expo/vector-icons/Ionicons';
import { paletteIsDark, resolveUiIconColor } from '../lib/webIconColor';
import { colors } from '../lib/theme';

type Props = React.ComponentProps<typeof VectorIcon>;

/** Ionicons de interfaz. En web unifica negro/blanco salvo media y semántica. */
export default function AppIcon(props: Props) {
  const scheme = paletteIsDark(colors.bg) ? 'dark' : 'light';
  return <VectorIcon {...props} color={resolveUiIconColor(props.color, scheme, Platform.OS)} />;
}
