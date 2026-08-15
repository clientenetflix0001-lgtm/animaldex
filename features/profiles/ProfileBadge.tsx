import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import type { ProfileType } from './profileTypes';
import { PROFILE_TYPE_BADGE } from './profileTypes';
import { colors, radius } from '../../lib/theme';

export default function ProfileBadge({ type }: { type?: ProfileType | null }) {
  if (!type || type === 'personal') return null;
  const label = PROFILE_TYPE_BADGE[type];
  if (!label) return null;
  return (
    <View style={[styles.badge, type === 'protector' ? styles.protector : styles.business]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    marginTop: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  business: { backgroundColor: '#FFF1D6' },
  protector: { backgroundColor: '#FFE4EA' },
  text: { fontSize: 10, fontWeight: '800', color: colors.text },
});
