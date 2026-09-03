import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedProps } from 'react-native-reanimated';
import { STORY_GESTURE_DEBUG_MARK, abbreviateUpdateId } from '../lib/storyGestureDebug';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

type Props = {
  visible: boolean;
  top: number;
  updateId: string | null;
  channel: string | null;
  runtimeVersion: string | null;
  embedded: boolean;
  action: string;
  storyIndex: number;
  storyCount: number;
  rawHit: boolean;
  stageBox: string;
  touchBox: string;
  gestureChildBox: string;
  surfaceW: number;
  surfaceH: number;
  debugDx: SharedValue<number>;
  debugDy: SharedValue<number>;
  debugProgress: SharedValue<number>;
  debugHold: SharedValue<number>;
  debugPan: SharedValue<number>;
};

export default function StoryGestureDebugHud({
  visible,
  top,
  updateId,
  channel,
  runtimeVersion,
  embedded,
  action,
  storyIndex,
  storyCount,
  rawHit,
  stageBox,
  touchBox,
  gestureChildBox,
  surfaceW,
  surfaceH,
  debugDx,
  debugDy,
  debugProgress,
  debugHold,
  debugPan,
}: Props) {
  const liveProps = useAnimatedProps(() => {
    const panNames = ['IDLE', 'ACTIVE', 'END', 'CANCEL'];
    const text =
      `HOLD: ${debugHold.value >= 1 ? 'TRUE' : 'FALSE'}\n` +
      `PAN: ${panNames[debugPan.value] || 'IDLE'}\n` +
      `DX: ${debugDx.value.toFixed(1)}\n` +
      `DY: ${debugDy.value.toFixed(1)}\n` +
      `PROGRESS: ${debugProgress.value.toFixed(2)}`;
    return { text, defaultValue: text };
  });

  if (!visible) return null;

  return (
    <View pointerEvents="none" style={[styles.wrap, { top }]} accessibilityLabel={STORY_GESTURE_DEBUG_MARK}>
      <Text pointerEvents="none" style={styles.line}>
        {STORY_GESTURE_DEBUG_MARK}
      </Text>
      <Text pointerEvents="none" style={styles.line}>
        UPDATE: {abbreviateUpdateId(updateId)} CH: {channel || 'null'}
      </Text>
      <Text pointerEvents="none" style={styles.line}>
        RT: {runtimeVersion || 'null'} EMBEDDED: {embedded ? 'true' : 'false'}
      </Text>
      <Text pointerEvents="none" style={styles.line}>
        STAGE: {stageBox}
      </Text>
      <Text pointerEvents="none" style={styles.line}>
        TOUCH: {touchBox}
      </Text>
      <Text pointerEvents="none" style={styles.line}>
        GESTURE CHILD: {gestureChildBox}
      </Text>
      <Text pointerEvents="none" style={styles.line}>
        SURFACE W: {surfaceW}
      </Text>
      <Text pointerEvents="none" style={styles.line}>
        SURFACE H: {surfaceH}
      </Text>
      <Text pointerEvents="none" style={styles.line}>
        RAW HIT: {rawHit ? 'YES' : 'NO'}
      </Text>
      <AnimatedTextInput
        pointerEvents="none"
        editable={false}
        multiline
        caretHidden
        underlineColorAndroid="transparent"
        style={styles.live}
        animatedProps={liveProps}
      />
      <Text pointerEvents="none" style={styles.line}>
        ACTION: {action}
      </Text>
      <Text pointerEvents="none" style={styles.line}>
        STORY: {storyIndex + 1}/{Math.max(storyCount, 1)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 8,
    zIndex: 30,
    elevation: 24,
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    maxWidth: 220,
  },
  line: {
    color: '#B8FF6A',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
    fontVariant: ['tabular-nums'],
  },
  live: {
    color: '#B8FF6A',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
    padding: 0,
    margin: 0,
    minHeight: 70,
    backgroundColor: 'transparent',
  },
});
