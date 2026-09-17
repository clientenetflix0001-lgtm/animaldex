import React, { memo } from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { feedMediaPerfNotePawOverlay } from '../lib/feedMediaPerf';
import { PAW_OVERLAY_DECORATIVE_NODES } from '../lib/pawPrintLayout';

const PAW_OVERLAY = require('../assets/images/paw-print-overlay.png');

function PawPrintOverlayInner({
  color,
  compact,
}: {
  color: string;
  compact?: boolean;
}) {
  feedMediaPerfNotePawOverlay(PAW_OVERLAY_DECORATIVE_NODES);
  return (
    <Image
      source={PAW_OVERLAY}
      style={[StyleSheet.absoluteFill, { tintColor: color, opacity: compact ? 0.16 : 0.13 }]}
      contentFit="cover"
      recyclingKey="animaldex-paw-overlay"
      transition={0}
      pointerEvents="none"
    />
  );
}

export const PawPrintOverlay = memo(PawPrintOverlayInner);
