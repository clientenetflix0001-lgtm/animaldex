import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable, Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Post, generateFeedPage } from '../lib/data';
import { db } from '../lib/db';
import { apiPostToPost, useStore } from '../lib/store';
import { usePolling, useNotifications } from '../lib/realtime';
import { postNavParams } from '../lib/share';
import { PostCard } from '../components/PostCard';
import { StoriesBar } from '../components/StoriesBar';
import { LoadingFooter } from '../components/LoadingFooter';
import { SuggestionsPanel } from '../components/SuggestionsPanel';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList, TabParamList } from '../lib/types';
import { useBreakpoint, CONTENT } from '../lib/responsive';
import { ProfileSwitcher } from '../features/profiles';
import WantToAdoptButton from '../components/WantToAdoptButton';
import { feedMediaPerfNoteRenderItem } from '../lib/feedMediaPerf';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Inicio'>,
  NativeStackNavigationProp<RootStackParamList>
>;

export default function FeedScreen() {
  const navigation = useNavigation<Nav>();
  const {
    user,
    createdPosts,
    consumeCreatedPosts,
    deletedPostIds,
    editedCaptions,
    likedPosts,
    savedPosts,
    myComments,
    toggleLike,
    toggleSave,
  } = useStore();
  const { unread } = useNotifications();
  const { desktopWeb, showRightPanel } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
  );
  const [realPosts, setRealPosts] = useState<Post[]>([]);
  const [demoPosts, setDemoPosts] = useState<Post[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingNew, setPendingNew] = useState(0);
  const pageRef = useRef(0);
  const oldestRef = useRef<number | undefined>(undefined);
  const newestRef = useRef<number>(0);
  const realDoneRef = useRef(false);
  const listRef = useRef<FlatList>(null);
  // Espejo de realPosts para los sondeos, que así no dependen del render.
  const realPostsRef = useRef<Post[]>(realPosts);
  realPostsRef.current = realPosts;

  const loadReal = useCallback(async (reset: boolean) => {
    try {
      const before = reset ? undefined : oldestRef.current;
      const { posts } = await db.feed(before, 10);
      if (posts.length > 0) {
        oldestRef.current = posts[posts.length - 1].createdAt;
        if (reset || posts[0].createdAt > newestRef.current) {
          newestRef.current = Math.max(newestRef.current, posts[0].createdAt);
        }
        const mapped = posts.map(apiPostToPost);
        setRealPosts((prev) => {
          if (reset) return mapped;
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...mapped.filter((p) => !seen.has(p.id))];
        });
      }
      if (reset && newestRef.current === 0) newestRef.current = Date.now();
      const isDone = posts.length < 10;
      realDoneRef.current = isDone;
      // Si en el reset inicial no hay posts reales en D1, sembramos los primeros demo de inmediato
      if (reset && isDone && posts.length === 0) {
        setDemoPosts([...generateFeedPage(0), ...generateFeedPage(1)]);
        pageRef.current = 2;
      }
    } catch {
      realDoneRef.current = true;
      if (reset) {
        setDemoPosts([...generateFeedPage(0), ...generateFeedPage(1)]);
        pageRef.current = 2;
      }
    }
  }, []);

  // Carga inicial (una sola vez — el tiempo real se encarga del resto)
  useEffect(() => {
    loadReal(true);
  }, [loadReal]);

  // Mis publicaciones recién creadas: inserción incremental inmediata
  // arriba del feed (sin recargar, sin esperar al sondeo).
  useEffect(() => {
    if (createdPosts.length === 0) return;
    setRealPosts((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      const fresh = createdPosts.filter((p) => !seen.has(p.id));
      return fresh.length > 0 ? [...fresh, ...prev] : prev;
    });
    newestRef.current = Math.max(newestRef.current, Date.now());
    consumeCreatedPosts();
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [createdPosts, consumeCreatedPosts]);

  // ========== TIEMPO REAL ==========

  // 1) Detectar publicaciones nuevas (cada 10 s, consulta ultraligera).
  //    NO se insertan automáticamente: solo se muestra la píldora.
  usePolling(
    useCallback(async () => {
      if (newestRef.current === 0) return;
      try {
        const { newPosts } = await db.updates(newestRef.current, user?.id);
        // Mismo número → misma referencia de estado → sin re-render.
        setPendingNew((prev) => (prev === newPosts ? prev : newPosts));
      } catch {}
    }, [user?.id]),
    10000
  );

  // 2) Contadores de likes/comentarios frescos para los posts cargados
  //    (cada 15 s, actualización quirúrgica: solo cambia el número).
  //    Lee los ids desde una ref para que el callback no se recree en
  //    cada render del feed.
  usePolling(
    useCallback(async () => {
      const ids = realPostsRef.current.slice(0, 24).map((p) => p.id);
      if (ids.length === 0) return;
      try {
        const { counts } = await db.counts(ids);
        setRealPosts((prev) => {
          // Primero se comprueba si algo cambió de verdad; solo entonces
          // se construye un array nuevo. Sin cambios → misma referencia →
          // sin re-render de ninguna publicación.
          const hasChange = prev.some((p) => {
            const c = counts[p.id];
            return !!c && (p.likes !== c.likes || p.commentCount !== c.comments);
          });
          if (!hasChange) return prev;
          return prev.map((p) => {
            const c = counts[p.id];
            if (!c || (p.likes === c.likes && p.commentCount === c.comments)) return p;
            return { ...p, likes: c.likes, commentCount: c.comments };
          });
        });
      } catch {}
    }, []),
    15000
  );

  // 3) Al tocar la píldora: insertar SOLO las publicaciones nuevas arriba
  //    (actualización incremental, el resto del feed queda intacto).
  const loadNewPosts = useCallback(async () => {
    try {
      const { posts } = await db.feedSince(newestRef.current, user?.id);
      if (posts.length > 0) {
        newestRef.current = Math.max(newestRef.current, posts[0].createdAt);
        const mapped = posts.map(apiPostToPost);
        setRealPosts((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...mapped.filter((p) => !seen.has(p.id)), ...prev];
        });
      }
      setPendingNew(0);
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    } catch {}
  }, [user?.id]);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      if (!realDoneRef.current) {
        // Modo 1: Mientras existan posts reales en D1, paginamos exclusivamente posts reales.
        // Se añaden al final de realPosts mediante setRealPosts.
        await loadReal(false);
      } else {
        // Modo 2: Cuando los posts reales se agotaron (realDoneRef es true),
        // comenzamos a paginar demoPosts de forma síncrona y determinista al final.
        const next = generateFeedPage(pageRef.current);
        pageRef.current += 1;
        setDemoPosts((p) => [...p, ...next]);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loadReal]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    pageRef.current = 0;
    setDemoPosts([]);
    setPendingNew(0);
    Promise.all([loadReal(true)]).finally(() => {
      setRefreshing(false);
    });
  }, [loadReal]);

  const openPet = useCallback((petId: string) => navigation.navigate('PetProfile', { petId }), [navigation]);
  const openPost = useCallback(
    (post: Post) => navigation.navigate('PostDetail', postNavParams(post)),
    [navigation]
  );

  // Publicaciones reales primero (comunidad), luego demo.
  // Borrados y ediciones propias se aplican de forma incremental
  // (sin recargar, sin tocar el resto del feed). Memoizado: sin esto el
  // array se reconstruía en cada render y FlatList lo trataba como datos
  // nuevos aunque nada hubiera cambiado.
  const data = useMemo(() => {
    const deletedSet = new Set(deletedPostIds);
    const patchedReal = realPosts
      .filter((p) => !deletedSet.has(p.id))
      .map((p) => (editedCaptions[p.id] != null ? { ...p, caption: editedCaptions[p.id] } : p));
    return [...patchedReal, ...demoPosts];
  }, [realPosts, demoPosts, deletedPostIds, editedCaptions]);

  // Búsquedas O(1) del estado social, en vez de Array.includes por celda.
  const likedSet = useMemo(() => new Set(likedPosts), [likedPosts]);
  const savedSet = useMemo(() => new Set(savedPosts), [savedPosts]);

  const keyExtractor = useCallback((item: Post) => item.id, []);

  // renderItem depende de estado que NO vive en `data` (likes, guardados y
  // comentarios propios). VirtualizedList solo repinta las celdas cuando
  // cambia `extraData`, así que sin esto el corazón no se actualizaría al
  // dar like. Al cambiar, las celdas se repintan pero el memo de PostCard
  // corta el render en todas menos en la publicación afectada.
  const extraData = useMemo(
    () => ({ likedPosts, savedPosts, myComments }),
    [likedPosts, savedPosts, myComments]
  );

  const renderItem = useCallback(
    ({ item }: { item: Post }) => {
      feedMediaPerfNoteRenderItem();
      return (
        <PostCard
          post={item}
          liked={likedSet.has(item.id)}
          saved={savedSet.has(item.id)}
          extraComments={myComments[item.id]?.length ?? 0}
          onToggleLike={toggleLike}
          onToggleSave={toggleSave}
          onOpenPet={openPet}
          onOpenPost={openPost}
        />
      );
    },
    [likedSet, savedSet, myComments, toggleLike, toggleSave, openPet, openPost]
  );

  const newPill = pendingNew > 0 && (
    <Pressable style={styles.newPill} onPress={loadNewPosts}>
      <Ionicons name="arrow-up" size={14} color="#fff" />
      <Text style={styles.newPillText}>
        {pendingNew === 1 ? '1 nueva publicación' : `${pendingNew} nuevas publicaciones`}
      </Text>
    </Pressable>
  );

  const listHeader = useMemo(() => <StoriesBar onOpenPet={openPet} />, [openPet]);
  const listFooter = useMemo(() => <LoadingFooter />, []);
  const refreshCtrl = useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor={colors.primary}
        colors={[colors.primary]}
      />
    ),
    [refreshing, onRefresh]
  );
  const contentStyle = useMemo(
    () => ({ paddingBottom: spacing.xl, paddingTop: desktopWeb ? spacing.xl : 0 }),
    [desktopWeb]
  );

  const feedList = (
    <FlatList
      ref={listRef}
      data={data}
      extraData={extraData}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={listHeader}
      ListFooterComponent={listFooter}
      onEndReached={loadMore}
      onEndReachedThreshold={0.6}
      refreshControl={refreshCtrl}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={contentStyle}
      // Ventana de render moderada: menos celdas vivas a la vez (menos
      // memoria en gama baja) sin bajar la velocidad de relleno, que es
      // lo que provoca celdas en blanco al hacer scroll rápido. Por eso
      // maxToRenderPerBatch se deja en su valor por defecto.
      // No se usa removeClippedSubviews (no validado en Android) ni
      // getItemLayout (las alturas de publicación son variables).
      initialNumToRender={4}
      windowSize={7}
    />
  );

  // ---------- Escritorio ----------
  if (desktopWeb) {
    return (
      <View style={styles.desktopRoot}>
        <View style={styles.desktopCenter}>
          <View style={styles.desktopFeedCol}>
            <View style={styles.desktopAdoptRow}>
              <WantToAdoptButton onPress={() => navigation.navigate('AdoptionDiscovery')} />
            </View>
            {feedList}
            {newPill}
          </View>
          {showRightPanel && <SuggestionsPanel />}
        </View>
      </View>
    );
  }

  // ---------- Móvil / tablet ----------
  return (
    <View style={[styles.safe, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <Image
            source={require('../assets/images/animaldex-logo-mark.png')}
            style={styles.logoMark}
            contentFit="contain"
          />
          <Text style={styles.logo}>nimaldex</Text>
          <Pressable
            style={styles.qrBtn}
            onPress={() => navigation.navigate('QRScanner')}
            hitSlop={8}
            accessibilityLabel="Escanear código QR"
          >
            <Ionicons name="qr-code-outline" size={22} color={colors.primary} />
          </Pressable>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.searchBtn}
            onPress={() => navigation.navigate('Explorar')}
            hitSlop={8}
            accessibilityLabel="Buscar"
          >
            <Ionicons name="search" size={22} color={colors.text} />
          </Pressable>
          <Pressable
            style={styles.searchBtn}
            onPress={() => navigation.navigate('Actividad')}
            hitSlop={8}
            accessibilityLabel="Actividad"
          >
            <View>
              <Ionicons name="heart-outline" size={22} color={colors.text} />
              {unread > 0 && (
                <View style={styles.activityBadge}>
                  <Text style={styles.activityBadgeText}>{unread > 9 ? '9+' : unread}</Text>
                </View>
              )}
            </View>
          </Pressable>
        </View>
      </View>
      <View style={styles.switcherRow}>
        <View style={styles.switcherSlot}>
          <ProfileSwitcher />
        </View>
        <WantToAdoptButton onPress={() => navigation.navigate('AdoptionDiscovery')} />
      </View>
      <View style={{ flex: 1 }}>
        {feedList}
        {newPill}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  desktopRoot: { flex: 1, backgroundColor: colors.bg },
  desktopCenter: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  desktopFeedCol: { flex: 1, maxWidth: CONTENT.feed },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  logoMark: { width: 24, height: 24 },
  logo: { fontSize: 26, fontWeight: '900', color: colors.primary, letterSpacing: -0.5 },
  qrBtn: {
    marginLeft: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarysoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  switcherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: spacing.lg,
    marginBottom: 6,
    gap: spacing.sm,
  },
  switcherSlot: { flex: 1, minWidth: 0 },
  desktopAdoptRow: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  searchBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityBadge: {
    position: 'absolute',
    top: -5,
    right: -8,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: colors.heart,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.card,
  },
  activityBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  newPill: {
    position: 'absolute',
    top: spacing.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.full,
    zIndex: 50,
    ...shadow.card,
    shadowOpacity: 0.25,
  },
  newPillText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
