import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { large } from '../lib/images';
import { colors } from '../lib/theme';

interface Props {
  uri: string;
  maxHeight?: number;
  imageWidth?: number | null;
  imageHeight?: number | null;
}

// Cache global en memoria para URIs ya resueltas (evita recalculaciones si la celda se desmonta/remonta)
const resolvedRatioCache = new Map<string, number>();

/** Muestra la foto con su proporción original conocida desde el primer render si está disponible. */
export function AdaptivePostImage({ uri, maxHeight = 520, imageWidth, imageHeight }: Props) {
  // 1. Si width y height vienen guardados con la publicación, los usamos directamente
  const knownRatio = (imageWidth && imageHeight && imageWidth > 0 && imageHeight > 0)
    ? imageWidth / imageHeight
    : resolvedRatioCache.get(uri);

  const [ratio, setRatio] = useState<number>(knownRatio ?? 1);

  return (
    <View style={[styles.wrap, { maxHeight }]}>
      <Image
        source={{ uri: large(uri) }}
        style={{ width: '100%', aspectRatio: ratio, maxHeight }}
        contentFit="contain"
        transition={200}
        onLoad={(e) => {
          // Solo actualizamos si no teníamos un ratio conocido previo para evitar re-renders y saltos
          if (knownRatio) return;
          const w = e.source?.width;
          const h = e.source?.height;
          if (w && h && w > 0 && h > 0) {
            const newRatio = w / h;
            resolvedRatioCache.set(uri, newRatio);
            if (newRatio !== ratio) {
              setRatio(newRatio);
            }
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', backgroundColor: colors.border, overflow: 'hidden' },
});
