// Celda del muro. La foto llena un cuadro 1:1. El detalle muestra el original.
import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '../AppIcon';
import { ApiAlert } from '../../lib/db';
import { shareAlert } from '../../lib/share';
import { convertImage, thumb, userFallbackAvatar } from '../../lib/images';
import { formatCount } from '../../lib/data';
import { useAppTheme, type ThemeColors } from '../../lib/theme';
import {
  beginAdoptionFlight,
  estimatedDetailFrame,
  flyAdoptionImage,
  prefersReducedMotion,
  rememberAdoptionThumb,
  type FlightRect,
} from './adoptionImageFlight';

interface Props {
  alert: ApiAlert;
  onToggleLike: (alertId: string) => void;
  onOpen: (alert: ApiAlert) => void;
  shareUrl: string;
}

function gridTitle(alert: ApiAlert): string {
  const text = String(alert.description || '').replace(/\s+/g, ' ').trim();
  if (text) return text;
  const name = String(alert.petName || '').trim();
  if (name) return name;
  return 'Mascota en adopción';
}

function AdoptionGridCardInner({ alert, onToggleLike, onOpen, shareUrl }: Props) {
  const { colors, scheme } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, scheme === 'dark'), [colors, scheme]);
  const imageRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const avatar = alert.userAvatar ?? userFallbackAvatar(alert.username ?? 'usuario');
  const photo = convertImage(alert.image, 720, 74, 'cover');
  const title = gridTitle(alert);

  const share = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await shareAlert(alert, shareUrl);
    } finally {
      setSharing(false);
    }
  }, [alert, shareUrl, sharing]);

  const open = useCallback(() => {
    const go = (rect?: FlightRect) => {
      if (rect) {
        rememberAdoptionThumb(alert.id, rect);
        if (!prefersReducedMotion() && typeof window !== 'undefined') {
          beginAdoptionFlight(280);
          void flyAdoptionImage({
            uri: photo,
            from: rect,
            to: estimatedDetailFrame(),
            fit: 'cover',
            duration: 260,
          });
        }
      }
      onOpen(alert);
    };
    const node = imageRef.current;
    if (!node) {
      go();
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      if (width > 8 && height > 8) go({ x, y, width, height });
      else go();
    });
  }, [alert, onOpen, photo]);

  return (
    <View style={styles.cell}>
      <Pressable onPress={open} accessibilityRole="link" accessibilityLabel="Abrir publicación">
        <View ref={imageRef} collapsable={false}>
          <Image
            source={{ uri: photo }}
            style={styles.photo}
            contentFit="cover"
            recyclingKey={alert.id}
            transition={80}
            accessibilityLabel={alert.petName || 'Mascota en adopción'}
          />
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
      </Pressable>
      <View style={styles.meta}>
        <Pressable style={styles.author} onPress={open} accessibilityRole="link">
          <Image source={{ uri: thumb(avatar, 64) }} style={styles.avatar} />
          <Text style={styles.name} numberOfLines={1}>
            {alert.username || 'usuario'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onToggleLike(alert.id)}
          style={styles.iconBtn}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Me gusta"
        >
          <Ionicons
            name={alert.isLiked ? 'heart' : 'heart-outline'}
            size={16}
            color={alert.isLiked ? colors.heart : colors.textMuted}
          />
          <Text style={styles.count}>{formatCount(alert.likeCount)}</Text>
        </Pressable>
        <Pressable
          onPress={open}
          style={styles.iconBtn}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Comentarios"
        >
          <Ionicons name="chatbubble-outline" size={15} color={colors.textMuted} />
          <Text style={styles.count}>{formatCount(alert.commentCount)}</Text>
        </Pressable>
        <Pressable
          onPress={share}
          disabled={sharing}
          style={styles.iconBtn}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Difundir"
        >
          <Ionicons name="arrow-redo-outline" size={15} color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

export const AdoptionGridCard = memo(AdoptionGridCardInner);

function makeStyles(colors: ThemeColors, dark: boolean) {
  const page = dark ? colors.bg : '#FFFFFF';
  return StyleSheet.create({
    cell: { flex: 1, backgroundColor: page, minWidth: 0 },
    photo: { width: '100%', aspectRatio: 1, backgroundColor: dark ? colors.surface : '#F2F2F2' },
    title: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 14,
      lineHeight: 18,
      paddingHorizontal: 6,
      paddingTop: 6,
    },
    meta: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 4,
      paddingBottom: 8,
      paddingTop: 2,
      gap: 2,
    },
    author: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0, minHeight: 32 },
    avatar: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.border },
    name: { flex: 1, fontSize: 13, fontWeight: '400', color: colors.textMuted },
    iconBtn: {
      minWidth: 28,
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      paddingHorizontal: 2,
    },
    count: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
  });
}
