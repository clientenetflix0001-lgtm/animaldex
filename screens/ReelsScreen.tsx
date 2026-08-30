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
  ActivityIndicator,
} from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ReelCard } from '../components/ReelCard';
import { db, type ApiComment, type ApiReel } from '../lib/db';
import { useStore } from '../lib/store';
import { shareReel } from '../lib/share';
import { openHumanProfile } from '../lib/publicHandles';
import { useReelsPageVisible } from '../lib/reelsFocus';
import {
  REEL_FEED_PAGE,
  REEL_SCROLL_DEBOUNCE_MS,
  playerRoleForIndex,
  shouldPlayReel,
  shouldStartStream,
} from '../lib/reels';
import { colors } from '../lib/theme';

export default function ReelsScreen({ initialReel }: { initialReel?: ApiReel | null } = {}) {
  const navigation = useNavigation<any>();
  const { user } = useStore();
  const tabFocused = useIsFocused();
  const reelsPageVisible = useReelsPageVisible();
  const insets = useSafeAreaInsets();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [reels, setReels] = useState<ApiReel[]>(initialReel ? [initialReel] : []);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [myComments, setMyComments] = useState<Record<string, number>>({});
  const [muted, setMuted] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [stableIndex, setStableIndex] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [sheet, setSheet] = useState<ApiReel | null>(null);
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [draft, setDraft] = useState('');
  const oldestRef = useRef<number | undefined>(undefined);
  const stableAtRef = useRef(Date.now());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      setForeground(s === 'active');
    });
    return () => sub.remove();
  }, []);

  const loadPage = useCallback(async (reset: boolean) => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const before = reset ? undefined : oldestRef.current;
      const { reels: page, hasMore: more } = await db.reelsFeed(before, REEL_FEED_PAGE);
      if (page.length) oldestRef.current = page[page.length - 1].createdAt;
      setHasMore(more);
      setReels((prev) => {
        if (reset) return initialReel && !page.some((r) => r.id === initialReel.id) ? [initialReel, ...page] : page;
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...page.filter((r) => !seen.has(r.id))];
      });
    } catch {
      if (reset && !initialReel) setReels([]);
    } finally {
      setLoadingMore(false);
    }
  }, [initialReel, loadingMore]);

  useEffect(() => {
    loadPage(true);
    db.myReelState()
      .then(({ state }) => setLiked(new Set(state.likedReels)))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const next = new Set(prev);
      const value = !next.has(id);
      if (value) next.add(id);
      else next.delete(id);
      db.reelLike(id, value).catch(() => {});
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
    const text = draft.trim();
    setDraft('');
    try {
      const { id, createdAt } = await db.reelComment(sheet.id, text);
      setComments((c) => [
        ...c,
        {
          id,
          userId: user?.id || '',
          username: user?.username || 'yo',
          userName: user?.name || 'Yo',
          avatarUrl: user?.avatarUrl || null,
          text,
          createdAt,
        },
      ]);
      setMyComments((m) => ({ ...m, [sheet.id]: (m[sheet.id] || 0) + 1 }));
    } catch {}
  }, [draft, sheet, user]);

  const extraData = useMemo(() => ({ liked, myComments, muted, stableIndex }), [liked, myComments, muted, stableIndex]);

  const renderItem = useCallback(
    ({ item, index }: { item: ApiReel; index: number }) => {
      const role = playerRoleForIndex(index, stableIndex);
      const play = shouldPlayReel({
        tabFocused,
        reelsPageVisible,
        reelIsActive: role === 'active',
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
            onToggleLike={toggleLike}
            onOpenComments={openComments}
            onShare={(r) => shareReel(r)}
            onOpenProfile={(r) =>
              openHumanProfile(navigation, {
                username: r.authorProfileUsername || r.username || undefined,
                userId: r.userId,
              })
            }
            onOpenPet={(r) => {
              if (r.petId) navigation.navigate('PetProfile', { petId: r.petUsername || r.petId });
            }}
            onToggleMute={() => setMuted((m) => !m)}
          />
        </View>
      );
    },
    [stableIndex, tabFocused, reelsPageVisible, foreground, muted, liked, myComments, toggleLike, openComments, navigation, viewportH]
  );

  const keyExtractor = useCallback((item: ApiReel) => item.id, []);
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: viewportH, offset: viewportH * index, index }),
    [viewportH]
  );

  return (
    <View
      style={styles.root}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0 && h !== viewportH) setViewportH(h);
      }}
    >
      {viewportH > 0 && reels.length > 0 ? (
        <FlatList
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
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onEndReached={() => {
            if (hasMore) loadPage(false);
          }}
          onEndReachedThreshold={0.4}
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          windowSize={3}
          removeClippedSubviews={false}
        />
      ) : (
        <View style={styles.empty}>
          <Ionicons name="film-outline" size={40} color="#fff" />
          <Text style={styles.emptyTitle}>Reels de mascotas</Text>
          <Text style={styles.emptySub}>Todavía no hay videos listos. Publicá el primero.</Text>
        </View>
      )}

      <Pressable
        style={[styles.fab, { top: insets.top + 10 }]}
        onPress={() => navigation.navigate('CreateReel')}
        accessibilityLabel="Crear Reel"
      >
        <Ionicons name="add" size={26} color="#fff" />
      </Pressable>

      {sheet ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheet}
        >
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Comentarios</Text>
            <Pressable onPress={() => setSheet(null)}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
          <FlatList
            data={comments}
            keyExtractor={(c) => c.id}
            style={{ maxHeight: 240 }}
            renderItem={({ item }) => (
              <Text style={styles.comment}>
                <Text style={{ fontWeight: '800' }}>@{item.username}</Text> {item.text}
              </Text>
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
            />
            <Pressable onPress={sendComment} disabled={!draft.trim()}>
              {false ? <ActivityIndicator /> : <Ionicons name="send" size={20} color={colors.primary} />}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  emptyTitle: { color: '#fff', fontWeight: '800', fontSize: 20 },
  emptySub: { color: '#ccc', textAlign: 'center' },
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
    maxHeight: '50%',
  },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { fontWeight: '800', color: colors.text },
  comment: { color: colors.text, marginBottom: 8 },
  commentMuted: { color: colors.textMuted },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, color: colors.text },
});
