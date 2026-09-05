import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

type Props = {
  count: number;
  index: number;
  progress: SharedValue<number>;
};

function ActiveFill({ progress }: { progress: SharedValue<number> }) {
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.max(0, Math.min(1, progress.value)) }],
  }));
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, styles.activeFill, fillStyle]} />
    </View>
  );
}

function StoryProgress({ count, index, progress }: Props) {
  return (
    <View style={styles.row}>
      {Array.from({ length: count }).map((_, i) => {
        if (i === index) return <ActiveFill key={i} progress={progress} />;
        return (
          <View key={i} style={styles.track}>
            <View style={[styles.fill, { width: i < index ? '100%' : 0 }]} />
          </View>
        );
      })}
    </View>
  );
}

export default memo(StoryProgress);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, paddingHorizontal: 8 },
  track: { flex: 1, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#fff' },
  activeFill: {
    width: '100%',
    transformOrigin: 'left center',
  },
});
