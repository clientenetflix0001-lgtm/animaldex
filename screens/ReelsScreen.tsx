// ============================================================
// Animaldex — Sección REELS (videos cortos de TikTok embebidos)
// ============================================================
// Feed vertical estilo TikTok/Reels. Etapa 1: los videos son
// públicos de TikTok mostrados vía su reproductor oficial embebido
// (sin descargar ni alojar ningún archivo). Carga progresiva con
// paginación, y solo se "monta" el reproductor real del Reel activo
// + el siguiente (precarga mínima) — el resto se muestra como una
// miniatura liviana para no saturar memoria/red.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  ViewToken,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { db, ApiReel } from '../lib/db';
import { useStore } from '../lib/store';
import { ReelCard } from '../components/ReelCard';
import { ReelCommentsSheet } from '../components/ReelCommentsSheet';
import { shareReel } from '../lib/share';
import { colors, spacing, radius } from '../lib/theme';
import { RootStackParamList } from '../lib/types';
import { useBreakpoint } from '../lib/responsive';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const PAGE_SIZE = 5;

export default function ReelsScreen() {
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const { desktopWeb } = useBreakpoint();
  const { user } = useStore();

  const [reels, setReels] = useState<ApiReel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [commentsFor, setCommentsFor] = useState<ApiReel | null>(null);

  const oldestRef = useRef<number | undefined>(undefined);
  const viewedRef = useRef<Set<string>>(new Set());
  const didInitialFocusRef = useRef(false);

  const fetchPage = useCallback(async (reset: boolean) => {
    if (reset) {
      setLoading(true);
      oldestRef.current = undefined;
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await db.reelsFeed(reset ? undefined : oldestRef.current, PAGE_SIZE);
      setReels((prev) => (reset ? res.reels : [...prev, ...res.reels]));
      if (res.reels.length > 0) {
        oldestRef.current = res.reels[res.reels.length - 1].createdAt;
      }
      setHasMore(res.hasMore);
    } catch {
      if (reset) setReels([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(true);
  }, [fetchPage]);

  // Al volver de "Agregar Reel", refrescar para que el nuevo aparezca.
  useFocusEffect(
    useCallback(() => {
      if (!didInitialFocusRef.current) {
        didInitialFocusRef.current = true;
        return;
      }
      fetchPage(true);
    }, [fetchPage])
  );

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    fetchPage(false);
  }, [loadingMore, hasMore, fetchPage]);

  // ---------- Registro de vista (best-effort, una vez por reel) ----------
  const registerView = useCallback((reelId: string) => {
    if (viewedRef.current.has(reelId)) return;
    viewedRef.current.add(reelId);
    db.reelView(reelId).catch(() => {});
  }, []);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 65 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      const idx = viewableItems[0].index;
      setActiveIndex(idx);
      const item = viewableItems[0].item as ApiReel;
      if (item) registerView(item.id);
    }
  }).current;

  const handleToggleLike = useCallback((reelId: string) => {
    setReels((prev) =>
      prev.map((r) =>
        r.id === reelId ? { ...r, isLiked: !r.isLiked, likeCount: r.likeCount + (r.isLiked ? -1 : 1) } : r
      )
    );
    const target = reels.find((r) => r.id === reelId);
    const nextValue = !(target?.isLiked ?? false);
    db.reelLike(reelId, nextValue).catch(() => {});
  }, [reels]);

  const handleShare = useCallback((reel: ApiReel) => {
    shareReel(reel);
    db.reelShare(reel.id).catch(() => {});
  }, []);

  const handleReport = useCallback((reel: ApiReel) => {
    const submit = () => {
      db.reportReel(reel.id, 'Contenido reportado desde la app').catch(() => {});
      const msg = 'Gracias, revisaremos este Reel.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(msg);
      else Alert.alert('Denuncia enviada', msg);
    };
    submit();
  }, []);

  const handleDelete = useCallback((reel: ApiReel) => {
    const doDelete = async () => {
      try {
        await db.deleteReel(reel.id);
        setReels((prev) => prev.filter((r) => r.id !== reel.id));
      } catch (e: any) {
        const msg = e?.message || 'No se pudo eliminar';
        if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(msg);
        else Alert.alert('Error', msg);
      }
    };
    doDelete();
  }, []);

  const openComments = useCallback((reel: ApiReel) => setCommentsFor(reel), []);

  const onCommentAdded = useCallback(() => {
    if (!commentsFor) return;
    setReels((prev) =>
      prev.map((r) => (r.id === commentsFor.id ? { ...r, commentCount: r.commentCount + 1 } : r))
    );
  }, [commentsFor]);

  const renderItem = useCallback(
    ({ item, index }: { item: ApiReel; index: number }) => (
      <ReelCard
        reel={item}
        height={containerHeight}
        isActive={index === activeIndex}
        shouldMount={index === activeIndex || index === activeIndex + 1}
        isOwn={!!user && item.userId === user.id}
        onToggleLike={handleToggleLike}
        onOpenComments={openComments}
        onShare={handleShare}
        onReport={handleReport}
        onDelete={handleDelete}
      />
    ),
    [containerHeight, activeIndex, user, handleToggleLike, openComments, handleShare, handleReport, handleDelete]
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({ length: containerHeight, offset: containerHeight * index, index }),
    [containerHeight]
  );

  const wrapStyle = desktopWeb ? styles.desktopWrap : styles.mobileWrap;

  return (
    <SafeAreaView style={[styles.safe, reels.length > 0 && styles.safeDark]} edges={['top']}>
      {isFocused && reels.length > 0 && <StatusBar style="light" />}
      <View style={[styles.centerRoot, desktopWeb && styles.desktopRoot]}>
        <View style={[styles.feedWrap, wrapStyle]}>
          {/* Header flotante */}
          <View style={styles.header} pointerEvents="box-none">
            <Text style={styles.headerTitle}>🎬 Reels</Text>
            <Pressable style={styles.createBtn} onPress={() => navigation.navigate('CreateReel')}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.createBtnText}>Agregar Reel</Text>
            </Pressable>
          </View>

          <View
            style={{ flex: 1 }}
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (h > 0 && h !== containerHeight) setContainerHeight(h);
            }}
          >
            {loading ? (
              <View style={styles.centerState}>
                <ActivityIndicator color={colors.primary} size="large" />
              </View>
            ) : reels.length === 0 ? (
              <View style={styles.centerState}>
                <Text style={styles.emptyEmoji}>🎬</Text>
                <Text style={styles.emptyTitle}>Aún no hay Reels</Text>
                <Text style={styles.emptyText}>
                  Comparte el primer video de TikTok sobre mascotas para esta comunidad.
                </Text>
                <Pressable style={styles.primaryBtn} onPress={() => navigation.navigate('CreateReel')}>
                  <Text style={styles.primaryBtnText}>Agregar el primer Reel</Text>
                </Pressable>
              </View>
            ) : containerHeight > 0 ? (
              <FlatList
                data={reels}
                keyExtractor={(r) => r.id}
                renderItem={renderItem}
                getItemLayout={getItemLayout}
                showsVerticalScrollIndicator={false}
                snapToInterval={containerHeight}
                snapToAlignment="start"
                decelerationRate="fast"
                disableIntervalMomentum
                pagingEnabled={false}
                onEndReached={loadMore}
                onEndReachedThreshold={1.2}
                viewabilityConfig={viewabilityConfig}
                onViewableItemsChanged={onViewableItemsChanged}
                initialNumToRender={2}
                maxToRenderPerBatch={2}
                windowSize={3}
                removeClippedSubviews={Platform.OS !== 'web'}
                ListFooterComponent={
                  loadingMore ? (
                    <View style={{ height: containerHeight, alignItems: 'center', justifyContent: 'center' }}>
                      <ActivityIndicator color="#fff" />
                    </View>
                  ) : null
                }
              />
            ) : null}
          </View>
        </View>
      </View>

      <ReelCommentsSheet
        visible={!!commentsFor}
        reelId={commentsFor?.id ?? null}
        onClose={() => setCommentsFor(null)}
        onCommentAdded={onCommentAdded}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  safeDark: { backgroundColor: '#000' },
  centerRoot: { flex: 1 },
  desktopRoot: { alignItems: 'center' },
  feedWrap: { flex: 1 },
  desktopWrap: { width: 430, maxWidth: '100%' },
  mobileWrap: { width: '100%' },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    paddingBottom: spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  createBtnText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 4 },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 22,
    paddingVertical: 13,
    marginTop: spacing.md,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
