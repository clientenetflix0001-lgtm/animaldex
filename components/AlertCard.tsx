import React, { memo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { ApiAlert, timeAgoMinutes } from '../lib/db';
import { ALERT_TYPES, speciesEmoji, speciesLabel } from '../lib/alerts';
import { shareAlert } from '../lib/share';
import { thumb, large, userFallbackAvatar } from '../lib/images';
import { formatCount, formatTime } from '../lib/data';
import { colors, radius, shadow, spacing } from '../lib/theme';

interface Props {
  alert: ApiAlert;
  onToggleLike: (alertId: string) => void;
  onOpenComments: (alert: ApiAlert) => void;
}

function AlertCardInner({ alert, onToggleLike, onOpenComments }: Props) {
  const typeConfig = ALERT_TYPES[alert.type] ?? ALERT_TYPES.lost;
  const heartScale = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));

  const handleLike = useCallback(() => {
    if (!alert.isLiked) {
      heartScale.value = withSequence(withSpring(1.35, { damping: 5 }), withSpring(1));
    }
    onToggleLike(alert.id);
  }, [alert.id, alert.isLiked, onToggleLike, heartScale]);

  const [sharing, setSharing] = useState(false);
  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await shareAlert(alert);
    } finally {
      setSharing(false);
    }
  }, [alert, sharing]);

  const avatar = alert.userAvatar ?? userFallbackAvatar(alert.username ?? 'usuario');
  const minutesAgo = timeAgoMinutes(alert.createdAt);

  return (
    <View style={styles.card}>
      {/* Badge de tipo de alerta */}
      <View style={[styles.badgeRow, { backgroundColor: `${typeConfig.color}14` }]}>
        <Text style={[styles.badgeText, { color: typeConfig.color }]}>
          {typeConfig.emoji} {speciesLabel(alert.species).toUpperCase()} {typeConfig.label}
        </Text>
      </View>

      {/* Header: usuario + mascota + localidad + tiempo */}
      <View style={styles.header}>
        <Image source={{ uri: thumb(avatar, 100) }} style={styles.avatar} transition={200} />
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.petName}>
              {alert.petName ? alert.petName : speciesLabel(alert.species)} {speciesEmoji(alert.species)}
            </Text>
          </View>
          <View style={styles.locRow}>
            <Ionicons name="location" size={12} color={colors.textMuted} />
            <Text style={styles.locText} numberOfLines={1}>
              {alert.locality}
            </Text>
          </View>
        </View>
        <Text style={styles.time}>{formatTime(minutesAgo)}</Text>
      </View>

      {/* Foto */}
      <Image
        source={{ uri: large(alert.image) }}
        style={styles.image}
        contentFit="cover"
        transition={300}
        placeholder={{ blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj' }}
      />

      {/* Acciones */}
      <View style={styles.actions}>
        <Pressable onPress={handleLike} hitSlop={8} style={styles.actionBtn}>
          <Animated.View style={heartStyle}>
            <Ionicons
              name={alert.isLiked ? 'heart' : 'heart-outline'}
              size={26}
              color={alert.isLiked ? colors.heart : colors.text}
            />
          </Animated.View>
          <Text style={styles.actionCount}>{formatCount(alert.likeCount)}</Text>
        </Pressable>

        <Pressable onPress={() => onOpenComments(alert)} hitSlop={8} style={styles.actionBtn}>
          <Ionicons name="chatbubble-outline" size={23} color={colors.text} />
          <Text style={styles.actionCount}>{formatCount(alert.commentCount)}</Text>
        </Pressable>

        <View style={{ flex: 1 }} />

        <Pressable onPress={handleShare} disabled={sharing} style={styles.difundirBtn}>
          <Ionicons name="paw" size={15} color="#fff" />
          <Text style={styles.difundirText}>DIFUNDIR</Text>
        </Pressable>
      </View>

      {/* Descripción */}
      {alert.description ? (
        <Text style={styles.description}>{alert.description}</Text>
      ) : null}

      {alert.userName && (
        <Text style={styles.postedBy}>Publicado por @{alert.username}</Text>
      )}
    </View>
  );
}

export const AlertCard = memo(AlertCardInner);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    overflow: 'hidden',
    ...shadow.card,
  },
  badgeRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  badgeText: { fontWeight: '800', fontSize: 12, letterSpacing: 0.3 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.border,
    borderWidth: 2,
    borderColor: colors.primarysoft,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  petName: { fontWeight: '700', fontSize: 15, color: colors.text },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  locText: { fontSize: 12, color: colors.textMuted, flexShrink: 1 },
  time: { fontSize: 11, color: colors.textMuted },
  image: { width: '100%', aspectRatio: 1, backgroundColor: colors.border },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.lg,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionCount: { fontSize: 13, fontWeight: '700', color: colors.text },
  difundirBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  difundirText: { color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 0.3 },
  description: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  postedBy: {
    fontSize: 11,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
});
