// ============================================================
// Animaldex Adopciones — muro público por localidad (solo web).
// /adopciones/:city en animaldex.com y /:city en el subdominio.
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { db, type ApiAlert } from '../../lib/db';
import { useStore } from '../../lib/store';
import { useGuestAccess } from '../../lib/guestAccess';
import { useAppTheme, type ThemeColors, spacing } from '../../lib/theme';
import { RootStackParamList } from '../../lib/types';
import { adoptionLocalityBySlug, DEFAULT_ADOPTION_SLUG } from '../../lib/adoptionLocalities';
import {
  matchesAdoptionSpeciesFilter,
  type AdoptionSpeciesFilter,
} from '../../lib/adoptionSpeciesFilter';
import { adoptionPostShareUrl, useAdoptionPostActions } from '../../components/adoptions/useAdoptionPostActions';
import { AdoptionAccountPrompt } from '../../components/adoptions/AdoptionAccountPrompt';
import { AdoptionsHeader } from '../../components/adoptions/AdoptionsHeader';
import { AdoptionGridCard } from '../../components/adoptions/AdoptionGridCard';

type Rt = RouteProp<RootStackParamList, 'AdoptionsWall'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const PAGE = 12;
const GRID_MAX_WIDTH = 880;
const FILTER_FILL_CAP = 6;
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
  const [askAccount, setAskAccount] = useState(false);
  const [species, setSpecies] = useState<AdoptionSpeciesFilter>('all');
  const loadingRef = useRef(false);
  const fillAttempts = useRef(0);

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
    setSpecies('all');
    fillAttempts.current = 0;
    load();
  }, [load, user?.id]);

  useEffect(() => {
    const close = () => setAskAccount(false);
    const unsub = navigation.addListener('blur', close);
    return unsub;
  }, [navigation]);

  useEffect(() => {
    if (Platform.OS !== 'web' || askAccount) return;
    const doc = (globalThis as { document?: { body: { style: { overflow: string } }; documentElement: { style: { overflow: string } } } }).document;
    if (!doc) return;
    doc.body.style.overflow = '';
    doc.documentElement.style.overflow = '';
  }, [askAccount]);

  const visible = useMemo(
    () => alerts.filter((alert) => matchesAdoptionSpeciesFilter(alert, species)),
    [alerts, species]
  );
  const gridData = useMemo(
    () => (visible.length % 2 === 1 ? [...visible, null] : visible),
    [visible]
  );

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || alerts.length === 0) return;
    const last = alerts[alerts.length - 1];
    load(last.bumpedAt || last.renewedAt || last.createdAt);
  }, [alerts, hasMore, loadingMore, load]);

  useEffect(() => {
    fillAttempts.current = 0;
  }, [species, city]);

  useEffect(() => {
    if (species === 'all' || loading || loadingMore || !hasMore || alerts.length === 0) return;
    if (visible.length >= PAGE || fillAttempts.current >= FILTER_FILL_CAP) return;
    fillAttempts.current += 1;
    loadMore();
  }, [species, visible.length, loading, loadingMore, hasMore, alerts.length, loadMore]);

  const askLogin = useCallback(() => {
    setShowInvite(true);
    requireLogin();
  }, [requireLogin]);

  const openAuth = useCallback(
    (mode: 'login' | 'register') => {
      setAskAccount(false);
      navigation.navigate('Auth', { mode });
    },
    [navigation]
  );

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
    <AdoptionsHeader
      city={city}
      locality={place.locality}
      species={species}
      onSpecies={setSpecies}
      onPublish={() => (guest ? setAskAccount(true) : navigation.navigate('AdoptionPublish', { city }))}
      onMine={() => navigation.navigate('AdoptionMine', { city })}
    />
  );

  const fillingFilter =
    species !== 'all' &&
    visible.length === 0 &&
    hasMore &&
    !error &&
    fillAttempts.current < FILTER_FILL_CAP;
  const empty = loading || loadingMore || fillingFilter ? (
    <ActivityIndicator style={styles.loader} color={colors.primary} size="large" />
  ) : (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>
        {error ||
          (species === 'all'
            ? `Todavía no hay mascotas en adopción en ${place.locality}.`
            : `No hay publicaciones de esta especie en ${place.locality}.`)}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <FlatList
        data={gridData}
        keyExtractor={(item) => item?.id ?? 'grid-pad'}
        numColumns={2}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={visible.length > 0 ? styles.row : undefined}
        ListHeaderComponent={header}
        renderItem={({ item }) =>
          item ? (
            <AdoptionGridCard
              alert={item}
              onToggleLike={onToggleLike}
              onOpen={openDetail}
              onAdopt={adopt}
              shareUrl={adoptionPostShareUrl(city, item.id)}
            />
          ) : (
            <View style={styles.pad} />
          )
        }
        ListEmptyComponent={empty}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.loader} color={colors.primary} /> : null}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        windowSize={7}
      />
      {guest && showInvite ? inviteBar : null}
      <Modal visible={askAccount} transparent animationType="fade" onRequestClose={() => setAskAccount(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAskAccount(false)}>
          <Pressable onPress={() => {}}>
            <AdoptionAccountPrompt
              title="Publicá una mascota en adopción"
              message="Para publicar y administrar tus mascotas, necesitás una cuenta de Animaldex."
              onLogin={() => openAuth('login')}
              onRegister={() => openAuth('register')}
              onCancel={() => setAskAccount(false)}
            />
          </Pressable>
        </Pressable>
      </Modal>
      {overlays}
    </SafeAreaView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    list: { flex: 1 },
    listContent: {
      width: '100%',
      maxWidth: GRID_MAX_WIDTH,
      alignSelf: 'center',
      paddingBottom: spacing.xxl,
      paddingHorizontal: spacing.xs,
    },
    row: { gap: spacing.sm, marginBottom: spacing.sm },
    pad: { flex: 1 },
    loader: { marginTop: spacing.xl },
    empty: { padding: spacing.xl, alignItems: 'center' },
    emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.lg,
    },
  });
}
