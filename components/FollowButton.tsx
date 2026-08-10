import React from 'react';
import { Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius } from '../lib/theme';

interface Props {
  following: boolean;
  onPress: () => void;
  style?: ViewStyle;
  compact?: boolean;
}

export function FollowButton({ following, onPress, style, compact }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        compact && styles.compact,
        following ? styles.btnFollowing : styles.btnFollow,
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      <Text style={[styles.text, following ? styles.textFollowing : styles.textFollow]}>
        {following ? 'Siguiendo' : 'Seguir'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: { paddingHorizontal: 14, paddingVertical: 6 },
  btnFollow: { backgroundColor: colors.primary },
  btnFollowing: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  text: { fontWeight: '700', fontSize: 13 },
  textFollow: { color: '#fff' },
  textFollowing: { color: colors.text },
});
