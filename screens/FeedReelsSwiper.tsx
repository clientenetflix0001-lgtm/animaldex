import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, LayoutChangeEvent, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import FeedScreen from './FeedScreen';
import ReelsScreen from './ReelsScreen';
import { ReelsPageVisibleProvider } from '../lib/reelsFocus';
import { shouldPlayFeedReels } from '../lib/feedReelsNav';
import { useFeedReelsNav } from '../lib/feedReelsNavContext';

export default function FeedReelsSwiper() {
  const scrollRef = useRef<ScrollView>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { page, setPage } = useFeedReelsNav();
  const tabFocused = useIsFocused();

  useEffect(() => {
    if (!size.width) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: page * size.width, animated: true });
    });
  }, [page, size.width]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0 && (width !== size.width || height !== size.height)) {
      setSize({ width, height });
    }
  }, [size.width, size.height]);

  const onMomentumScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!size.width) return;
    const next = Math.round(e.nativeEvent.contentOffset.x / size.width);
    setPage(next <= 0 ? 0 : 1);
  }, [setPage, size.width]);

  const reelsVisible = shouldPlayFeedReels({ page, tabFocused });

  return (
    <View style={styles.root} onLayout={onLayout}>
      {size.width > 0 && (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumScrollEnd}
          style={{ width: size.width, height: size.height }}
        >
          <View style={{ width: size.width, height: size.height }}>
            <FeedScreen />
          </View>
          <View style={{ width: size.width, height: size.height }}>
            <ReelsPageVisibleProvider visible={reelsVisible}>
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
