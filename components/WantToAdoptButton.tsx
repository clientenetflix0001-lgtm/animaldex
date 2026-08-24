import React, { useEffect, memo } from 'react';
import { Pressable, Text, StyleSheet, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ADOPTION_PURPLE } from '../lib/adoptionDiscovery';

type Size = 'compact' | 'block';

interface Props {
  onPress: () => void;
  label?: string;
  size?: Size;
  style?: ViewStyle;
}

function WantToAdoptButton({ onPress, label = 'Quiero adoptar', size = 'compact', style }: Props) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
  }, [scale]);

  const pulse = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[pulse, size === 'block' && styles.blockWrap, style]}>
      <Pressable
        onPress={onPress}
        style={[styles.base, size === 'compact' ? styles.compact : styles.block]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Ionicons name="heart-outline" size={size === 'compact' ? 13 : 15} color="#FFFFFF" />
        <Text style={[styles.text, size === 'block' && styles.textBlock]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export default memo(WantToAdoptButton);

const styles = StyleSheet.create({
  blockWrap: { alignSelf: 'stretch' },
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ADOPTION_PURPLE,
    borderRadius: 999,
    gap: 5,
  },
  compact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  block: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignSelf: 'stretch',
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  textBlock: { fontSize: 13 },
});
