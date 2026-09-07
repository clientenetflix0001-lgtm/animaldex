import React, { memo } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { radius } from '../lib/theme';

/** Misma caja visual que CreateStory: ancho completo, alto fijo, cover. */
export const SELECTED_IMAGE_PREVIEW_HEIGHT = 280;

type Props = {
  uri: string;
  loading?: boolean;
};

function SelectedImagePreviewInner({ uri, loading }: Props) {
  return (
    <View style={styles.wrap} accessibilityLabel="Vista previa de foto">
      <Image source={{ uri }} style={styles.preview} contentFit="cover" />
      {loading ? (
        <View style={styles.overlay}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : null}
    </View>
  );
}

export const SelectedImagePreview = memo(SelectedImagePreviewInner);

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    height: SELECTED_IMAGE_PREVIEW_HEIGHT,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  preview: {
    width: '100%',
    height: SELECTED_IMAGE_PREVIEW_HEIGHT,
    backgroundColor: '#111',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
