import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, LayoutChangeEvent, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import FeedScreen from './FeedScreen';
import ReelsScreen from './ReelsScreen';
import { ReelsPageVisibleProvider } from '../lib/reelsFocus';

interface Props {
  initialPage: 0 | 1;
}

export default function FeedReelsSwiper({ initialPage }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [page, setPage] = useState<0 | 1>(initialPage);
  const appliedInitialRef = useRef(false);

  useEffect(() => {
    if (size.width > 0 && !appliedInitialRef.current) {
      appliedInitialRef.current = true;
      if (initialPage === 1) {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ x: size.width, animated: false });
        });
      }
    }
  }, [size.width, initialPage]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0 && (width !== size.width || height !== size.height)) {
      setSize({ width, height });
    }
  }, [size.width, size.height]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!size.width) return;
    const next = Math.round(e.nativeEvent.contentOffset.x / size.width);
    const clamped = next <= 0 ? 0 : 1;
    setPage((prev) => (prev === clamped ? prev : clamped));
  }, [size.width]);

  return (
    <View style={styles.root} onLayout={onLayout}>
      {size.width > 0 && (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScroll}
          onMomentumScrollEnd={onScroll}
          style={{ width: size.width, height: size.height }}
        >
          <View style={{ width: size.width, height: size.height }}>
            <FeedScreen />
          </View>
          <View style={{ width: size.width, height: size.height }}>
            <ReelsPageVisibleProvider visible={page === 1}>
              <ReelsScreen />
            </ReelsPageVisibleProvider>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
