import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';

type Props = {
  count: number;
  index: number;
  progress: number;
};

function StoryProgress({ count, index, progress }: Props) {
  return (
    <View style={styles.row}>
      {Array.from({ length: count }).map((_, i) => {
        const fill = i < index ? 1 : i === index ? progress : 0;
        return (
          <View key={i} style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(0, Math.min(1, fill)) * 100}%` }]} />
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
});
