import React from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { colors, spacing } from '../lib/theme';

export function LoadingFooter() {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.text}>Buscando más peluditos...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.sm },
  text: { color: colors.textMuted, fontSize: 13 },
});
