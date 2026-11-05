// ============================================================
// Animaldex Adopciones — muro público por localidad (solo web).
// /adopciones/:city · reutiliza AlertCard y alertas type='adoption'.
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { db, type ApiAlert } from '../../lib/db';
import { useStore } from '../../lib/store';
import { useGuestAccess } from '../../lib/guestAccess';
import { useAppTheme, type ThemeColors, radius, spacing } from '../../lib/theme';
import { RootStackParamList } from '../../lib/types';
import { adoptionLocalityBySlug, DEFAULT_ADOPTION_SLUG } from '../../lib/adoptionLocalities';
import { AlertCard } from '../../components/AlertCard';
import { adoptionPostShareUrl, useAdoptionPostActions } from '../../components/adoptions/useAdoptionPostActions';

type Rt = RouteProp<RootStackParamList, 'AdoptionsWall'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const LOGO = require('../../assets/images/animaldex-logo-mark.png');
const PAGE = 12;
export const ADOPTIONS_MAX_WIDTH = 640;

export default function AdoptionsWallScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const route = useRoute<Rt>();
  const navigation = useNavigation<Nav>();
  const { user } = useStore();
  const { guest, requireLogin, inviteBar } = useGuestAccess({ treatAsExternal: false });
  const place = adoptionLocalityBySlug(route.params?.city) || adoptionLocalityBySlug(DEFAULT_ADOPTION_SLUG)!;
  const city = place.slug;
  const { adopt, overlays } = useAdoptionPostActions();

  const [alerts, setAlerts] = useState<ApiAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const loadingRef = useRef(false);

  const load = useCallback(
    async (before?: number) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      if (before) setLoadingMore(true);
      try {
        const res = await db.adoptionWall(city, before, PAGE);
        setAlerts((prev) => (before ? [...prev, ...res.alerts.filter((a) => !prev.some((p) => p.id === a.id))] : res.alerts));
        setHasMore(res.hasMore);
        setError(null);
      } catch (e: any) {
        if (!before) setError(e?.message || 'No pudimos cargar las publicaciones.');
      } finally {
        loadingRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [city]
  );

  useEffect(() => {
    setLoading(true);
    load();
  }, [load, user?.id]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || alerts.length === 0) return;
    const last = alerts[alerts.length - 1];
    load(last.bumpedAt || last.renewedAt || last.createdAt);
  }, [alerts, hasMore, loadingMore, load]);

  const askLogin = useCallback(() => {
    setShowInvite(true);
    requireLogin();
  }, [requireLogin]);

  const onToggleLike = useCallback(
    (alertId: string) => {
      if (guest) {
        askLogin();
        return;
      }
      const current = alerts.find((a) => a.id === alertId);
      if (!current) return;
      const next = !current.isLiked;
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId ? { ...a, isLiked: next, likeCount: Math.max(0, a.likeCount + (next ? 1 : -1)) } : a
        )
      );
      db.alertLike(alertId, next).catch(() => {});
    },
    [alerts, guest, askLogin]
  );

  const openDetail = useCallback(
    (alert: ApiAlert) => navigation.navigate('AdoptionPost', { city, alertId: alert.id }),
    [navigation, city]
  );

  const header = (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <Image source={LOGO} style={styles.logo} contentFit="contain" accessibilityLabel="Animaldex" />
        <Text style={styles.brandText}>Adopciones</Text>
      </View>
      <View style={styles.placeRow}>
        <Text style={styles.placeText} numberOfLines={1}>
          {place.locality}
        </Text>
        <Pressable
          onPress={() => navigation.navigate('AdoptionMine', { city })}
          hitSlop={8}
          accessibilityRole="link"
        >
          <Text style={styles.mineText}>Mis publicaciones</Text>
        </Pressable>
      </View>
      <Pressable
        style={styles.publishBtn}
        onPress={() => navigation.navigate('AdoptionPublish', { city })}
        accessibilityRole="button"
      >
        <Text style={styles.publishText}>+ Publicar mascota en adopción</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <FlatList
        data={alerts}
        keyExtractor={(a) => a.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <AlertCard
            alert={item}
            onToggleLike={onToggleLike}
            onOpenComments={openDetail}
            onOpenDetail={openDetail}
            onAdopt={adopt}
            showDifundir
            shareUrl={adoptionPostShareUrl(city, item.id)}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={styles.loader} color={colors.primary} size="large" />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {error || `Todavía no hay mascotas en adopción en ${place.locality}.`}
              </Text>
            </View>
          )
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.loader} color={colors.primary} /> : null}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        showsVerticalScrollIndicator={false}
      />
      {guest && showInvite ? inviteBar : null}
      {overlays}
    </SafeAreaView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    list: { flex: 1 },
    listContent: { width: '100%', maxWidth: ADOPTIONS_MAX_WIDTH, alignSelf: 'center', paddingBottom: spacing.xxl },
    header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    logo: { width: 28, height: 28 },
    brandText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
    placeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    placeText: { flexShrink: 1, fontSize: 16, fontWeight: '800', color: colors.text },
    mineText: { fontSize: 13, fontWeight: '700', color: colors.primary },
    publishBtn: {
      alignSelf: 'flex-start',
      backgroundColor: colors.primary,
      borderRadius: radius.full,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    publishText: { color: '#fff', fontWeight: '800', fontSize: 13 },
    loader: { marginTop: spacing.xl },
    empty: { padding: spacing.xl, alignItems: 'center' },
    emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  });
}
