import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, LayoutChangeEvent, NativeSyntheticEvent, NativeScrollEvent, Platform } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import FeedScreen from './FeedScreen';
import ReelsScreen from './ReelsScreen';
import { ReelsPageVisibleProvider } from '../lib/reelsFocus';
import { commitFeedPageFromOffset, shouldPlayFeedReels } from '../lib/feedReelsNav';
import { useFeedReelsNav } from '../lib/feedReelsNavContext';
import { HomeModuleGestureLockProvider, useHomeModuleGestureLock } from '../lib/homeModuleGesturesContext';

const WEB_SCROLL_SETTLE_MS = 80;

function FeedReelsSwiperInner() {
  const scrollRef = useRef<ScrollView>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { page, setPage } = useFeedReelsNav();
  const { parentPagerEnabled } = useHomeModuleGestureLock();
  const tabFocused = useIsFocused();
  const fromUserScroll = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!size.width) return;
    if (fromUserScroll.current) {
      fromUserScroll.current = false;
      return;
    }
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: page * size.width, animated: true });
    });
  }, [page, size.width]);

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    []
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0 && (width !== size.width || height !== size.height)) {
      setSize({ width, height });
    }
  }, [size.width, size.height]);

  const commitOffset = useCallback((offsetX: number) => {
    if (!size.width) return;
    const next = commitFeedPageFromOffset(offsetX, size.width, page);
    if (next == null) return;
    fromUserScroll.current = true;
    setPage(next);
  }, [page, setPage, size.width]);

  const onMomentumScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    commitOffset(e.nativeEvent.contentOffset.x);
  }, [commitOffset]);

  const onScrollEndDrag = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    commitOffset(e.nativeEvent.contentOffset.x);
  }, [commitOffset]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Platform.OS !== 'web') return;
    const offsetX = e.nativeEvent.contentOffset.x;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => commitOffset(offsetX), WEB_SCROLL_SETTLE_MS);
  }, [commitOffset]);

  const reelsVisible = shouldPlayFeedReels({ page, tabFocused });

  return (
    <View style={styles.root} onLayout={onLayout}>
      {size.width > 0 && (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          scrollEnabled={parentPagerEnabled}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumScrollEnd}
          onScrollEndDrag={Platform.OS === 'web' ? onScrollEndDrag : undefined}
          onScroll={Platform.OS === 'web' ? onScroll : undefined}
          scrollEventThrottle={16}
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

export default function FeedReelsSwiper() {
  return (
    <HomeModuleGestureLockProvider>
      <FeedReelsSwiperInner />
    </HomeModuleGestureLockProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
