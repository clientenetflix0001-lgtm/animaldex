import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { generateNotifications, getUser, formatTime, Notification } from '../lib/data';
import { useNotifications } from '../lib/realtime';
import { ApiNotification, timeAgoMinutes } from '../lib/db';
import { thumb, userFallbackAvatar } from '../lib/images';
import { colors, spacing, radius } from '../lib/theme';
import { RootStackParamList } from '../lib/types';
import { useBreakpoint, CONTENT } from '../lib/responsive';
import { openHumanProfile } from '../lib/publicHandles';
import { useStore } from '../lib/store';
import PushPermissionBanner from '../components/PushPermissionBanner';
import { locationActivityCopy } from '../lib/pushPolicy';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const ICONS: Record<string, { name: keyof typeof Ionicons.glyphMap; bg: string }> = {
  like: { name: 'heart', bg: colors.heart },
  reel_like: { name: 'heart', bg: colors.heart },
  reel_comment: { name: 'chatbubble', bg: colors.primary },
  follow: { name: 'person-add', bg: colors.secondary },
  follow_user: { name: 'person-add', bg: colors.secondary },
  follow_pet: { name: 'paw', bg: colors.secondary },
  comment: { name: 'chatbubble', bg: colors.primary },
  mention: { name: 'at', bg: colors.gold },
  location: { name: 'location', bg: colors.secondary },
  birthday: { name: 'gift', bg: colors.gold },
  pet_transfer_requested: { name: 'swap-horizontal', bg: colors.secondary },
  pet_transfer_accepted: { name: 'checkmark-circle', bg: colors.secondary },
  pet_transfer_rejected: { name: 'close-circle', bg: colors.heart },
};

type Row =
  | { kind: 'real'; item: ApiNotification }
  | { kind: 'demo'; item: Notification }
  | { kind: 'header'; title: string; id: string };

