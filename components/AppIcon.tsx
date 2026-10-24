import React from 'react';
import { Platform } from 'react-native';
import VectorIcon from '@expo/vector-icons/Ionicons';
import { resolveUiIconColor } from '../lib/webIconColor';
import { useAppTheme } from '../lib/theme';

type Props = React.ComponentProps<typeof VectorIcon>;

/** Ionicons de interfaz. En web unifica negro/blanco según el scheme activo. */
export default function AppIcon(props: Props) {
  const { scheme } = useAppTheme();
  return <VectorIcon {...props} color={resolveUiIconColor(props.color, scheme, Platform.OS)} />;
}
