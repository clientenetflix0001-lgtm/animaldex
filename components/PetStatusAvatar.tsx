import React, { memo, useEffect, type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import {
  PET_STATUS_RING_GAP,
  PET_STATUS_RING_MS,
  PET_STATUS_RING_WIDTH,
  petStatusRingColors,
  petStatusRingOuterSize,
} from '../lib/petStatusRing';
import { colors } from '../lib/theme';

type Props = {
  uri: string;
  size: number;
  status?: string | null;
  children?: ReactNode;
};

function PetStatusAvatar({ uri, size, status, children }: Props) {
  const palette = petStatusRingColors(status);
  const outer = palette ? petStatusRingOuterSize(size) : size;
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (!palette) {
      rotation.value = 0;
      return;
    }
    rotation.value = 0;
    rotation.value = withRepeat(
      withTiming(360, { duration: PET_STATUS_RING_MS, easing: Easing.linear }),
      -1,
      false
    );
  }, [palette, rotation]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const photoRadius = size / 2;
  const hole = size + PET_STATUS_RING_GAP * 2;

  return (
    <View style={{ width: outer, height: outer, alignItems: 'center', justifyContent: 'center' }}>
      {palette ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ringDisk,
            { width: outer, height: outer, borderRadius: outer / 2 },
            ringStyle,
          ]}
        >
          <LinearGradient
            colors={[palette[0], palette[1], palette[2], palette[0]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: outer, height: outer }}
          />
        </Animated.View>
      ) : null}
      <View
        style={[
          styles.photoWrap,
          {
            width: palette ? hole : size,
            height: palette ? hole : size,
            borderRadius: (palette ? hole : size) / 2,
            backgroundColor: '#FFFFFF',
          },
        ]}
      >
        <View style={{ width: size, height: size }}>
          <Image
            source={{ uri }}
            style={{
              width: size,
              height: size,
              borderRadius: photoRadius,
              backgroundColor: colors.border,
              borderWidth: palette ? 0 : 3,
              borderColor: colors.primarysoft,
            }}
            contentFit="cover"
            transition={250}
          />
          {children}
        </View>
      </View>
    </View>
  );
}

export default memo(PetStatusAvatar);

const styles = StyleSheet.create({
  ringDisk: {
    position: 'absolute',
    overflow: 'hidden',
  },
  photoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
