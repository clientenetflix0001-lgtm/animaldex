import React, { useState, useCallback, memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { Post, formatCount, formatTime } from '../lib/data';
import { getPostDisplay } from '../lib/postDisplay';
import { sharePost } from '../lib/share';
import { thumb, large } from '../lib/images';
import { useStore } from '../lib/store';
import { colors, radius, shadow, spacing } from '../lib/theme';

interface Props {
  post: Post;
  onOpenPet: (petId: string) => void;
  onOpenPost: (post: Post) => void;
}

function PostCardInner({ post, onOpenPet, onOpenPost }: Props) {
  const { likedPosts, savedPosts, toggleLike, toggleSave, myComments } = useStore();
  const liked = likedPosts.includes(post.id);
  const saved = savedPosts.includes(post.id);
  const disp = getPostDisplay(post);

  const heartScale = useSharedValue(1);
  const bigHeart = useSharedValue(0);
  const [lastTap, setLastTap] = useState(0);

  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));
  const bigHeartStyle = useAnimatedStyle(() => ({
    opacity: bigHeart.value,
    transform: [{ scale: 0.6 + bigHeart.value * 0.6 }],
  }));

  const animateLike = useCallback(() => {
    heartScale.value = withSequence(withSpring(1.4, { damping: 5 }), withSpring(1));
  }, [heartScale]);

  const handleLikePress = useCallback(() => {
    if (!liked) animateLike();
    toggleLike(post.id);
  }, [liked, post.id, toggleLike, animateLike]);

  const handleImageTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap < 280) {
      if (!liked) {
        toggleLike(post.id);
        animateLike();
      }
      bigHeart.value = withSequence(
        withSpring(1, { damping: 12 }),
        withDelay(350, withTiming(0, { duration: 250 }))
      );
    }
    setLastTap(now);
  }, [lastTap, liked, post.id, toggleLike, animateLike, bigHeart]);

  const totalComments =
    (post.commentCount ?? post.comments.length) + (myComments[post.id]?.length ?? 0);
  const likeCount = post.real ? post.likes + (liked ? 1 : 0) : post.likes + (liked ? 1 : 0);

  return (
    <View style={styles.card}>
      {/* Header */}
      <Pressable style={styles.header} onPress={() => onOpenPet(post.petId)}>
        <Image source={{ uri: thumb(disp.avatarUri, 100) }} style={styles.avatar} transition={200} />
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.petName}>{disp.petName}</Text>
            <Text style={styles.petEmoji}> {disp.petEmoji}</Text>
          </View>
          <Text style={styles.subText}>
            {disp.speciesLabel} · de @{disp.username}
          </Text>
        </View>
        <Text style={styles.time}>{formatTime(post.minutesAgo)}</Text>
      </Pressable>

      {/* Image */}
      <Pressable onPress={handleImageTap}>
        <View style={styles.imageWrap}>
          <Image
            source={{ uri: large(post.image) }}
            style={styles.image}
            contentFit="cover"
            transition={300}
            placeholder={{ blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj' }}
          />
          <Animated.View style={[styles.bigHeart, bigHeartStyle]} pointerEvents="none">
            <Ionicons name="heart" size={96} color="#fff" />
          </Animated.View>
        </View>
      </Pressable>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable onPress={handleLikePress} hitSlop={8} style={styles.actionBtn}>
          <Animated.View style={heartStyle}>
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={27}
              color={liked ? colors.heart : colors.text}
            />
          </Animated.View>
        </Pressable>
        <Pressable onPress={() => onOpenPost(post)} hitSlop={8} style={styles.actionBtn}>
          <Ionicons name="chatbubble-outline" size={24} color={colors.text} />
        </Pressable>
        <Pressable hitSlop={8} style={styles.actionBtn} onPress={() => sharePost(post)}>
          <Ionicons name="paper-plane-outline" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => toggleSave(post.id)} hitSlop={8}>
          <Ionicons
            name={saved ? 'bookmark' : 'bookmark-outline'}
            size={24}
            color={saved ? colors.gold : colors.text}
          />
        </Pressable>
      </View>

      {/* Meta */}
      <View style={styles.meta}>
        <Text style={styles.likes}>{formatCount(likeCount)} me gusta</Text>
        <Text style={styles.caption}>
          <Text style={styles.captionName}>{disp.petName} </Text>
          {post.caption}
        </Text>
        {totalComments > 0 && (
          <Pressable onPress={() => onOpenPost(post)}>
            <Text style={styles.viewComments}>
              Ver {totalComments === 1 ? '1 comentario' : `los ${totalComments} comentarios`}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export const PostCard = memo(PostCardInner);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    overflow: 'hidden',
    ...shadow.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: colors.primarysoft,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  petName: { fontWeight: '700', fontSize: 15, color: colors.text },
  petEmoji: { fontSize: 13 },
  subText: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  time: { fontSize: 11, color: colors.textMuted },
  imageWrap: { position: 'relative' },
  image: { width: '100%', aspectRatio: 1, backgroundColor: colors.border },
  bigHeart: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.lg,
  },
  actionBtn: {},
  meta: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm },
  likes: { fontWeight: '700', fontSize: 14, color: colors.text, marginBottom: 4 },
  caption: { fontSize: 14, color: colors.text, lineHeight: 20 },
  captionName: { fontWeight: '700' },
  viewComments: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
});
