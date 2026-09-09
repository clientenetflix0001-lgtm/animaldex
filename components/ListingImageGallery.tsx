import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  FlatList,
  useWindowDimensions,
  StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { large } from '../lib/images';

type Props = {
  images: string[];
  previewWidth: number;
  previewHeight?: number;
};

export default function ListingImageGallery({ images, previewWidth, previewHeight }: Props) {
  const { width, height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const previewRef = useRef<FlatList<string>>(null);
  const viewerRef = useRef<FlatList<string>>(null);
  const boxH = previewHeight ?? previewWidth;

  const openAt = useCallback((i: number) => {
    setIndex(i);
    setOpen(true);
    requestAnimationFrame(() => {
      viewerRef.current?.scrollToIndex({ index: i, animated: false });
    });
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const onPreviewScroll = useCallback(
    (x: number) => {
      if (!previewWidth) return;
      setIndex(Math.max(0, Math.round(x / previewWidth)));
    },
    [previewWidth]
  );

  const onViewerScroll = useCallback(
    (x: number) => {
      if (!width) return;
      setIndex(Math.max(0, Math.round(x / width)));
    },
    [width]
  );

  if (!images.length) return null;

  return (
    <View>
      <FlatList
        ref={previewRef}
        data={images}
        keyExtractor={(uri, i) => `preview-${uri}-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => onPreviewScroll(e.nativeEvent.contentOffset.x)}
        renderItem={({ item, index: i }) => (
          <Pressable onPress={() => openAt(i)}>
            <Image
              source={{ uri: large(item) }}
              style={{ width: previewWidth, height: boxH }}
              contentFit="cover"
              transition={300}
            />
          </Pressable>
        )}
      />
      {images.length > 1 ? (
        <View style={styles.dotsRow} pointerEvents="none">
          <Text style={styles.count}>{index + 1} / {images.length}</Text>
        </View>
      ) : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <StatusBar barStyle="light-content" />
        <View style={styles.viewer}>
          <FlatList
            ref={viewerRef}
            data={images}
            keyExtractor={(uri, i) => `full-${uri}-${i}`}
            horizontal
            pagingEnabled
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onScrollToIndexFailed={({ index: i }) => {
              requestAnimationFrame(() => viewerRef.current?.scrollToIndex({ index: i, animated: false }));
            }}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => onViewerScroll(e.nativeEvent.contentOffset.x)}
            renderItem={({ item }) => (
              <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
                <Image
                  source={{ uri: large(item) }}
                  style={{ width, height }}
                  contentFit="contain"
                />
              </View>
            )}
          />
          <Pressable style={styles.closeBtn} onPress={close} hitSlop={12} accessibilityLabel="Cerrar">
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.viewerCount}>
            {index + 1} / {images.length}
          </Text>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  dotsRow: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  count: { color: '#fff', fontSize: 12, fontWeight: '700' },
  viewer: { flex: 1, backgroundColor: '#000' },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerCount: {
    position: 'absolute',
    bottom: 36,
    alignSelf: 'center',
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
