import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  AppState,
  Alert,
  Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { db, type ApiStory } from '../lib/db';
import { useStore } from '../lib/store';
import { STORY_EXPIRED_MESSAGE, nextStoryIndex } from '../lib/stories';
import {
  STORY_HOLD_MIN_DURATION_MS,
  STORY_PAN_ACTIVE_OFFSET_X,
  STORY_PAN_FAIL_OFFSET_Y,
  applyStoryGesture,
  classifyStorySwipe,
  remainingProgressMs,
  storyChromeInsets,
  storyChromeTopInset,
  storyExplicitSurfaceStyle,
  storyHasExplicitSurface,
  storyLayoutBoxesEqual,
  storyLayoutToBox,
  storyProgressDurationMs,
  storyStageInsets,
  type StoryLayoutBox,
} from '../lib/storyViewerUi';
import { notifyStoriesChanged } from '../lib/storyRailRefresh';
import { openStoryAuthorProfile, openStoryProtagonistProfile, resolveStoryAuthorIdentity } from '../lib/storyAuthor';
import { thumb, userFallbackAvatar } from '../lib/images';
import StoryProgress from '../components/StoryProgress';
import StoryCommentsSheet from '../components/StoryCommentsSheet';

function StoryVideo({ uri, paused }: { uri: string; paused: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = false;
    p.staysActiveInBackground = false;
  });
  useEffect(() => {
    if (paused) {
      try {
        player.pause();
      } catch {}
    } else {
      try {
        player.play();
      } catch {}
    }
  }, [player, paused]);
  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [player]);
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
      pointerEvents="none"
    />
  );
}

