import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors } from '../lib/theme';

export function StatBlock({ value, label }: { value: string; label: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.wrap}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  wrap: { alignItems: 'center', flex: 1 },
  value: { fontWeight: '800', fontSize: 17, color: colors.text },
  label: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
}
