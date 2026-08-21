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
import { PostBackgroundCard } from './PostBackgroundCard';
import { isTextBackgroundPost } from '../lib/postBackgrounds';
import { useNavigation } from '@react-navigation/native';
import { colors, radius, shadow, spacing } from '../lib/theme';
import ProfileBadge from '../features/profiles/ProfileBadge';
import { openHumanProfile } from '../lib/publicHandles';

interface Props {
  post: Post;
  /**
   * El estado social llega por props (patrón de AlertCard) en lugar de
   * leerse del store dentro de la tarjeta. Así un like solo re-renderiza
   * su propia publicación y no todas las montadas.
   */
  liked: boolean;
  saved: boolean;
  /** Comentarios propios aún no confirmados por el servidor. */
  extraComments: number;
  onToggleLike: (postId: string) => void;
  onToggleSave: (postId: string) => void;
  onOpenPet: (petId: string) => void;
  onOpenPost: (post: Post) => void;
}

function PostCardInner({
  post,
  liked,
  saved,
  extraComments,
  onToggleLike,
  onToggleSave,
  onOpenPet,
  onOpenPost,
}: Props) {
  const navigation = useNavigation<any>();
  const disp = getPostDisplay(post);
  const hasPet = !!(post.petId && post.petName);
  const orgType = post.authorProfileType === 'business' || post.authorProfileType === 'protector';
  const asProfile = orgType || (!hasPet && !!post.authorProfileId);
  const profileHandle = post.authorProfileUsername || disp.username;
  const profileAvatar = post.authorProfileAvatar || userFallbackAvatar(profileHandle || 'usuario');

  const heartScale = useSharedValue(1);
  const bigHeart = useSharedValue(0);
  const [lastBgTap, setLastBgTap] = useState(0);
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
    onToggleLike(post.id);
  }, [liked, post.id, onToggleLike, animateLike]);

  const handleImageDoubleTap = useCallback(() => {
    if (!liked) {
      onToggleLike(post.id);
      animateLike();
    }
    bigHeart.value = withSequence(
      withSpring(1, { damping: 12 }),
      withDelay(350, withTiming(0, { duration: 250 }))
    );
  }, [liked, post.id, onToggleLike, animateLike, bigHeart]);

  const handleBackgroundTap = useCallback(() => {
    const now = Date.now();
    if (now - lastBgTap < 280) handleImageDoubleTap();
    setLastBgTap(now);
  }, [lastBgTap, handleImageDoubleTap]);

  const totalComments = (post.commentCount ?? post.comments.length) + extraComments;
  const likeCount = post.real ? post.likes + (liked ? 1 : 0) : post.likes + (liked ? 1 : 0);

  return (
    <View style={styles.card}>
      {/* Header */}
      <Pressable
        style={styles.header}
        onPress={() => {
          if (orgType && profileHandle) openHumanProfile(navigation, { username: profileHandle });
          else if (hasPet) onOpenPet(disp.petUsername || post.petId);
          else openHumanProfile(navigation, { username: profileHandle, userId: post.authorUserId });
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
        <View style={styles.imageWrap}>
          <AdaptivePostImage
            uri={post.image}
            imageWidth={post.imageWidth}
            imageHeight={post.imageHeight}
            containerHeight={350}
            onDoubleTap={handleImageDoubleTap}
          />
          <Animated.View style={[styles.bigHeart, bigHeartStyle]} pointerEvents="none">
            <Ionicons name="heart" size={96} color="#fff" />
          </Animated.View>
        </View>
      )}

      {/* Texto + fondo prediseñado (posts nuevos sin foto) */}
      {isTextBackgroundPost(post) && post.backgroundId && (
        <Pressable onPress={handleBackgroundTap}>
          <View style={styles.imageWrap}>
            <PostBackgroundCard
              backgroundId={post.backgroundId}
              text={post.caption}
              onSeeMore={() => onOpenPost(post)}
            />
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
        <Pressable onPress={() => onToggleSave(post.id)} hitSlop={8}>
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
        {!isTextBackgroundPost(post) && (
          <Text style={styles.caption}>{post.caption}</Text>
        )}
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
    width: '100%',
    marginBottom: spacing.xl,
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
