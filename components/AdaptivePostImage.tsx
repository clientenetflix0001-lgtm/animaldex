import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { large } from '../lib/images';
import { colors } from '../lib/theme';

/** Muestra la foto con su proporción original. No recorta ni deforma. */
export function AdaptivePostImage({ uri, maxHeight = 520 }: { uri: string; maxHeight?: number }) {
  const [ratio, setRatio] = useState(1);

  return (
    <View style={[styles.wrap, { maxHeight }]}>
      <Image
        source={{ uri: large(uri) }}
        style={{ width: '100%', aspectRatio: ratio, maxHeight }}
        contentFit="contain"
        transition={200}
        onLoad={(e) => {
          const w = e.source?.width;
          const h = e.source?.height;
          if (w && h && w > 0 && h > 0) setRatio(w / h);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', backgroundColor: colors.border, overflow: 'hidden' },
});
