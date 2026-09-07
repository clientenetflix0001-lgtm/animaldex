import React, { useCallback, useRef } from 'react';
import {
  FlatList,
  Pressable,
  type FlatListProps,
  type GestureResponderEvent,
  type PressableProps,
} from 'react-native';
import { shouldFireHomeModulePress } from '../lib/homeModuleGestures.ts';
import { useHomeModuleGestureLock } from '../lib/homeModuleGesturesContext.tsx';

export function useHomeHorizontalListProps() {
  const { claimHorizontal, releaseHorizontal, markCarouselScroll } = useHomeModuleGestureLock();

  const onTouchStart = useCallback(() => {
    claimHorizontal();
  }, [claimHorizontal]);

  const onTouchEnd = useCallback(() => {
    releaseHorizontal();
  }, [releaseHorizontal]);

  const onScrollBeginDrag = useCallback(() => {
    claimHorizontal();
    markCarouselScroll();
  }, [claimHorizontal, markCarouselScroll]);

  const onMomentumScrollEnd = useCallback(() => {
    releaseHorizontal();
  }, [releaseHorizontal]);

  return {
    horizontal: true as const,
    nestedScrollEnabled: true,
    directionalLockEnabled: true,
    showsHorizontalScrollIndicator: false,
    keyboardShouldPersistTaps: 'handled' as const,
    onTouchStart,
    onTouchEnd,
    onTouchCancel: onTouchEnd,
    onScrollBeginDrag,
    onMomentumScrollEnd,
  };
}

export function HomeHorizontalList<ItemT>(props: Omit<FlatListProps<ItemT>, 'horizontal'>) {
  const isolated = useHomeHorizontalListProps();
  return <FlatList {...props} {...isolated} />;
}

export function HomeModulePressable({ onPress, onPressIn, ...rest }: PressableProps) {
  const origin = useRef({ x: 0, y: 0 });
  const { wasRecentHorizontalSwipe } = useHomeModuleGestureLock();

  return (
    <Pressable
      {...rest}
      onPressIn={(event: GestureResponderEvent) => {
        origin.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
        onPressIn?.(event);
      }}
      onPress={(event) => {
        const dx = event.nativeEvent.pageX - origin.current.x;
        const dy = event.nativeEvent.pageY - origin.current.y;
        if (!shouldFireHomeModulePress({ dx, dy, recentHorizontalSwipe: wasRecentHorizontalSwipe() })) {
          return;
        }
        onPress?.(event);
      }}
    />
  );
}
