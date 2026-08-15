import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Post, generateFeedPage } from '../lib/data';
import { db } from '../lib/db';
import { apiPostToPost, useStore } from '../lib/store';
import { usePolling } from '../lib/realtime';
import { postNavParams } from '../lib/share';
import { PostCard } from '../components/PostCard';
import { StoriesBar } from '../components/StoriesBar';
import { LoadingFooter } from '../components/LoadingFooter';
import { SuggestionsPanel } from '../components/SuggestionsPanel';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList, TabParamList } from '../lib/types';
import { useBreakpoint, CONTENT } from '../lib/responsive';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Inicio'>,
  NativeStackNavigationProp<RootStackParamList>
>;

export default function FeedScreen() {
  const navigation = useNavigation<Nav>();
  const { user, createdPosts, consumeCreatedPosts, deletedPostIds, editedCaptions } = useStore();
  const { desktopWeb, showRightPanel } = useBreakpoint();
  const [realPosts, setRealPosts] = useState<Post[]>([]);
  const [demoPosts, setDemoPosts] = useState<Post[]>(() => [...generateFeedPage(0), ...generateFeedPage(1)]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingNew, setPendingNew] = useState(0);
  const pageRef = useRef(2);
  const oldestRef = useRef<number | undefined>(undefined);
  const newestRef = useRef<number>(0);
  const realDoneRef = useRef(false);
  const listRef = useRef<FlatList>(null);

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
      realDoneRef.current = posts.length < 10;
    } catch {
      realDoneRef.current = true;
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
        setPendingNew(newPosts);
      } catch {}
    }, [user?.id]),
    10000
  );

  // 2) Contadores de likes/comentarios frescos para los posts cargados
  //    (cada 15 s, actualización quirúrgica: solo cambia el número).
  usePolling(
    useCallback(async () => {
      const ids = realPosts.slice(0, 24).map((p) => p.id);
      if (ids.length === 0) return;
      try {
        const { counts } = await db.counts(ids);
        setRealPosts((prev) => {
          let changed = false;
          const next = prev.map((p) => {
            const c = counts[p.id];
            if (!c) return p;
            if (p.likes !== c.likes || p.commentCount !== c.comments) {
              changed = true;
              return { ...p, likes: c.likes, commentCount: c.comments };
            }
            return p;
          });
          return changed ? next : prev; // sin cambios → sin re-render
        });
      } catch {}
    }, [realPosts]),
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

  const loadMore = useCallback(() => {
    if (loadingMore) return;
    setLoadingMore(true);
    const tasks: Promise<any>[] = [];
    if (!realDoneRef.current) tasks.push(loadReal(false));
    Promise.all(tasks).finally(() => {
      setTimeout(() => {
        const next = generateFeedPage(pageRef.current);
        pageRef.current += 1;
        setDemoPosts((p) => [...p, ...next]);
        setLoadingMore(false);
      }, 400);
    });
  }, [loadingMore, loadReal]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([loadReal(true)]).finally(() => {
      pageRef.current = 2;
      setDemoPosts([...generateFeedPage(0), ...generateFeedPage(1)]);
      setPendingNew(0);
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
  // (sin recargar, sin tocar el resto del feed).
  const deletedSet = new Set(deletedPostIds);
  const patchedReal = realPosts
    .filter((p) => !deletedSet.has(p.id))
    .map((p) => (editedCaptions[p.id] != null ? { ...p, caption: editedCaptions[p.id] } : p));
  const data = [...patchedReal, ...demoPosts];

  const newPill = pendingNew > 0 && (
    <Pressable style={styles.newPill} onPress={loadNewPosts}>
      <Ionicons name="arrow-up" size={14} color="#fff" />
      <Text style={styles.newPillText}>
        {pendingNew === 1 ? '1 nueva publicación' : `${pendingNew} nuevas publicaciones`}
      </Text>
    </Pressable>
  );

  const feedList = (
    <FlatList
      ref={listRef}
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <PostCard post={item} onOpenPet={openPet} onOpenPost={openPost} />}
      ListHeaderComponent={<StoriesBar onOpenPet={openPet} />}
      ListFooterComponent={<LoadingFooter />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.6}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
      }
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: spacing.xl, paddingTop: desktopWeb ? spacing.xl : 0 }}
    />
  );

  // ---------- Escritorio ----------
  if (desktopWeb) {
    return (
      <View style={styles.desktopRoot}>
        <View style={styles.desktopCenter}>
          <View style={styles.desktopFeedCol}>
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
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <Image
            source={require('../assets/images/animaldex-logo-mark.png')}
            style={styles.logoMark}
            contentFit="contain"
          />
          <Text style={styles.logo}>Animaldex</Text>
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
            <Ionicons name="heart-outline" size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        {feedList}
        {newPill}
      </View>
    </SafeAreaView>
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
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
  searchBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
