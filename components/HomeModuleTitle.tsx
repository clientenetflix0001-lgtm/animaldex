import React, { memo, useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors, spacing } from '../lib/theme';

function HomeModuleTitleInner({ children }: { children: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <Text style={styles.title}>{children}</Text>;
}

export const HomeModuleTitle = memo(HomeModuleTitleInner);

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    title: {
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      fontSize: 15,
      fontWeight: '800',
      color: colors.text,
    },
  });
}
