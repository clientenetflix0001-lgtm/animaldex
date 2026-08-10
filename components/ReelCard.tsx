import React, { memo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Platform } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import ReelPlayer from './ReelPlayer';
import { ApiReel } from '../lib/db';
import { tiktokEmbedUrl } from '../lib/tiktok';
import { thumb, userFallbackAvatar } from '../lib/images';
import { formatCount } from '../lib/data';
import { colors, radius, spacing } from '../lib/theme';

interface Props {
  reel: ApiReel;
  height: number;
  isActive: boolean;
  shouldMount: boolean;
  isOwn: boolean;
  onToggleLike: (reelId: string) => void;
  onOpenComments: (reel: ApiReel) => void;
  onShare: (reel: ApiReel) => void;
  onReport: (reel: ApiReel) => void;
  onDelete: (reel: ApiReel) => void;
}

function ReelCardInner({
  reel,
  height,
  isActive,
  shouldMount,
  isOwn,
  onToggleLike,
  onOpenComments,
  onShare,
  onReport,
  onDelete,
}: Props) {
  const heartScale = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));
  const [videoReady, setVideoReady] = useState(false);

  const handleLike = useCallback(() => {
    if (!reel.isLiked) {
      heartScale.value = withSequence(withSpring(1.35, { damping: 5 }), withSpring(1));
    }
    onToggleLike(reel.id);
  }, [reel.id, reel.isLiked, onToggleLike, heartScale]);

  const openMenu = useCallback(() => {
    const options: { text: string; onPress?: () => void; style?: 'destructive' | 'cancel' }[] = [];
    if (isOwn) {
      options.push({ text: 'Eliminar mi Reel', style: 'destructive', onPress: () => onDelete(reel) });
    } else {
      options.push({ text: 'Denunciar', style: 'destructive', onPress: () => onReport(reel) });
    }
    options.push({ text: 'Cancelar', style: 'cancel' });

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const label = isOwn ? '¿Eliminar este Reel?' : '¿Denunciar este Reel?';
      if (window.confirm(label)) {
        if (isOwn) onDelete(reel);
        else onReport(reel);
      }
    } else {
      Alert.alert(isOwn ? 'Tu Reel' : 'Reel de TikTok', undefined, options as any);
    }
  }, [isOwn, onDelete, onReport, reel]);

  const embedUrl = reel.tiktokVideoId ? tiktokEmbedUrl(reel.tiktokVideoId) : null;
  const avatar = reel.userAvatar ?? userFallbackAvatar(reel.username ?? 'usuario');

  return (
    <View style={[styles.card, { height }]}>
      {/* Video o placeholder liviano (solo se monta el reproductor real
          para el reel activo y el siguiente, para no saturar memoria/red) */}
      {shouldMount && embedUrl ? (
        <ReelPlayer embedUrl={embedUrl} onReady={() => setVideoReady(true)} />
      ) : (
        <View style={styles.placeholder}>
          {reel.thumbnailUrl ? (
            <Image source={{ uri: thumb(reel.thumbnailUrl, 700) }} style={styles.thumbFill} contentFit="cover" />
          ) : null}
          <View style={styles.placeholderDim} />
          <View style={styles.playIconWrap}>
            <Ionicons name="play" size={30} color="#fff" />
          </View>
        </View>
      )}

      {/* Overlay inferior: creador + descripción */}
      <View style={styles.bottomOverlay} pointerEvents="box-none">
        <View style={styles.creatorRow}>
          <Image source={{ uri: thumb(avatar, 100) }} style={styles.avatar} />
          <Text style={styles.creatorName} numberOfLines={1}>
            {reel.creatorUsername ? `@${reel.creatorUsername}` : reel.username ? `@${reel.username}` : 'TikTok'}
          </Text>
        </View>
        {reel.title ? (
          <Text style={styles.description} numberOfLines={2}>
            {reel.title}
          </Text>
        ) : null}
        <Text style={styles.addedBy}>Compartido por @{reel.username ?? 'usuario'} en Animaldex</Text>
      </View>

      {/* Columna de acciones (derecha, estilo Reels) */}
      <View style={styles.actionsCol} pointerEvents="box-none">
        <Pressable onPress={handleLike} hitSlop={10} style={styles.actionItem}>
          <Animated.View style={heartStyle}>
            <Ionicons
              name={reel.isLiked ? 'heart' : 'heart-outline'}
              size={32}
              color={reel.isLiked ? colors.heart : '#fff'}
            />
          </Animated.View>
          <Text style={styles.actionCount}>{formatCount(reel.likeCount)}</Text>
        </Pressable>

        <Pressable onPress={() => onOpenComments(reel)} hitSlop={10} style={styles.actionItem}>
          <Ionicons name="chatbubble-ellipses" size={29} color="#fff" />
          <Text style={styles.actionCount}>{formatCount(reel.commentCount)}</Text>
        </Pressable>

        <Pressable onPress={() => onShare(reel)} hitSlop={10} style={styles.actionItem}>
          <Ionicons name="arrow-redo" size={29} color="#fff" />
          <Text style={styles.actionCount}>Difundir</Text>
        </Pressable>

        <Pressable onPress={openMenu} hitSlop={10} style={styles.actionItem}>
          <Ionicons name="ellipsis-horizontal" size={26} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

export const ReelCard = memo(ReelCardInner);

const styles = StyleSheet.create({
  card: { width: '100%', backgroundColor: '#000', position: 'relative', overflow: 'hidden' },
  placeholder: { flex: 1, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  thumbFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  placeholderDim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  playIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 76,
    bottom: 24,
    paddingHorizontal: spacing.lg,
    gap: 6,
  },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.border, borderWidth: 1.5, borderColor: '#fff' },
  creatorName: { color: '#fff', fontWeight: '800', fontSize: 14, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3 },
  description: { color: '#fff', fontSize: 13, lineHeight: 18, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3 },
  addedBy: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  actionsCol: {
    position: 'absolute',
    right: spacing.md,
    bottom: 24,
    alignItems: 'center',
    gap: spacing.lg,
  },
  actionItem: { alignItems: 'center', gap: 3 },
  actionCount: { color: '#fff', fontSize: 11, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3 },
});
