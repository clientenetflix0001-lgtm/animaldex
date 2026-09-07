import React, { memo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors, spacing } from '../lib/theme';

function HomeModuleTitleInner({ children }: { children: string }) {
  return <Text style={styles.title}>{children}</Text>;
}

export const HomeModuleTitle = memo(HomeModuleTitleInner);

const styles = StyleSheet.create({
  title: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
});
