import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Post } from '../lib/data';
import { thumb } from '../lib/images';
import {
  PostBackground,
  POST_BACKGROUND_CARD_HEIGHT,
  backgroundCardFontSize,
  backgroundCardMaxLines,
  backgroundTextNeedsSeeMore,
  isTextBackgroundPost,
  resolvePostBackground,
} from '../lib/postBackgrounds';
import { colors, radius } from '../lib/theme';

const PAW_MARKS = [
  { top: '8%', left: '10%', rotate: '-18deg', size: 34 },
  { top: '18%', left: '72%', rotate: '22deg', size: 42 },
  { top: '58%', left: '8%', rotate: '12deg', size: 38 },
  { top: '68%', left: '70%', rotate: '-10deg', size: 46 },
  { top: '40%', left: '42%', rotate: '8deg', size: 28 },
] as const;

function BackgroundFill({ bg }: { bg: PostBackground }) {
  if (bg.type === 'image' && bg.imageUrl) {
    return (
      <Image
        source={{ uri: bg.imageUrl }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        recyclingKey={bg.id}
        transition={0}
        pointerEvents="none"
      />
    );
  }
  if (bg.type === 'gradient' && bg.colors.length >= 2) {
    const colorsTuple = bg.colors as unknown as [string, string, ...string[]];
    return (
      <LinearGradient
        colors={colorsTuple}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        dither={false}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    );
  }
  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: bg.colors[0] }]}
      pointerEvents="none"
    />
  );
}

function PawPattern({ color }: { color: string }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {PAW_MARKS.map((m, i) => (
        <Text
          key={i}
          style={{
            position: 'absolute',
            top: m.top,
            left: m.left,
            fontSize: m.size,
            opacity: 0.16,
            color,
            transform: [{ rotate: m.rotate }],
          }}
        >
          🐾
        </Text>
      ))}
    </View>
  );
}

interface CardProps {
  backgroundId: string;
  text: string;
  /** Si se pasa y el texto no entra, muestra "Ver más" dentro de la altura fija. */
  onSeeMore?: () => void;
  placeholder?: boolean;
}

function PostBackgroundCardInner({ backgroundId, text, onSeeMore, placeholder }: CardProps) {
  const bg = resolvePostBackground(backgroundId);
  const display = text.trim();
  const needsSeeMore = !!onSeeMore && backgroundTextNeedsSeeMore(display);
  const fontSize = backgroundCardFontSize(display.length);
  const maxLines = backgroundCardMaxLines(display.length, needsSeeMore);
  const lineHeight = Math.round(fontSize * 1.32);

  return (
    <View style={styles.card}>
      <BackgroundFill bg={bg} />
      {bg.pattern === 'paws' ? <PawPattern color={bg.textColor} /> : null}
      <View style={styles.textWrap} pointerEvents="none">
        <Text
          style={[
            styles.text,
            {
              color: bg.textColor,
              fontSize,
              lineHeight,
              opacity: placeholder ? 0.72 : 1,
            },
          ]}
          numberOfLines={maxLines}
        >
          {display}
        </Text>
      </View>
      {needsSeeMore ? (
        <Pressable onPress={onSeeMore} hitSlop={8} style={styles.seeMoreBtn}>
          <Text style={[styles.seeMore, { color: bg.textColor }]}>Ver más</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const PostBackgroundCard = memo(PostBackgroundCardInner);

interface TileProps {
  backgroundId: string;
  text: string;
  size: number;
}

function PostBackgroundTileInner({ backgroundId, text, size }: TileProps) {
  const bg = resolvePostBackground(backgroundId);
  const radiusSm = Math.max(6, Math.round(size * 0.08));
  return (
    <View style={{ width: size, height: size, borderRadius: radiusSm, overflow: 'hidden' }}>
      <BackgroundFill bg={bg} />
      {bg.pattern === 'paws' ? <PawPattern color={bg.textColor} /> : null}
      <View style={styles.tilePad}>
        <Text style={[styles.tileText, { color: bg.textColor }]} numberOfLines={4}>
          {text.trim()}
        </Text>
      </View>
    </View>
  );
}

export const PostBackgroundTile = memo(PostBackgroundTileInner);

interface ChipProps {
  backgroundId: string;
  selected: boolean;
  onPress: () => void;
}

function PostBackgroundChipInner({ backgroundId, selected, onPress }: ChipProps) {
  const bg = resolvePostBackground(backgroundId);
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <View style={styles.chipInner}>
        <BackgroundFill bg={bg} />
        {bg.pattern === 'paws' ? <PawPattern color={bg.textColor} /> : null}
      </View>
    </Pressable>
  );
}

export const PostBackgroundChip = memo(PostBackgroundChipInner);

/** Miniatura de grilla: foto, fondo de texto, o texto legado. */
export function PostGridMedia({ post, size }: { post: Post; size: number }) {
  if (post.image) {
    return (
      <Image
        source={{ uri: thumb(post.image, 300) }}
        style={{ width: size, height: size, borderRadius: radius.sm, backgroundColor: colors.border }}
        contentFit="cover"
        transition={250}
      />
    );
  }
  if (isTextBackgroundPost(post) && post.backgroundId) {
    return <PostBackgroundTile backgroundId={post.backgroundId} text={post.caption} size={size} />;
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.sm,
        backgroundColor: colors.primarysoft,
        padding: 8,
        justifyContent: 'center',
      }}
    >
      <Text numberOfLines={4} style={styles.legacyTileText}>
        {post.caption || '📝'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    height: POST_BACKGROUND_CARD_HEIGHT,
    overflow: 'hidden',
    position: 'relative',
  },
  textWrap: {
    ...StyleSheet.absoluteFill,
    paddingHorizontal: 28,
    paddingVertical: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    width: '100%',
    textAlign: 'center',
    fontWeight: '800',
  },
  seeMoreBtn: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 14,
    alignItems: 'center',
  },
  seeMore: {
    fontWeight: '800',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  tilePad: {
    flex: 1,
    padding: 8,
    justifyContent: 'center',
  },
  tileText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  chip: {
    width: 56,
    height: 56,
    borderRadius: 16,
    padding: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chipSelected: {
    borderColor: colors.text,
  },
  chipInner: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  legacyTileText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
});
