import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ReelTextOverlay } from '../lib/reelOverlays';

function ReelOverlayLayerInner({ overlays }: { overlays: ReelTextOverlay[] }) {
  if (!overlays?.length) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {overlays.map((ov) => (
        <View
          key={ov.id}
          style={[
            styles.item,
            {
              left: `${ov.x * 100}%`,
              top: `${ov.y * 100}%`,
            },
          ]}
        >
          <Text
            style={[
              styles.text,
              {
                color: ov.textColor,
                fontSize: ov.fontSize,
                fontWeight: ov.bold ? '800' : '700',
                textAlign: ov.align || 'center',
                backgroundColor: ov.background === 'solid' ? 'rgba(0,0,0,0.55)' : 'transparent',
              },
            ]}
          >
            {ov.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

export const ReelOverlayLayer = memo(ReelOverlayLayerInner);

const styles = StyleSheet.create({
  item: {
    position: 'absolute',
    transform: [{ translateX: -80 }, { translateY: -16 }],
    width: 160,
    alignItems: 'center',
  },
  text: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
});
