import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Image, ImageContentFit } from 'expo-image';
import { large } from '../lib/images';

/**
 * Safety cap for extremely tall photos (width/height).
 *
 * Typical camera portraits are 3:4 (~0.75) or 9:16 (~0.56). Those stay
 * uncropped. Anything taller than 9:16 (long screenshots, 1:3 collages)
 * is boxed to 9:16 so a single feed item cannot become several screens
 * tall. Cropping, when it happens, is top/bottom via contentFit="cover"
 * — never side letterboxing.
 *
 * Instagram Feed uses a tighter 4:5 cap (which crops 9:16 phone photos).
 * We use 9:16 so normal phone portraits keep their real proportion.
 */
export const MAX_PORTRAIT_ASPECT = 9 / 16;

export function postMediaAspectRatio(
  imgW: number,
  imgH: number,
  opts?: {
    containerWidth?: number;
    maxHeight?: number;
    /** Minimum width/height. Default 9/16. Pass 0 to disable. */
    minAspectRatio?: number;
  }
): number {
  if (!(imgW > 0 && imgH > 0)) return 1;
  let ratio = imgW / imgH;
  const minA = opts?.minAspectRatio ?? MAX_PORTRAIT_ASPECT;
  if (minA > 0) ratio = Math.max(ratio, minA);
  const cw = opts?.containerWidth;
  const mh = opts?.maxHeight;
  if (cw && mh && cw > 0 && mh > 0) {
    ratio = Math.max(ratio, cw / mh);
  }
  return ratio;
}

type Props = {
  uri: string;
  /**
   * Extra height cap in px (e.g. desktop /p/:id column). Combined with
   * contentFit="contain" the full photo stays visible (letterbox on the
   * parent background, not beige side bands in the feed).
   */
  maxHeight?: number;
  /**
   * cover (default, feed): fill 100% width; crop only if height-capped.
   * contain: never crop — used by the public post desktop layout.
   */
  contentFit?: ImageContentFit;
  /** Apply the 9:16 portrait safety cap. Default true. */
  capPortrait?: boolean;
};

/** Shows the photo at its real proportion. Width is always 100%. */
export function AdaptivePostImage({
  uri,
  maxHeight,
  contentFit = 'cover',
  capPortrait = true,
}: Props) {
  const [natural, setNatural] = useState({ w: 1, h: 1 });
  const [boxW, setBoxW] = useState(0);

  const displayRatio = useMemo(
    () =>
      postMediaAspectRatio(natural.w, natural.h, {
        containerWidth: boxW,
        maxHeight,
        minAspectRatio: capPortrait ? MAX_PORTRAIT_ASPECT : 0,
      }),
    [natural, boxW, maxHeight, capPortrait]
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== boxW) setBoxW(w);
  };

  return (
    <View style={[styles.wrap, { aspectRatio: displayRatio }]} onLayout={onLayout}>
      <Image
        source={{ uri: large(uri) }}
        style={styles.image}
        contentFit={contentFit}
        transition={200}
        onLoad={(e) => {
          const w = e.source?.width;
          const h = e.source?.height;
          if (w && h && w > 0 && h > 0) setNatural({ w, h });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: 'transparent',
    position: 'relative',
  },
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
