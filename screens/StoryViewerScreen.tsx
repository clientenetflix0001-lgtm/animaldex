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
import * as Updates from 'expo-updates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, cancelAnimation, runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';
import { db, type ApiStory } from '../lib/db';
import { useStore } from '../lib/store';
import { STORY_EXPIRED_MESSAGE, nextStoryIndex } from '../lib/stories';
import {
  applyStoryGesture,
  classifyStorySwipe,
  remainingProgressMs,
  storyChromeInsets,
  storyChromeTopInset,
  storyProgressDurationMs,
  storyStageInsets,
} from '../lib/storyViewerUi';
import {
  STORY_GESTURE_DEBUG_ACTION_MS,
  STORY_GESTURE_DEBUG_SOLID,
  STORY_GESTURE_DEBUG_TOUCH_FILL,
  formatStoryDebugBox,
  formatStoryGestureDebugAction,
  storyGestureDebugEnabled,
  storyGestureDebugPhaseIndex,
  type StoryDebugBox,
} from '../lib/storyGestureDebug';
import { notifyStoriesChanged } from '../lib/storyRailRefresh';
import { thumb, userFallbackAvatar } from '../lib/images';
import StoryProgress from '../components/StoryProgress';
import StoryCommentsSheet from '../components/StoryCommentsSheet';
import StoryGestureDebugHud from '../components/StoryGestureDebugHud';

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
  const [appActive, setAppActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [error, setError] = useState('');
  const indexRef = useRef(0);
  const storiesLenRef = useRef(0);
  const commentsOpenRef = useRef(false);
  const debugActionClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debugAction, setDebugAction] = useState('NONE');
  const [stageBox, setStageBox] = useState<StoryDebugBox | null>(null);
  const [touchBox, setTouchBox] = useState<StoryDebugBox | null>(null);
  const [rawTap, setRawTap] = useState(false);
  const [rawPress, setRawPress] = useState(false);
  const progress = useSharedValue(0);
  const debugDx = useSharedValue(0);
  const debugDy = useSharedValue(0);
  const debugPhase = useSharedValue(0);
  const debugDown = useSharedValue(0);
  indexRef.current = index;
  storiesLenRef.current = stories.length;
  commentsOpenRef.current = commentsOpen;
  const debugOn = storyGestureDebugEnabled(__DEV__, Updates.channel);

  const params = route.params || {};
  const current = stories[index] || null;
  const duration = current ? storyProgressDurationMs(current.mediaType, current.durationMs) : 5000;
  const frozen = paused || commentsOpen || !appActive || loading;

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
    if (!current || frozen) {
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
  }, [current, frozen, duration, advance, progress]);

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

  const headerName = useMemo(() => {
    if (!current) return '';
    return current.username || current.authorPetName || current.authorProfileUsername || current.userName || 'Historia';
  }, [current]);

  const headerAvatar = current
    ? current.authorPetAvatar ||
      current.authorProfileAvatar ||
      current.userAvatar ||
      current.protagonistAvatar ||
      userFallbackAvatar(headerName)
    : '';

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

  const finishTouch = useCallback(
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
      setDebugAction(formatStoryGestureDebugAction(result.action));
      if (debugActionClearRef.current) clearTimeout(debugActionClearRef.current);
      debugActionClearRef.current = setTimeout(() => setDebugAction('NONE'), STORY_GESTURE_DEBUG_ACTION_MS);
      if (commentsOpenRef.current) {
        setPaused(false);
        return;
      }
      setPaused(false);
      if (result.action === 'previous' || result.action === 'next') {
        go(result.nextIndex);
        return;
      }
      if (result.action === 'close') {
        go(null);
      }
    },
    [go]
  );

  useEffect(() => {
    if (!debugOn) return;
    console.log('[Animaldex Stories] GESTURE-V6 HITTEST', {
      updateId: Updates.updateId,
      runtimeVersion: Updates.runtimeVersion,
      channel: Updates.channel,
      isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    });
  }, [debugOn]);

  const storyPan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .enabled(!commentsOpen)
        .runOnJS(true)
        .onBegin((event) => {
          debugDx.value = event.translationX;
          debugDy.value = event.translationY;
          debugPhase.value = storyGestureDebugPhaseIndex('BEGAN');
          debugDown.value = 1;
          setPaused(true);
        })
        .onStart((event) => {
          debugDx.value = event.translationX;
          debugDy.value = event.translationY;
          debugPhase.value = storyGestureDebugPhaseIndex('ACTIVE');
        })
        .onUpdate((event) => {
          debugDx.value = event.translationX;
          debugDy.value = event.translationY;
          debugPhase.value = storyGestureDebugPhaseIndex('ACTIVE');
        })
        .onEnd((event) => {
          debugDx.value = event.translationX;
          debugDy.value = event.translationY;
          debugPhase.value = storyGestureDebugPhaseIndex('END');
        })
        .onFinalize((event, success) => {
          debugDx.value = event.translationX;
          debugDy.value = event.translationY;
          debugDown.value = 0;
          if (!success) debugPhase.value = storyGestureDebugPhaseIndex('CANCEL');
          finishTouch(event.translationX, event.translationY);
        }),
    [commentsOpen, debugDx, debugDy, debugDown, debugPhase, finishTouch]
  );

  const debugTap = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .onEnd(() => {
          setRawTap(true);
        }),
    []
  );
  const detectorGesture = debugOn ? debugTap : storyPan;

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

  return (
    <View style={styles.black}>
      <StatusBar style="light" backgroundColor="transparent" translucent />
      <View
        style={[styles.stage, stage]}
        onLayout={(event) => setStageBox(event.nativeEvent.layout)}
      >
        <View style={styles.media} pointerEvents="none">
          {debugOn && STORY_GESTURE_DEBUG_SOLID ? (
            <View style={[styles.mediaFill, styles.debugSolid]} />
          ) : current.mediaType === 'video' && mediaUri ? (
            <StoryVideo uri={mediaUri} paused={frozen} />
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

        <GestureDetector gesture={detectorGesture}>
          <View
            style={[styles.touchLayer, debugOn && styles.touchLayerDebug]}
            collapsable={false}
            accessibilityLabel="Controles de historia"
            onLayout={(event) => setTouchBox(event.nativeEvent.layout)}
          >
            {debugOn ? (
              <Pressable
                style={styles.rawPressChip}
                onPressIn={() => setRawPress(true)}
                accessibilityLabel="RAW PRESS"
              >
                <Text style={styles.rawPressLabel}>RAW PRESS</Text>
              </Pressable>
            ) : null}
          </View>
        </GestureDetector>
        <StoryGestureDebugHud
          visible={debugOn}
          top={chromeTop + 4}
          updateId={Updates.updateId}
          channel={Updates.channel}
          runtimeVersion={Updates.runtimeVersion}
          embedded={Updates.isEmbeddedLaunch}
          paused={paused}
          frozen={frozen}
          action={debugAction}
          storyIndex={index}
          storyCount={stories.length}
          debugDx={debugDx}
          debugDy={debugDy}
          debugProgress={progress}
          debugPhase={debugPhase}
          debugDown={debugDown}
          stageBox={formatStoryDebugBox(stageBox)}
          touchBox={formatStoryDebugBox(touchBox)}
          rawTap={rawTap}
          rawPress={rawPress}
        />

        <View style={[styles.topChrome, { paddingTop: chromeTop }]} pointerEvents="box-none">
          <StoryProgress count={stories.length} index={index} progress={progress} />
          <View style={styles.topRow}>
            <View style={styles.identity} pointerEvents="none">
              <Image source={{ uri: thumb(headerAvatar, 80) }} style={styles.avatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {headerName}
                </Text>
                {subline ? (
                  <Text style={styles.meta} numberOfLines={1}>
                    {subline}
                  </Text>
                ) : null}
              </View>
            </View>
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
  stage: { flex: 1, overflow: 'hidden' },
  media: { ...StyleSheet.absoluteFillObject },
  mediaFill: { width: '100%', height: '100%' },
  topFade: { position: 'absolute', top: 0, left: 0, right: 0, height: 140 },
  bottomFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 180 },
  touchLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    elevation: 4,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  touchLayerDebug: {
    backgroundColor: STORY_GESTURE_DEBUG_TOUCH_FILL,
  },
  rawPressChip: {
    minWidth: 120,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,0,0.85)',
    borderRadius: 8,
  },
  rawPressLabel: {
    color: '#111',
    fontWeight: '800',
    fontSize: 13,
    textAlign: 'center',
  },
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
  debugSolid: { backgroundColor: '#16324F' },
});
