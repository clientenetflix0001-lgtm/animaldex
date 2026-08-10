import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../lib/theme';

export function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', flex: 1 },
  value: { fontWeight: '800', fontSize: 17, color: colors.text },
  label: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
