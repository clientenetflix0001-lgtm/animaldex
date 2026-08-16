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
import { thumb, userFallbackAvatar } from '../lib/images';
import { AdaptivePostImage } from './AdaptivePostImage';
import { useNavigation } from '@react-navigation/native';
import { useStore } from '../lib/store';
import { colors, radius, shadow, spacing } from '../lib/theme';
import ProfileBadge from '../features/profiles/ProfileBadge';

interface Props {
  post: Post;
  onOpenPet: (petId: string) => void;
  onOpenPost: (post: Post) => void;
}

function PostCardInner({ post, onOpenPet, onOpenPost }: Props) {
  const navigation = useNavigation<any>();
  const { likedPosts, savedPosts, toggleLike, toggleSave, myComments } = useStore();
  const liked = likedPosts.includes(post.id);
  const saved = savedPosts.includes(post.id);
  const disp = getPostDisplay(post);
  const hasPet = !!(post.petId && post.petName);
  const orgType = post.authorProfileType === 'business' || post.authorProfileType === 'protector';
  const asProfile = orgType || (!hasPet && !!post.authorProfileId);
  const profileHandle = post.authorProfileUsername || disp.username;
  const profileAvatar = post.authorProfileAvatar || userFallbackAvatar(profileHandle || 'usuario');

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
      <Pressable
        style={styles.header}
        onPress={() => {
          if (orgType && profileHandle) navigation.navigate('PublicProfile', { username: profileHandle });
          else if (hasPet) onOpenPet(disp.petUsername || post.petId);
          else if (post.authorUserId) navigation.navigate('UserProfile', { userId: post.authorUserId });
        }}
      >
        <Image
          source={{ uri: thumb(asProfile ? profileAvatar : disp.avatarUri, 100) }}
          style={styles.avatar}
          transition={200}
        />
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.petName}>
              {asProfile
                ? `@${profileHandle}`
                : `@${disp.petUsername || disp.petName.toLowerCase()}${disp.petEmoji}`}
            </Text>
          </View>
          {asProfile ? (
            orgType ? <ProfileBadge type={post.authorProfileType} /> : null
          ) : (
            <Text style={styles.subText}>
              {(disp.speciesLabel || 'mascota').toLowerCase()} de (@{disp.username})
            </Text>
          )}
        </View>
        <Text style={styles.time}>{formatTime(post.minutesAgo)}</Text>
      </Pressable>

      {/* Image (solo si hay foto) */}
      {!!post.image && (
        <Pressable onPress={handleImageTap}>
          <View style={styles.imageWrap}>
            <AdaptivePostImage uri={post.image} />
            <Animated.View style={[styles.bigHeart, bigHeartStyle]} pointerEvents="none">
              <Ionicons name="heart" size={96} color="#fff" />
            </Animated.View>
          </View>
        </Pressable>
      )}

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
        <Text style={styles.caption}>{post.caption}</Text>
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
  petName: { fontWeight: '800', fontSize: 16, color: colors.text },
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