export default function StoryViewerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const stage = storyStageInsets(insets);
  const chrome = storyChromeInsets(insets);
  const chromeTop = storyChromeTopInset(insets);
  const { user } = useStore();
  const [stories, setStories] = useState<ApiStory[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [holdingJs, setHoldingJs] = useState(false);
  const [appActive, setAppActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [error, setError] = useState('');
  const indexRef = useRef(0);
  const storiesLenRef = useRef(0);
  const commentsOpenRef = useRef(false);
  const [stageBox, setStageBox] = useState<StoryLayoutBox | null>(null);
  const progress = useSharedValue(0);
  const isHolding = useSharedValue(0);
  const suppressResume = useSharedValue(0);
  const durationSv = useSharedValue(5000);
  const reactFrozenSv = useSharedValue(1);
  indexRef.current = index;
  storiesLenRef.current = stories.length;
  commentsOpenRef.current = commentsOpen;

  const params = route.params || {};
  const current = stories[index] || null;
  const duration = current ? storyProgressDurationMs(current.mediaType, current.durationMs) : 5000;
  const reactFrozen = paused || commentsOpen || !appActive || loading;
  const videoPaused = reactFrozen || holdingJs;
  durationSv.value = duration;
  reactFrozenSv.value = reactFrozen ? 1 : 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res =
        params.source === 'breed'
          ? await db.storyBreedFeed(params.breedSpecies, params.breedKey)
          : await db.storyGroup({
              source: params.source === 'self' ? 'self' : 'identity',
              authorUserId: params.authorUserId,
              authorProfileId: params.authorProfileId,
              authorProfileType: params.authorProfileType,
              authorPetId: params.authorPetId,
            });
      const list = res.stories || [];
      if (!list.length) {
        setError(STORY_EXPIRED_MESSAGE);
        setStories([]);
        return;
      }
      let start = 0;
      if (params.startStoryId) {
        const found = list.findIndex((s) => s.id === params.startStoryId);
        if (found >= 0) start = found;
      }
      setStories(list);
      setIndex(start);
      progress.value = 0;
    } catch (e: any) {
      setError(e?.message || STORY_EXPIRED_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, [params, progress]);

  useEffect(() => {
    load();
  }, [load]);

  const mark = useCallback(
    async (story: ApiStory) => {
      if (!user) return;
      try {
        await db.markStoryViewed(story.id);
      } catch (e: any) {
        if (e?.status === 410) setError(STORY_EXPIRED_MESSAGE);
      }
    },
    [user]
  );

  const go = useCallback(
    (next: number | null) => {
      if (next == null) {
        navigation.goBack();
        return;
      }
      cancelAnimation(progress);
      progress.value = 0;
      setIndex(next);
    },
    [navigation, progress]
  );

  const advance = useCallback(() => {
    go(nextStoryIndex(index, stories.length));
  }, [go, index, stories.length]);

  useEffect(() => {
    if (!current) return;
    mark(current);
  }, [current, mark]);

  useEffect(() => {
    suppressResume.value = 0;
    if (!current || reactFrozen) {
      cancelAnimation(progress);
      return;
    }
    if (isHolding.value) {
      cancelAnimation(progress);
      return;
    }
    const remaining = remainingProgressMs(progress.value, duration);
    if (remaining <= 16) {
      advance();
      return;
    }
    progress.value = withTiming(1, { duration: remaining, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(advance)();
    });
    return () => {
      cancelAnimation(progress);
    };
  }, [current, reactFrozen, duration, advance, progress, isHolding, suppressResume]);

  useAnimatedReaction(
    () => isHolding.value,
    (holding, previous) => {
      if (holding) {
        cancelAnimation(progress);
        runOnJS(setHoldingJs)(true);
        return;
      }
      runOnJS(setHoldingJs)(false);
      if (previous !== 1) return;
      if (suppressResume.value) return;
      if (reactFrozenSv.value) return;
      const remaining = Math.max(0, (1 - progress.value) * durationSv.value);
      if (remaining <= 16) {
        runOnJS(advance)();
        return;
      }
      progress.value = withTiming(1, { duration: remaining, easing: Easing.linear }, (finished) => {
        if (finished) runOnJS(advance)();
      });
    }
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    RNStatusBar.setBarStyle('light-content', true);
    RNStatusBar.setBackgroundColor('transparent', true);
    RNStatusBar.setTranslucent(true);
    return () => {
      RNStatusBar.setBarStyle('dark-content', true);
      RNStatusBar.setBackgroundColor('#ffffff', true);
      RNStatusBar.setTranslucent(true);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setPaused(false);
      return () => {
        setPaused(true);
      };
    }, [])
  );

  const author = useMemo(() => (current ? resolveStoryAuthorIdentity(current) : null), [current]);
  const headerName = author?.username || (current ? 'Historia' : '');
  const headerAvatar = author?.avatarUrl || (headerName ? userFallbackAvatar(headerName) : '');

  const openAuthor = useCallback(() => {
    if (!current) return;
    setPaused(true);
    openStoryAuthorProfile(navigation, current);
  }, [current, navigation]);

  const openProtagonist = useCallback(() => {
    if (!current?.protagonistPetId) return;
    setPaused(true);
    openStoryProtagonistProfile(navigation, current);
  }, [current, navigation]);

  const close = useCallback(() => navigation.goBack(), [navigation]);

  const expired = useCallback(() => {
    setPaused(true);
    Alert.alert('Historia', STORY_EXPIRED_MESSAGE, [
      { text: 'OK', onPress: () => go(nextStoryIndex(index, stories.length)) },
    ]);
  }, [go, index, stories.length]);

  const remove = useCallback(() => {
    if (!current) return;
    Alert.alert('Eliminar historia', 'Se va a borrar ahora, incluido el medio.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await db.deleteStory(current.id);
            notifyStoriesChanged();
            const next = stories.filter((s) => s.id !== current.id);
            if (!next.length) {
              navigation.goBack();
              return;
            }
            cancelAnimation(progress);
            progress.value = 0;
            setStories(next);
            setIndex(Math.min(index, next.length - 1));
          } catch (e: any) {
            Alert.alert('No se pudo borrar', e?.message || 'Intentá de nuevo.');
          }
        },
      },
    ]);
  }, [current, stories, index, navigation, progress]);

  const report = useCallback(() => {
    if (!current) return;
    db.reportStory(current.id).catch(() => {});
    Alert.alert('Gracias', 'Recibimos el reporte.');
  }, [current]);

  const onPanEnd = useCallback(
    (deltaX: number, deltaY: number) => {
      const result = applyStoryGesture(
        classifyStorySwipe({
          deltaX,
          deltaY,
          commentsOpen: commentsOpenRef.current,
        }),
        indexRef.current,
        storiesLenRef.current
      );
      if (commentsOpenRef.current) return;
      if (result.action === 'previous' || result.action === 'next') {
        suppressResume.value = 1;
        go(result.nextIndex);
        return;
      }
      if (result.action === 'close') {
        suppressResume.value = 1;
        go(null);
      }
    },
    [go, suppressResume]
  );

  const storyGestures = useMemo(() => {
    const hold = Gesture.LongPress()
      .minDuration(STORY_HOLD_MIN_DURATION_MS)
      .maxDistance(9999)
      .enabled(!commentsOpen)
      .onBegin(() => {
        isHolding.value = 1;
      })
      .onFinalize(() => {
        isHolding.value = 0;
      });

    const pan = Gesture.Pan()
      .activeOffsetX([-STORY_PAN_ACTIVE_OFFSET_X, STORY_PAN_ACTIVE_OFFSET_X])
      .failOffsetY([-STORY_PAN_FAIL_OFFSET_Y, STORY_PAN_FAIL_OFFSET_Y])
      .enabled(!commentsOpen)
      .onEnd((event) => {
        runOnJS(onPanEnd)(event.translationX, event.translationY);
      })
      .onFinalize(() => {
        isHolding.value = 0;
      });

    return Gesture.Simultaneous(hold, pan);
  }, [commentsOpen, isHolding, onPanEnd]);

  if (loading) {
    return (
      <View style={styles.black}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!current) {
    return (
      <View style={[styles.black, chrome]}>
        <Text style={styles.error}>{error || STORY_EXPIRED_MESSAGE}</Text>
        <Pressable onPress={close} style={styles.closeBtn} accessibilityLabel="Cerrar">
          <Text style={{ color: '#fff' }}>Cerrar</Text>
        </Pressable>
      </View>
    );
  }

  const mediaUri = current.mediaType === 'video' ? current.hlsUrl : current.imageUrl;
  const owner = !!(user && current.authorUserId === user.id);
  const subline = [current.protagonistName, current.breedLabel].filter(Boolean).join(' · ');
  const surfaceStyle = storyExplicitSurfaceStyle(stageBox);
  const hasSurface = storyHasExplicitSurface(stageBox);

  return (
    <View style={styles.black}>
      <StatusBar style="light" backgroundColor="transparent" translucent />
      <View
        style={[styles.stageShell, stage]}
        collapsable={false}
        onLayout={(event) => {
          const next = storyLayoutToBox(event.nativeEvent.layout);
          setStageBox((prev) => (storyLayoutBoxesEqual(prev, next) ? prev : next));
        }}
      >
        {hasSurface ? (
          <GestureDetector gesture={storyGestures}>
            <View
              collapsable={false}
              style={[styles.stageSurface, surfaceStyle]}
              accessibilityLabel="Controles de historia"
            >
              <View style={styles.media} pointerEvents="none">
                {current.mediaType === 'video' && mediaUri ? (
                  <StoryVideo uri={mediaUri} paused={videoPaused} />
                ) : (
                  <Image
                    source={{ uri: mediaUri || current.thumbnailUrl || '' }}
                    style={styles.mediaFill}
                    contentFit="cover"
                    pointerEvents="none"
                  />
                )}
                <LinearGradient colors={['rgba(0,0,0,0.5)', 'transparent']} style={styles.topFade} pointerEvents="none" />
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.45)']} style={styles.bottomFade} pointerEvents="none" />
              </View>
            </View>
          </GestureDetector>
        ) : null}
        <View style={[styles.topChrome, { paddingTop: chromeTop }]} pointerEvents="box-none">
          <StoryProgress count={stories.length} index={index} progress={progress} />
          <View style={styles.topRow}>
            <Pressable style={styles.identity} onPress={openAuthor} accessibilityLabel="Ver perfil del autor">
              <Image source={{ uri: thumb(headerAvatar, 80) }} style={styles.avatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {headerName}
                </Text>
                {subline ? (
                  current.protagonistPetId ? (
                    <Pressable onPress={openProtagonist} accessibilityLabel="Ver perfil del protagonista">
                      <Text style={styles.meta} numberOfLines={1}>
                        {subline}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.meta} numberOfLines={1}>
                      {subline}
                    </Text>
                  )
                ) : null}
              </View>
            </Pressable>
            <View style={styles.topActions}>
              {owner ? (
                <Pressable onPress={remove} accessibilityLabel="Más opciones" hitSlop={10}>
                  <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
                </Pressable>
              ) : (
                <Pressable onPress={report} accessibilityLabel="Reportar" hitSlop={10}>
                  <Ionicons name="flag-outline" size={20} color="#fff" />
                </Pressable>
              )}
              <Pressable onPress={close} accessibilityLabel="Cerrar" hitSlop={10}>
                <Ionicons name="close" size={26} color="#fff" />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.bottomChrome} pointerEvents="box-none">
          {current.caption ? <Text style={styles.caption} pointerEvents="none">{current.caption}</Text> : null}
          <Pressable style={styles.commentBtn} onPress={() => setCommentsOpen(true)} accessibilityLabel="Comentar">
            <Ionicons name="chatbubble-outline" size={20} color="#fff" />
            <Text style={styles.commentLabel}>Comentar</Text>
          </Pressable>
        </View>
      </View>
      <StoryCommentsSheet
        storyId={current.id}
        visible={commentsOpen}
        canComment={!!user}
        onClose={() => setCommentsOpen(false)}
        onExpired={expired}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  stageShell: { flex: 1, overflow: 'visible' },
  stageSurface: { overflow: 'hidden' },
  media: { ...StyleSheet.absoluteFillObject },
  mediaFill: { width: '100%', height: '100%' },
  topFade: { position: 'absolute', top: 0, left: 0, right: 0, height: 140 },
  bottomFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 180 },
  topChrome: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, elevation: 8 },
  bottomChrome: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    elevation: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 12 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)' },
  name: { color: '#fff', fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  meta: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 1, textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 3 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  caption: { color: '#fff', fontSize: 15, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  commentBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  commentLabel: { color: '#fff', fontWeight: '600' },
  error: { color: '#fff', textAlign: 'center', padding: 24 },
  closeBtn: { alignSelf: 'center', padding: 12 },
});
