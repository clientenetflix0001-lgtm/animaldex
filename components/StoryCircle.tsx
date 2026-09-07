import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../lib/theme';
import { STORY_SEEN_RING, STORY_UNSEEN_GRADIENT, type StoryRingVariant } from '../lib/stories';
import { thumb } from '../lib/images';

type Props = {
  label: string;
  thumbUrl?: string | null;
  emoji?: string | null;
  ring: StoryRingVariant;
  isSelf?: boolean;
  onPress: () => void;
  onAdd?: () => void;
};

function StoryCircle({ label, thumbUrl, emoji, ring, isSelf, onPress, onAdd }: Props) {
  const size = 64;
  const outer = size + 6;
  return (
    <Pressable style={styles.item} onPress={onPress} accessibilityLabel={label}>
      {ring === 'unseen' ? (
        <LinearGradient colors={[...STORY_UNSEEN_GRADIENT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.ring, { width: outer, height: outer, borderRadius: outer / 2 }]}>
          <Inner thumbUrl={thumbUrl} emoji={emoji} size={size} fallbackPlus={!!isSelf && !thumbUrl} />
        </LinearGradient>
      ) : ring === 'seen' ? (
        <View style={[styles.ring, styles.seenRing, { width: outer, height: outer, borderRadius: outer / 2 }]}>
          <Inner thumbUrl={thumbUrl} emoji={emoji} size={size} />
        </View>
      ) : (
        <View style={[styles.addRing, { width: outer, height: outer, borderRadius: outer / 2 }]}>
          <Inner thumbUrl={thumbUrl} emoji={emoji} size={size - 6} fallbackPlus />
        </View>
      )}
      {isSelf && ring !== 'none' ? (
        <Pressable style={styles.addBadge} onPress={onAdd} accessibilityLabel="Agregar historia">
          <Ionicons name="add" size={12} color="#fff" />
        </Pressable>
      ) : null}
      <Text style={styles.name} numberOfLines={1}>
        {emoji && !thumbUrl ? `${emoji} ${label}` : emoji && ring !== 'none' ? `${emoji} ${label}` : label}
      </Text>
    </Pressable>
  );
}

function Inner({
  thumbUrl,
  emoji,
  size,
  fallbackPlus,
}: {
  thumbUrl?: string | null;
  emoji?: string | null;
  size: number;
  fallbackPlus?: boolean;
}) {
  return (
    <View style={[styles.imgWrap, { width: size, height: size, borderRadius: size / 2 }]}>
      {thumbUrl ? (
        <Image source={{ uri: thumb(thumbUrl, 150) }} style={styles.img} contentFit="cover" transition={200} />
      ) : fallbackPlus ? (
        <View style={styles.addCircle}>
          <Ionicons name="add" size={26} color={colors.primary} />
        </View>
      ) : (
        <View style={styles.fallback}>
          <Text style={styles.fallbackEmoji}>{emoji || '🐾'}</Text>
        </View>
      )}
    </View>
  );
}

export default memo(StoryCircle);

const styles = StyleSheet.create({
  item: { alignItems: 'center', width: 72, position: 'relative' },
  ring: { alignItems: 'center', justifyContent: 'center' },
  seenRing: { backgroundColor: STORY_SEEN_RING },
  addRing: {
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imgWrap: {
    borderWidth: 3,
    borderColor: colors.bg,
    overflow: 'hidden',
    backgroundColor: colors.primarysoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: { width: '100%', height: '100%' },
  addCircle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarysoft,
    width: '100%',
    height: '100%',
  },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' },
  fallbackEmoji: { fontSize: 22 },
  addBadge: {
    position: 'absolute',
    right: 6,
    top: 44,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  name: { fontSize: 11, color: colors.text, marginTop: 5, fontWeight: '600', textAlign: 'center' },
});
