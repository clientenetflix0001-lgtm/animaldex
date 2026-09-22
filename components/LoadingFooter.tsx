import React, { useMemo } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useAppTheme, type ThemeColors, spacing } from '../lib/theme';

export function LoadingFooter() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.wrap}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.text}>Buscando más peluditos...</Text>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  wrap: { paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.sm },
  text: { color: colors.textMuted, fontSize: 13 },
});
}
