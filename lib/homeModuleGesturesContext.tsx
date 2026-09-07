import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  HOME_MODULE_PRESS_SUPPRESS_MS,
  parentFeedPagerShouldScroll,
} from './homeModuleGestures.ts';

type Ctx = {
  parentPagerEnabled: boolean;
  claimHorizontal: () => void;
  releaseHorizontal: () => void;
  markCarouselScroll: () => void;
  wasRecentHorizontalSwipe: () => boolean;
};

const defaultCtx: Ctx = {
  parentPagerEnabled: true,
  claimHorizontal: () => {},
  releaseHorizontal: () => {},
  markCarouselScroll: () => {},
  wasRecentHorizontalSwipe: () => false,
};

const HomeModuleGestureLockContext = createContext<Ctx>(defaultCtx);

export function HomeModuleGestureLockProvider({ children }: { children: React.ReactNode }) {
  const [parentPagerEnabled, setParentPagerEnabled] = useState(true);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCarouselScrollAt = useRef(0);

  const claimHorizontal = useCallback(() => {
    if (releaseTimer.current) {
      clearTimeout(releaseTimer.current);
      releaseTimer.current = null;
    }
    setParentPagerEnabled(parentFeedPagerShouldScroll({ moduleOwnsHorizontal: true }));
  }, []);

  const releaseHorizontal = useCallback(() => {
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    releaseTimer.current = setTimeout(() => {
      releaseTimer.current = null;
      setParentPagerEnabled(parentFeedPagerShouldScroll({ moduleOwnsHorizontal: false }));
    }, 50);
  }, []);

  const markCarouselScroll = useCallback(() => {
    lastCarouselScrollAt.current = Date.now();
  }, []);

  const wasRecentHorizontalSwipe = useCallback(
    () => Date.now() - lastCarouselScrollAt.current < HOME_MODULE_PRESS_SUPPRESS_MS,
    []
  );

  const value = useMemo(
    () => ({
      parentPagerEnabled,
      claimHorizontal,
      releaseHorizontal,
      markCarouselScroll,
      wasRecentHorizontalSwipe,
    }),
    [parentPagerEnabled, claimHorizontal, releaseHorizontal, markCarouselScroll, wasRecentHorizontalSwipe]
  );

  return (
    <HomeModuleGestureLockContext.Provider value={value}>{children}</HomeModuleGestureLockContext.Provider>
  );
}

export function useHomeModuleGestureLock(): Ctx {
  return useContext(HomeModuleGestureLockContext);
}
