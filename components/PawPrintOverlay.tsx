import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PAW_LAYOUTS, pawLayoutIndexForBackgroundId } from '../lib/pawPrintLayout';

function PawPrintOverlayInner({
  color,
  backgroundId,
  compact,
}: {
  color: string;
  backgroundId: string;
  compact?: boolean;
}) {
  const marks = PAW_LAYOUTS[pawLayoutIndexForBackgroundId(backgroundId)];
  const scale = compact ? 0.4 : 1;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {marks.map((m, i) => (
        <Ionicons
          key={i}
          name="paw"
          size={Math.max(8, Math.round(m.size * scale))}
          color={color}
          style={{
            position: 'absolute',
            top: m.top,
            left: m.left,
            opacity: compact ? 0.16 : 0.13,
            transform: [{ rotate: m.rotate }],
          }}
        />
      ))}
    </View>
  );
}

export const PawPrintOverlay = memo(PawPrintOverlayInner);
