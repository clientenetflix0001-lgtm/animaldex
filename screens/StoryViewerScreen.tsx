import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  AppState,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { db, type ApiStory } from '../lib/db';
import { useStore } from '../lib/store';
import { STORY_EXPIRED_MESSAGE, nextStoryIndex, prevStoryIndex, storyProgressMs } from '../lib/stories';
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
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />;
}

export default function StoryViewerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useStore();
  const [stories, setStories] = useState<ApiStory[]>([]);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(Date.now());
  const elapsedRef = useRef(0);

  const params = route.params || {};
  const current = stories[index] || null;
  const duration = current ? storyProgressMs(current.mediaType, current.durationMs) : 5000;

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
    } catch (e: any) {
      setError(e?.message || STORY_EXPIRED_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, [params]);

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
      setIndex(next);
      setProgress(0);
      elapsedRef.current = 0;
      startedAt.current = Date.now();
    },
    [navigation]
  );

  useEffect(() => {
    if (!current) return;
    mark(current);
  }, [current, mark]);

  useEffect(() => {
    if (!current || paused || commentsOpen || loading) return;
    startedAt.current = Date.now() - elapsedRef.current;
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      elapsedRef.current = elapsed;
      const p = elapsed / duration;
      setProgress(Math.min(1, p));
      if (p >= 1) {
        if (timerRef.current) clearInterval(timerRef.current);
        go(nextStoryIndex(index, stories.length));
      }
    }, 50);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [current, paused, commentsOpen, loading, duration, index, stories.length, go]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setPaused(true);
      else setPaused(false);
    });
    return () => sub.remove();
  }, []);

  const headerName = useMemo(() => {
    if (!current) return '';
    return (
      current.authorPetName ||
      current.authorProfileName ||
      current.userName ||
      current.username ||
      current.breedLabel ||
      'Historia'
    );
  }, [current]);

  const close = useCallback(() => navigation.goBack(), [navigation]);

  const expired = useCallback(() => {
    setPaused(true);
    Alert.alert('Historia', STORY_EXPIRED_MESSAGE, [{ text: 'OK', onPress: () => go(nextStoryIndex(index, stories.length)) }]);
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
            const next = stories.filter((s) => s.id !== current.id);
            if (!next.length) {
              navigation.goBack();
              return;
            }
            setStories(next);
            setIndex(Math.min(index, next.length - 1));
          } catch (e: any) {
            Alert.alert('No se pudo borrar', e?.message || 'Intentá de nuevo.');
          }
        },
      },
    ]);
  }, [current, stories, index, navigation]);

  const report = useCallback(() => {
    if (!current) return;
    db.reportStory(current.id).catch(() => {});
    Alert.alert('Gracias', 'Recibimos el reporte.');
  }, [current]);

  if (loading) {
    return (
      <View style={styles.black}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!current) {
    return (
      <SafeAreaView style={styles.black}>
        <Text style={styles.error}>{error || STORY_EXPIRED_MESSAGE}</Text>
        <Pressable onPress={close} style={styles.closeBtn}>
          <Text style={{ color: '#fff' }}>Cerrar</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const mediaUri = current.mediaType === 'video' ? current.hlsUrl : current.imageUrl;
  const owner = !!(user && current.authorUserId === user.id);

  return (
    <View style={styles.black}>
      {current.mediaType === 'video' && mediaUri && !paused ? (
        <StoryVideo uri={mediaUri} paused={paused || commentsOpen} />
      ) : current.mediaType === 'video' && mediaUri && paused ? (
        <StoryVideo uri={mediaUri} paused />
      ) : (
        <Image source={{ uri: mediaUri || current.thumbnailUrl || '' }} style={StyleSheet.absoluteFill} contentFit="contain" />
      )}
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <StoryProgress count={stories.length} index={index} progress={progress} />
        <View style={styles.topRow}>
          <Text style={styles.name} numberOfLines={1}>
            {headerName}
          </Text>
          <View style={styles.topActions}>
            {owner ? (
              <Pressable onPress={remove} accessibilityLabel="Más opciones">
                <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
              </Pressable>
            ) : (
              <Pressable onPress={report} accessibilityLabel="Reportar">
                <Ionicons name="flag-outline" size={20} color="#fff" />
              </Pressable>
            )}
            <Pressable onPress={close} accessibilityLabel="Cerrar">
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
          </View>
        </View>
        {current.caption ? <Text style={styles.caption}>{current.caption}</Text> : null}
        <View style={styles.taps}>
          <Pressable
            style={styles.tapLeft}
            onPress={() => go(prevStoryIndex(index))}
            onLongPress={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
          />
          <Pressable
            style={styles.tapRight}
            onPress={() => go(nextStoryIndex(index, stories.length))}
            onLongPress={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
          />
        </View>
        <Pressable style={styles.commentBtn} onPress={() => setCommentsOpen(true)}>
          <Ionicons name="chatbubble-outline" size={20} color="#fff" />
          <Text style={styles.commentLabel}>Comentar</Text>
        </Pressable>
      </SafeAreaView>
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
  black: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  overlay: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  name: { color: '#fff', fontWeight: '700', flex: 1, marginRight: 12 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  caption: { color: '#fff', paddingHorizontal: 16, marginTop: 8 },
  taps: { ...StyleSheet.absoluteFillObject, flexDirection: 'row' },
  tapLeft: { flex: 1 },
  tapRight: { flex: 1 },
  commentBtn: {
    position: 'absolute',
    left: 16,
    bottom: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentLabel: { color: '#fff', fontWeight: '600' },
  error: { color: '#fff', textAlign: 'center', padding: 24 },
  closeBtn: { alignSelf: 'center', padding: 12 },
});
