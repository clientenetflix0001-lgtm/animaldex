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
  paused: boolean;
  frozen: boolean;
  action: string;
  storyIndex: number;
  storyCount: number;
  debugDx: SharedValue<number>;
  debugDy: SharedValue<number>;
  debugProgress: SharedValue<number>;
  debugPhase: SharedValue<number>;
  debugDown: SharedValue<number>;
  stageBox: string;
  touchBox: string;
  rawTap: boolean;
  rawPress: boolean;
};

export default function StoryGestureDebugHud({
  visible,
  top,
  updateId,
  channel,
  runtimeVersion,
  embedded,
  paused,
  frozen,
  action,
  storyIndex,
  storyCount,
  debugDx,
  debugDy,
  debugProgress,
  debugPhase,
  debugDown,
  stageBox,
  touchBox,
  rawTap,
  rawPress,
}: Props) {
  const liveProps = useAnimatedProps(() => {
    const names = ['IDLE', 'BEGAN', 'ACTIVE', 'END', 'CANCEL'];
    const phase = names[debugPhase.value] || 'IDLE';
    const down = debugDown.value >= 1 ? 'TRUE' : 'FALSE';
    const dx = debugDx.value;
    const dy = debugDy.value;
    const progress = debugProgress.value;
    const text =
      `GESTURE: ${phase}\n` +
      `GESTURE_DOWN: ${down}\n` +
      `DX: ${dx.toFixed(1)}\n` +
      `DY: ${dy.toFixed(1)}\n` +
      `PROGRESS: ${progress.toFixed(2)}`;
    return { text, defaultValue: text };
  });

  if (!visible) return null;

  return (
    <View pointerEvents="none" style={[styles.wrap, { top }]} accessibilityLabel={STORY_GESTURE_DEBUG_MARK}>
      <Text pointerEvents="none" style={styles.line}>
        {STORY_GESTURE_DEBUG_MARK}
      </Text>
      <Text pointerEvents="none" style={styles.line}>
        UPDATE: {abbreviateUpdateId(updateId)}
      </Text>
      <Text pointerEvents="none" style={styles.line}>
        CH: {channel || 'null'} RT: {runtimeVersion || 'null'}
      </Text>
      <Text pointerEvents="none" style={styles.line}>
        EMBEDDED: {embedded ? 'true' : 'false'}
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
        PAUSED: {paused ? 'TRUE' : 'FALSE'}
      </Text>
      <Text pointerEvents="none" style={styles.line}>
        FROZEN: {frozen ? 'TRUE' : 'FALSE'}
      </Text>
      <Text pointerEvents="none" style={styles.line}>
        ACTION: {action}
      </Text>
      <Text pointerEvents="none" style={styles.line}>
        STORY: {storyIndex + 1}/{Math.max(storyCount, 1)}
      </Text>
      <Text pointerEvents="none" style={styles.line}>
        STAGE: {stageBox}
      </Text>
      <Text pointerEvents="none" style={styles.line}>
        TOUCH: {touchBox}
      </Text>
      <Text pointerEvents="none" style={styles.line}>
        RAW TAP: {rawTap ? 'YES' : 'NO'}
      </Text>
      <Text pointerEvents="none" style={styles.line}>
        RAW PRESS: {rawPress ? 'YES' : 'NO'}
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
    maxWidth: 240,
  },
  line: {
    color: '#B8FF6A',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  live: {
    color: '#B8FF6A',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    padding: 0,
    margin: 0,
    minHeight: 80,
    backgroundColor: 'transparent',
  },
});
