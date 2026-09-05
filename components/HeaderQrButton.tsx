import React, { memo, useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../lib/theme';
import {
  HEADER_QR_A11Y,
  HEADER_QR_BUTTON_SIZE,
  HEADER_QR_FADE_MS,
  HEADER_QR_HALO_COLOR,
  HEADER_QR_HALO_SIZE,
  HEADER_QR_HALO_SOFT,
  HEADER_QR_HIT_SLOP,
  HEADER_QR_ICON_SIZE,
  HEADER_QR_LOGO_GAP,
  HEADER_QR_PULSE_MS,
  HEADER_QR_REST_MS,
  HEADER_QR_SPIN_MS,
} from '../lib/headerQr';

type Props = {
  onPress: () => void;
};

function HeaderQrButton({ onPress }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const cycle = useSharedValue(0);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (alive) setReduceMotion(!!enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(!!enabled);
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      cycle.value = 0;
      return;
    }
    cycle.value = 0;
    cycle.value = withRepeat(
      withSequence(
        withDelay(HEADER_QR_REST_MS, withTiming(1, { duration: HEADER_QR_FADE_MS, easing: Easing.out(Easing.quad) })),
        withTiming(2, { duration: HEADER_QR_SPIN_MS, easing: Easing.inOut(Easing.quad) }),
        withTiming(2.2, { duration: HEADER_QR_PULSE_MS, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: HEADER_QR_FADE_MS, easing: Easing.in(Easing.quad) })
      ),
      -1,
      false
    );
    return () => {
      cycle.value = 0;
    };
  }, [cycle, reduceMotion]);

  const haloStyle = useAnimatedStyle(() => {
    const p = cycle.value;
    const visible = p > 0.02;
    const fadeIn = p <= 1 ? p : 1;
    const fadeOut = p > 2.2 ? Math.max(0, 1 - (p - 2.2) / 0.2) : 1;
    const pulse = p > 2 && p <= 2.2 ? 1 + (p - 2) * 0.35 : 1;
    return {
      opacity: visible ? fadeIn * fadeOut * 0.95 : 0,
      transform: [{ scale: pulse }],
    };
  });

  const sweepStyle = useAnimatedStyle(() => {
    const p = cycle.value;
    const spin = p >= 1 && p <= 2 ? (p - 1) * 360 : p > 2 ? 360 : 0;
    return {
      transform: [{ rotate: `${spin}deg` }],
    };
  });

  return (
    <View style={styles.wrap}>
      <Animated.View pointerEvents="none" style={[styles.halo, haloStyle]}>
        <View pointerEvents="none" style={styles.glow} />
        <Animated.View pointerEvents="none" style={[styles.sweep, sweepStyle]} />
      </Animated.View>
      <Pressable
        onPress={onPress}
        hitSlop={HEADER_QR_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={HEADER_QR_A11Y}
        style={styles.btn}
      >
        <Ionicons name="qr-code-outline" size={HEADER_QR_ICON_SIZE} color={colors.primary} />
      </Pressable>
    </View>
  );
}

export default memo(HeaderQrButton);

const styles = StyleSheet.create({
  wrap: {
    width: HEADER_QR_BUTTON_SIZE,
    height: HEADER_QR_BUTTON_SIZE,
    marginLeft: HEADER_QR_LOGO_GAP,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  halo: {
    position: 'absolute',
    width: HEADER_QR_HALO_SIZE,
    height: HEADER_QR_HALO_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: HEADER_QR_HALO_SIZE,
    height: HEADER_QR_HALO_SIZE,
    borderRadius: HEADER_QR_HALO_SIZE / 2,
    backgroundColor: HEADER_QR_HALO_SOFT,
  },
  sweep: {
    position: 'absolute',
    width: HEADER_QR_HALO_SIZE,
    height: HEADER_QR_HALO_SIZE,
    borderRadius: HEADER_QR_HALO_SIZE / 2,
    borderWidth: 3,
    borderColor: 'transparent',
    borderTopColor: HEADER_QR_HALO_COLOR,
    borderRightColor: 'rgba(30, 108, 255, 0.35)',
  },
  btn: {
    width: HEADER_QR_BUTTON_SIZE,
    height: HEADER_QR_BUTTON_SIZE,
    borderRadius: HEADER_QR_BUTTON_SIZE / 2,
    backgroundColor: colors.primarysoft,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
});
