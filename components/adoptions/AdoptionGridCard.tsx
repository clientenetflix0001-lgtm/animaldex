// Celda del muro. No reemplaza a AlertCard: Alertas sigue igual.
// La ficha es compacta; el detalle completo se abre al tocarla.
import React, { memo, useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '../AppIcon';
import { ApiAlert, timeAgoMinutes } from '../../lib/db';
import { shareAlert } from '../../lib/share';
import { convertImage, thumb, userFallbackAvatar } from '../../lib/images';
import { formatCount, formatTime } from '../../lib/data';
import { useAppTheme, type ThemeColors, radius, spacing } from '../../lib/theme';
import { adoptCtaLabel } from '../../lib/adoptionContact';

interface Props {
  alert: ApiAlert;
  onToggleLike: (alertId: string) => void;
  onOpen: (alert: ApiAlert) => void;
  onAdopt: (alert: ApiAlert) => void;
  shareUrl: string;
}

const PREVIEW_CHARS = 72;

function AdoptionGridCardInner({ alert, onToggleLike, onOpen, onAdopt, shareUrl }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [sharing, setSharing] = useState(false);
  const avatar = alert.userAvatar ?? userFallbackAvatar(alert.username ?? 'usuario');
  const description = (alert.description || '').trim();
  const truncated = description.length > PREVIEW_CHARS || description.includes('\n');
  const preview = description.replace(/\s+/g, ' ').trim();
  const photo = convertImage(alert.image, 640, 72, 'contain');

  const share = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await shareAlert(alert, shareUrl);
    } finally {
      setSharing(false);
    }
  }, [alert, shareUrl, sharing]);

  return (
    <View style={styles.card}>
      <Pressable onPress={() => onOpen(alert)} accessibilityRole="link" accessibilityLabel="Abrir publicación">
        <Image
          source={{ uri: photo }}
          style={styles.photo}
          contentFit="contain"
          recyclingKey={alert.id}
          transition={120}
          accessibilityLabel={alert.petName || 'Mascota en adopción'}
        />
        <View style={styles.meta}>
          <Image source={{ uri: thumb(avatar, 64) }} style={styles.avatar} />
          <View style={styles.metaText}>
            <Text style={styles.author} numberOfLines={1}>
              {alert.username || 'usuario'}
            </Text>
            <Text style={styles.time} numberOfLines={1}>
              {formatTime(timeAgoMinutes(alert.createdAt))}
            </Text>
          </View>
        </View>
        <View style={styles.locRow}>
          <Ionicons name="location" size={11} color={colors.textMuted} />
          <Text style={styles.loc} numberOfLines={1}>
            {alert.locality}
          </Text>
        </View>
        {preview ? (
          <Text style={styles.body} numberOfLines={2}>
            {preview}
          </Text>
        ) : null}
        {truncated ? <Text style={styles.more}>Ver más</Text> : null}
      </Pressable>
      <View style={styles.actions}>
        <Pressable
          onPress={() => onToggleLike(alert.id)}
          style={styles.iconBtn}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Me gusta"
        >
          <Ionicons
            name={alert.isLiked ? 'heart' : 'heart-outline'}
            size={20}
            color={alert.isLiked ? colors.heart : colors.text}
          />
          <Text style={styles.count}>{formatCount(alert.likeCount)}</Text>
        </Pressable>
        <Pressable
          onPress={() => onOpen(alert)}
          style={styles.iconBtn}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Comentarios"
        >
          <Ionicons name="chatbubble-outline" size={18} color={colors.text} />
          <Text style={styles.count}>{formatCount(alert.commentCount)}</Text>
        </Pressable>
        <Pressable
          onPress={share}
          disabled={sharing}
          style={styles.iconBtn}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Difundir"
        >
          <Ionicons name="arrow-redo-outline" size={18} color={colors.text} />
        </Pressable>
      </View>
      <Pressable
        style={styles.adopt}
        onPress={() => onAdopt(alert)}
        accessibilityRole="button"
        accessibilityLabel={adoptCtaLabel(alert.sex)}
      >
        <Text style={styles.adoptText} numberOfLines={2}>
          {adoptCtaLabel(alert.sex)}
        </Text>
      </Pressable>
    </View>
  );
}

export const AdoptionGridCard = memo(AdoptionGridCardInner);

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    photo: {
      width: '100%',
      aspectRatio: 1,
      backgroundColor: colors.surface,
    },
    meta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.sm,
    },
    avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.border },
    metaText: { flex: 1, minWidth: 0 },
    author: { fontSize: 12.5, fontWeight: '800', color: colors.text },
    time: { fontSize: 11, color: colors.textMuted },
    locRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: spacing.sm,
      marginTop: 4,
    },
    loc: { flex: 1, fontSize: 11, color: colors.textMuted },
    body: {
      fontSize: 12.5,
      lineHeight: 17,
      color: colors.text,
      paddingHorizontal: spacing.sm,
      paddingTop: 4,
    },
    more: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.primary,
      paddingHorizontal: spacing.sm,
      paddingTop: 2,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 4,
      paddingTop: 4,
    },
    iconBtn: {
      minWidth: 40,
      minHeight: 40,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      paddingHorizontal: 4,
    },
    count: { fontSize: 12, fontWeight: '700', color: colors.text },
    adopt: {
      marginHorizontal: spacing.sm,
      marginBottom: spacing.sm,
      marginTop: 2,
      minHeight: 40,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    adoptText: { color: '#fff', fontWeight: '800', fontSize: 12.5, textAlign: 'center' },
  });
}
