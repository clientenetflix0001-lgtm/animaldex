import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  AppState,
  AppStateStatus,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ReelCard } from '../components/ReelCard';
import { db, timeAgoMinutes, type ApiComment, type ApiReel } from '../lib/db';
import { useStore } from '../lib/store';
import { shareReel } from '../lib/share';
import { openHumanProfile } from '../lib/publicHandles';
import { useReelsPageVisible } from '../lib/reelsFocus';
import {
  REEL_FEED_PAGE,
  REEL_OWNER_POLL_MS,
  REEL_SCROLL_DEBOUNCE_MS,
  canDeleteReel,
  ensureLikedSet,
  mergeOwnerReels,
  paginationFailureKeeps,
  playerRoleForIndex,
  removeReelFromList,
  replaceReelInList,
  reelsFeedView,
  rollbackLikedSet,
  shouldPlayReel,
  shouldStartStream,
  toggleLikedSet,
} from '../lib/reels';
import { appendUniqueReels, type ReelGridScope } from '../lib/reelGrid';
import { forgetLocalReel, listLocalReels } from '../lib/reelSession';
import { colors } from '../lib/theme';
import { Image } from 'expo-image';
import { thumb, userFallbackAvatar } from '../lib/images';
import { formatTime } from '../lib/data';

export default function ReelsScreen({
  initialReel,
  initialReels,
  initialIndex = 0,
  scope,
}: {
  initialReel?: ApiReel | null;
  initialReels?: ApiReel[] | null;
  initialIndex?: number;
  scope?: ReelGridScope;
} = {}) {
  const navigation = useNavigation<any>();
  const { user } = useStore();
  const tabFocused = useIsFocused();
  const reelsPageVisible = useReelsPageVisible();
  const insets = useSafeAreaInsets();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const seeded = initialReels && initialReels.length ? initialReels : initialReel ? [initialReel] : [];
  const startIndex = Math.max(0, Math.min(initialIndex, Math.max(0, seeded.length - 1)));
  const [reels, setReels] = useState<ApiReel[]>(seeded);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [myComments, setMyComments] = useState<Record<string, number>>({});
  const [muted, setMuted] = useState(false);
  const [activeIndex, setActiveIndex] = useState(startIndex);
  const [stableIndex, setStableIndex] = useState(startIndex);
  const [viewportH, setViewportH] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [boot, setBoot] = useState(!seeded.length);
  const scoped = !!(scope && scope.type !== 'feed');
  const listRef = useRef<FlatList<ApiReel>>(null);
  const [bootError, setBootError] = useState(false);
  const [pageError, setPageError] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [sheet, setSheet] = useState<ApiReel | null>(null);
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [draft, setDraft] = useState('');
  const oldestRef = useRef<number | undefined>(undefined);
  const stableAtRef = useRef(Date.now());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      setForeground(s === 'active');
    });
    return () => sub.remove();
  }, []);

  const loadScopedPage = useCallback(
    async (before?: number) => {
      if (scope?.type === 'profile') return db.profileReels(scope.id, before, REEL_FEED_PAGE);
      if (scope?.type === 'pet') return db.petReels(scope.id, before, REEL_FEED_PAGE);
      if (scope?.type === 'user') return db.userReels(scope.id, before, REEL_FEED_PAGE);
      return db.reelsFeed(before, REEL_FEED_PAGE);
    },
    [scope]
  );

  const loadPage = useCallback(async (reset: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (!reset) setLoadingMore(true);
    try {
      const before = reset ? undefined : oldestRef.current;
      const { reels: page, hasMore: more } = await loadScopedPage(before);
      if (page.length) oldestRef.current = page[page.length - 1].createdAt;
      setHasMore(more);
      setPageError(false);
      setBootError(false);
      setReels((prev) => {
        if (reset) {
          if (seeded.length) return appendUniqueReels(seeded, page);
          return initialReel && !page.some((r) => r.id === initialReel.id) ? [initialReel, ...page] : page;
        }
        return appendUniqueReels(prev, page);
      });
    } catch {
      if (reset) {
        setReels((prev) => paginationFailureKeeps(prev));
        setBootError(true);
      } else {
        setPageError(true);
        setReels((prev) => paginationFailureKeeps(prev));
      }
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
      setBoot(false);
    }
  }, [initialReel, loadScopedPage, seeded.length]);

  useEffect(() => {
    if (seeded.length) {
      oldestRef.current = seeded[seeded.length - 1].createdAt;
      setBoot(false);
    } else {
      loadPage(true);
    }
    db.myReelState()
      .then(({ state }) => {
        setLiked(new Set(state.likedReels));
        if (scoped) return;
        const mine = [...(state.pendingReels || []), ...(state.failedReels || [])];
        if (mine.length) setReels((prev) => mergeOwnerReels(prev, mine));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let ticks = 0;
    const poll = async () => {
      ticks += 1;
      const local = listLocalReels();
      for (const row of local) {
        try {
          const { reel } = await db.myReel(row.id);
          if (cancelled) return;
          setReels((prev) => replaceReelInList(prev, reel));
          if (reel.status === 'ready' || reel.status === 'deleted') forgetLocalReel(row.id);
        } catch {}
      }
      try {
        const { state } = await db.myReelState();
        const mine = [...(state.pendingReels || []), ...(state.failedReels || [])];
        if (mine.length && !cancelled && !scoped) setReels((prev) => mergeOwnerReels(prev, mine));
      } catch {}
      if (!cancelled && ticks < 12 && listLocalReels().length) {
        timer = setTimeout(poll, REEL_OWNER_POLL_MS);
      }
    };
    let timer = setTimeout(poll, REEL_OWNER_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
    const first = viewableItems.find((v) => v.index != null);
    if (first && first.index != null) setActiveIndex(first.index);
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    stableAtRef.current = Date.now();
    debounceRef.current = setTimeout(() => {
      if (shouldStartStream(Date.now(), stableAtRef.current, REEL_SCROLL_DEBOUNCE_MS)) {
        setStableIndex(activeIndex);
      } else {
        setStableIndex(activeIndex);
      }
    }, REEL_SCROLL_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [activeIndex]);

  const toggleLike = useCallback((id: string) => {
    setLiked((prev) => {
      const { next, value } = toggleLikedSet(prev, id);
      db.reelLike(id, value).catch(() => {
        setLiked((cur) => rollbackLikedSet(cur, id, value));
      });
      return next;
    });
  }, []);

  const likeOnly = useCallback((id: string) => {
    setLiked((prev) => {
      const { next, changed } = ensureLikedSet(prev, id);
      if (changed) {
        db.reelLike(id, true).catch(() => {
          setLiked((cur) => rollbackLikedSet(cur, id, true));
        });
      }
      return next;
    });
  }, []);

  const openComments = useCallback(async (reel: ApiReel) => {
    setSheet(reel);
    setDraft('');
    try {
      const { comments: rows } = await db.reelComments(reel.id);
      setComments(rows);
    } catch {
      setComments([]);
    }
  }, []);

  const sendComment = useCallback(async () => {
    if (!sheet || !draft.trim()) return;
    if (!user) {
      navigation.navigate('Auth');
      return;
    }
    const text = draft.trim();
    setDraft('');
    try {
      const { id, createdAt } = await db.reelComment(sheet.id, text);
      setComments((c) => [
        ...c,
        {
          id,
          userId: user.id,
          username: user.username || 'yo',
          userName: user.name || 'Yo',
          avatarUrl: user.avatarUrl || null,
          text,
          createdAt,
        },
      ]);
      setMyComments((m) => ({ ...m, [sheet.id]: (m[sheet.id] || 0) + 1 }));
    } catch {}
  }, [draft, sheet, user, navigation]);

  const extraData = useMemo(
    () => ({ liked, myComments, muted, stableIndex, commentsOpen: !!sheet }),
    [liked, myComments, muted, stableIndex, sheet]
  );

  const onShare = useCallback((r: ApiReel) => {
    shareReel(r);
  }, []);

  const onOpenProfile = useCallback(
    (r: ApiReel) => {
      openHumanProfile(navigation, {
        username: r.authorProfileUsername || r.username || undefined,
        userId: r.userId,
      });
    },
    [navigation]
  );

  const onOpenPet = useCallback(
    (r: ApiReel) => {
      if (r.petId) navigation.navigate('PetProfile', { petId: r.petUsername || r.petId });
    },
    [navigation]
  );

  const onToggleMute = useCallback(() => setMuted((m) => !m), []);

  const onDelete = useCallback(async (reel: ApiReel) => {
    if (!canDeleteReel(user?.id, reel.userId)) return;
    try {
      await db.deleteReel(reel.id);
      forgetLocalReel(reel.id);
      setReels((prev) => removeReelFromList(prev, reel.id));
    } catch {}
  }, [user?.id]);

  const goCreate = useCallback(() => {
    if (!user) navigation.navigate('Auth');
    else navigation.navigate('CreateReel');
  }, [navigation, user]);

  const renderItem = useCallback(
    ({ item, index }: { item: ApiReel; index: number }) => {
      const role = playerRoleForIndex(index, stableIndex);
      const play = shouldPlayReel({
        tabFocused,
        reelsPageVisible,
        reelIsActive: role === 'active' && !sheet,
        appIsForeground: foreground,
      });
      return (
        <View style={{ height: viewportH || 1 }}>
          <ReelCard
            reel={item}
            role={role}
            shouldPlay={play}
            muted={muted}
            liked={liked.has(item.id)}
            extraComments={myComments[item.id] || 0}
            isOwner={canDeleteReel(user?.id, item.userId)}
            onToggleLike={toggleLike}
            onLikeOnly={likeOnly}
            onOpenComments={openComments}
            onShare={onShare}
            onOpenProfile={onOpenProfile}
            onOpenPet={onOpenPet}
            onToggleMute={onToggleMute}
            onDelete={onDelete}
          />
        </View>
      );
    },
    [stableIndex, tabFocused, reelsPageVisible, foreground, muted, liked, myComments, toggleLike, likeOnly, openComments, onShare, onOpenProfile, onOpenPet, onToggleMute, onDelete, user?.id, viewportH, sheet]
  );

  const keyExtractor = useCallback((item: ApiReel) => item.id, []);
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: viewportH, offset: viewportH * index, index }),
    [viewportH]
  );

  const view = reelsFeedView({ loading: boot, error: bootError, count: reels.length });

  return (
    <View
      style={styles.root}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0 && h !== viewportH) setViewportH(h);
      }}
    >
      {viewportH > 0 && view === 'list' ? (
        <FlatList
          ref={listRef}
          data={reels}
          extraData={extraData}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          pagingEnabled
          snapToInterval={viewportH}
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          getItemLayout={getItemLayout}
          initialScrollIndex={startIndex > 0 ? startIndex : undefined}
          onScrollToIndexFailed={({ index }) => {
            requestAnimationFrame(() => {
              listRef.current?.scrollToIndex({ index, animated: false });
            });
          }}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onEndReached={() => {
            if (hasMore && !pageError) loadPage(false);
          }}
          onEndReachedThreshold={0.4}
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          windowSize={3}
          removeClippedSubviews={false}
          ListFooterComponent={
            pageError ? (
              <Pressable style={styles.pageRetry} onPress={() => loadPage(false)} accessibilityLabel="Reintentar">
                <Text style={styles.pageRetryT}>No se pudo cargar más. Reintentar</Text>
              </Pressable>
            ) : loadingMore ? (
              <View style={styles.skel} />
            ) : null
          }
        />
      ) : view === 'loading' ? (
        <View style={styles.skelWrap}>
          <View style={styles.skelCard} />
          <View style={styles.skelLine} />
          <View style={[styles.skelLine, { width: '40%' }]} />
        </View>
      ) : view === 'error' ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No pudimos cargar los Reels</Text>
          <Pressable style={styles.cta} onPress={() => loadPage(true)} accessibilityLabel="Reintentar">
            <Text style={styles.ctaT}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.empty}>
          <Ionicons name="film-outline" size={40} color="#fff" />
          <Text style={styles.emptyTitle}>Aún no hay Reels</Text>
          <Pressable style={styles.cta} onPress={goCreate} accessibilityLabel={user ? 'Crear Reel' : 'Iniciar sesión'}>
            <Text style={styles.ctaT}>{user ? 'Crear el primero' : 'Iniciar sesión'}</Text>
          </Pressable>
        </View>
      )}

      {!scoped && (
      <Pressable
        style={[styles.fab, { top: insets.top + 10 }]}
        onPress={goCreate}
        accessibilityLabel="Crear Reel"
      >
        <Ionicons name="add" size={26} color="#fff" />
      </Pressable>
      )}

      {sheet ? (
        <KeyboardAvoidingView
          behavior="padding"
          enabled={Platform.OS !== 'web'}
          keyboardVerticalOffset={0}
          style={styles.sheet}
        >
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Comentarios {comments.length ? `(${comments.length})` : ''}</Text>
            <Pressable onPress={() => setSheet(null)} accessibilityLabel="Cerrar comentarios" hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
          <FlatList
            data={comments}
            keyExtractor={(c) => c.id}
            style={{ maxHeight: 240 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <View style={styles.commentRow}>
                <Image
                  source={{ uri: thumb(item.avatarUrl || userFallbackAvatar(item.username), 64) }}
                  style={styles.commentAvatar}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.commentMeta}>
                    <Text style={{ fontWeight: '800' }}>@{item.username}</Text>
                    {'  '}
                    <Text style={styles.commentTime}>{formatTime(timeAgoMinutes(item.createdAt))}</Text>
                  </Text>
                  <Text style={styles.comment}>{item.text}</Text>
                </View>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.commentMuted}>Sé el primero en comentar.</Text>}
          />
          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Escribí un comentario"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              accessibilityLabel="Campo de comentario"
            />
            <Pressable
              onPress={sendComment}
              disabled={!draft.trim()}
              accessibilityLabel="Publicar comentario"
              hitSlop={8}
            >
              <Ionicons name="send" size={20} color={draft.trim() ? colors.primary : colors.textMuted} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  emptyTitle: { color: '#fff', fontWeight: '800', fontSize: 20, textAlign: 'center' },
  cta: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  ctaT: { color: '#fff', fontWeight: '800' },
  skelWrap: { flex: 1, justifyContent: 'flex-end', padding: 24, gap: 10 },
  skelCard: { ...StyleSheet.absoluteFillObject, backgroundColor: '#1a1a1a' },
  skelLine: { height: 12, width: '70%', backgroundColor: '#2a2a2a', borderRadius: 6 },
  skel: { height: 8 },
  pageRetry: { padding: 16, alignItems: 'center' },
  pageRetryT: { color: '#fff', fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: 14,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    paddingBottom: 20,
    maxHeight: '55%',
  },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' },
  sheetTitle: { fontWeight: '800', color: colors.text },
  commentRow: { flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'flex-start' },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.border },
  commentMeta: { color: colors.text, marginBottom: 2 },
  commentTime: { color: colors.textMuted, fontWeight: '600', fontSize: 12 },
  comment: { color: colors.text },
  commentMuted: { color: colors.textMuted },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, color: colors.text },
});