export default function ActivityScreen() {
  const navigation = useNavigation<Nav>();
  const { desktopWeb } = useBreakpoint();
  const { notifications: realNotifs, unread, markSeen, refresh } = useNotifications();
  const { myPets } = useStore();
  const demoNotifications = useMemo(generateNotifications, []);
  const [refreshing, setRefreshing] = useState(false);
  const [seenAtOpen, setSeenAtOpen] = useState(0);

  // Al entrar: recordar qué era "nuevo" para resaltarlo, y marcar visto
  useFocusEffect(
    useCallback(() => {
      setSeenAtOpen((prev) => prev || Date.now() - 1);
      const t = setTimeout(markSeen, 1200);
      return () => clearTimeout(t);
    }, [markSeen])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refresh().finally(() => setRefreshing(false));
  }, [refresh]);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    if (realNotifs.length > 0) {
      out.push({ kind: 'header', title: 'Tu actividad', id: 'h-real' });
      realNotifs.forEach((n) => out.push({ kind: 'real', item: n }));
    }
    out.push({ kind: 'header', title: 'Comunidad', id: 'h-demo' });
    demoNotifications.forEach((n) => out.push({ kind: 'demo', item: n }));
    return out;
  }, [realNotifs, demoNotifications]);

  const realText = (n: ApiNotification): string => {
    switch (n.type) {
      case 'like':
        return 'le dio me gusta a tu publicación';
      case 'reel_like':
        return 'le dio me gusta a tu Reel';
      case 'comment':
        return `comentó: "${n.text ?? ''}"`;
      case 'reel_comment':
        return n.text ? `comentó tu Reel: "${n.text}"` : 'comentó tu Reel';
      case 'follow_user':
        return 'empezó a seguirte';
      case 'follow_pet':
        return `empezó a seguir a ${n.petName ?? 'tu mascota'}`;
      case 'location': {
        const copy = locationActivityCopy(n.petName ?? 'tu mascota', n.actorId ? n.actorName : null);
        return copy.title;
      }
      case 'birthday':
        return n.title || `¡Hoy ${n.petName ?? 'tu mascota'} cumple ${n.years === 1 ? '1 año' : `${n.years ?? ''} años`}!`;
      case 'pet_transfer_requested':
      case 'pet_transfer_accepted':
      case 'pet_transfer_rejected':
        return n.title || n.text || 'Solicitud de transferencia';
      default:
        return 'interactuó contigo';
    }
  };

  const openLocation = (n: ApiNotification) => {
    if (n.lat == null || n.lon == null) return;
    const url = `https://maps.google.com/?q=${n.lat},${n.lon}`;
    Linking.openURL(url).catch(() => {});
  };

  const renderRow = ({ item: row }: { item: Row }) => {
    if (row.kind === 'header') {
      return <Text style={styles.sectionHeader}>{row.title}</Text>;
    }

    if (row.kind === 'real') {
      const n = row.item;
      const icon = ICONS[n.type] ?? ICONS.like;
      const isNew = n.createdAt > seenAtOpen - 1 && seenAtOpen > 0 && n.createdAt > seenAtOpen;
      const isLocation = n.type === 'location';
      const isBirthday = n.type === 'birthday';
      const isTransfer = n.type === 'pet_transfer_requested' || n.type === 'pet_transfer_accepted' || n.type === 'pet_transfer_rejected';
      return (
        <Pressable
          style={[styles.row, isNew && styles.rowNew]}
          onPress={() => {
            if (isTransfer && n.requestId) {
              navigation.navigate('PetTransferRequest', { requestId: n.requestId });
            } else if (isLocation) {
              openLocation(n);
            } else if (isBirthday && (n.petUsername || n.petId)) {
              navigation.navigate('PetProfile', { petId: n.petUsername || n.petId });
            } else if (n.type === 'follow_pet' && n.petId) {
              navigation.navigate('PetProfile', { petId: n.petId });
            } else if (n.reelId) {
              navigation.navigate('ReelViewer', { reelId: n.reelId });
            } else if (n.postId) {
              navigation.navigate('PostDetail', { postId: n.postId });
            } else if (n.actorUsername) {
              openHumanProfile(navigation, { username: n.actorUsername, userId: n.actorId });
            } else if (n.actorId) {
              navigation.navigate('UserProfile', { userId: n.actorId });
            }
          }}
        >
          <View>
            {isBirthday ? (
              <View style={[styles.avatar, styles.birthdayAvatar]}>
                <Text style={styles.birthdayEmoji}>🎂</Text>
              </View>
            ) : isLocation ? (
              <View style={[styles.avatar, styles.locationAvatar]}>
                <Ionicons name="paw" size={20} color={colors.secondary} />
              </View>
            ) : (
              <Image
                source={{ uri: thumb(n.actorAvatar ?? userFallbackAvatar(n.actorUsername), 100) }}
                style={styles.avatar}
                transition={200}
              />
            )}
            <View style={[styles.badge, { backgroundColor: icon.bg }]}>
              <Ionicons name={icon.name} size={10} color="#fff" />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.text}>
              {isBirthday || isLocation || isTransfer ? (
                realText(n)
              ) : (
                <>
                  <Text style={styles.bold}>{n.actorName}</Text> {realText(n)}
                </>
              )}
            </Text>
            <Text style={styles.time}>{formatTime(timeAgoMinutes(n.createdAt))}</Text>
            {isBirthday && !!n.text && <Text style={styles.birthdayHint}>{n.text}</Text>}
            {isTransfer && !!n.text && <Text style={styles.birthdayHint}>{n.text}</Text>}
            {isLocation && (
              <Text style={styles.locationLink}>
                {locationActivityCopy(n.petName ?? 'tu mascota', n.actorId ? n.actorName : null).subtitle}
              </Text>
            )}
          </View>
          {n.postImage && (
            <Image source={{ uri: thumb(n.postImage, 100) }} style={styles.thumb} transition={200} />
          )}
          {isNew && <View style={styles.newDot} />}
        </Pressable>
      );
    }

    const item = row.item;
    const user = getUser(item.userId);
    const icon = ICONS[item.type] ?? ICONS.like;
    return (
      <Pressable
        style={styles.row}
        onPress={() => navigation.navigate('UserProfile', { userId: user.id })}
      >
        <View>
          <Image source={{ uri: user.avatar }} style={styles.avatar} transition={200} />
          <View style={[styles.badge, { backgroundColor: icon.bg }]}>
            <Ionicons name={icon.name} size={10} color="#fff" />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.text}>
            <Text style={styles.bold}>{user.name}</Text> {item.text}
          </Text>
          <Text style={styles.time}>{formatTime(item.minutesAgo)}</Text>
        </View>
        {item.image && (
          <Image source={{ uri: thumb(item.image, 100) }} style={styles.thumb} transition={200} />
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={desktopWeb ? styles.desktopWrap : styles.mobileWrap}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Actividad</Text>
          {unread > 0 && (
            <View style={styles.unreadPill}>
              <Text style={styles.unreadText}>{unread} nueva{unread > 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>
        <PushPermissionBanner hasPets={myPets.length > 0} />
        <FlatList
          data={rows}
          keyExtractor={(r) => (r.kind === 'header' ? r.id : r.kind === 'real' ? `r-${r.item.id}` : `d-${r.item.id}`)}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
          }
          renderItem={renderRow}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  mobileWrap: { flex: 1 },
  desktopWrap: {
    flex: 1,
    width: '100%',
    maxWidth: CONTENT.narrow,
    alignSelf: 'center',
    paddingTop: spacing.xl,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  unreadPill: {
    backgroundColor: colors.heart,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowNew: { backgroundColor: colors.primarysoft },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.border },
  locationAvatar: {
    backgroundColor: colors.secondarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  birthdayAvatar: {
    backgroundColor: '#FFF4CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  birthdayEmoji: { fontSize: 22 },
  birthdayHint: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  badge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  text: { fontSize: 14, color: colors.text, lineHeight: 19 },
  bold: { fontWeight: '700' },
  time: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  locationLink: { fontSize: 12, color: colors.secondary, fontWeight: '700', marginTop: 3 },
  thumb: { width: 46, height: 46, borderRadius: radius.sm, backgroundColor: colors.border },
  newDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
});
