// ============================================================
// Animaldex — Detalle de un Reel (enlace directo /r/:id)
// ============================================================
// Se usa cuando alguien abre un enlace de "Difundir" compartido
// desde fuera de la app, o al agregar un Reel nuevo. Muestra el
// mismo reproductor y las mismas acciones que en el feed vertical.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute, RouteProp, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { db, ApiReel } from '../lib/db';
import { useStore } from '../lib/store';
import { ReelCard } from '../components/ReelCard';
import { ReelCommentsSheet } from '../components/ReelCommentsSheet';
import { shareReel } from '../lib/share';
import { colors } from '../lib/theme';
import { RootStackParamList } from '../lib/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'ReelDetail'>;

export default function ReelDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const isFocused = useIsFocused();
  const { user } = useStore();
  const { height } = useWindowDimensions();
  const { reelId } = route.params;

  const [reel, setReel] = useState<ApiReel | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [containerHeight, setContainerHeight] = useState(0);

  const load = useCallback(async () => {
    try {
      const { reel: r } = await db.reelDetail(reelId);
      setReel(r);
    } catch {
      setReel(null);
    } finally {
      setLoading(false);
    }
  }, [reelId]);

  useEffect(() => {
    load();
    db.reelView(reelId).catch(() => {});
  }, [load, reelId]);

  const handleToggleLike = useCallback(() => {
    setReel((prev) => (prev ? { ...prev, isLiked: !prev.isLiked, likeCount: prev.likeCount + (prev.isLiked ? -1 : 1) } : prev));
    if (reel) db.reelLike(reelId, !reel.isLiked).catch(() => {});
  }, [reel, reelId]);

  const handleShare = useCallback(() => {
    if (reel) {
      shareReel(reel);
      db.reelShare(reel.id).catch(() => {});
    }
  }, [reel]);

  const handleReport = useCallback(() => {
    db.reportReel(reelId, 'Contenido reportado desde el detalle').catch(() => {});
  }, [reelId]);

  const handleDelete = useCallback(async () => {
    await db.deleteReel(reelId).catch(() => {});
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Tabs');
  }, [reelId, navigation]);

  const onCommentAdded = useCallback(() => {
    setReel((prev) => (prev ? { ...prev, commentCount: prev.commentCount + 1 } : prev));
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeLight} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!reel) {
    return (
      <SafeAreaView style={styles.safeLight} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <Text style={styles.notFoundEmoji}>🎬</Text>
          <Text style={styles.notFoundTitle}>Reel no encontrado</Text>
          <Text style={styles.notFoundText}>Este enlace ya no está disponible.</Text>
          <Pressable
            style={styles.notFoundBtn}
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Tabs'))}
          >
            <Text style={styles.notFoundBtnText}>Volver</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeDark} edges={['top', 'bottom']}>
      {isFocused && <StatusBar style="light" />}
      <View style={styles.closeBtn}>
        <Pressable
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Tabs'))}
          hitSlop={10}
          style={styles.closeIconWrap}
        >
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
      </View>
      <View
        style={{ flex: 1 }}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && h !== containerHeight) setContainerHeight(h);
        }}
      >
        {containerHeight > 0 && (
          <ReelCard
            reel={reel}
            height={containerHeight}
            isActive
            shouldMount
            isOwn={!!user && reel.userId === user.id}
            onToggleLike={handleToggleLike}
            onOpenComments={() => setCommentsOpen(true)}
            onShare={handleShare}
            onReport={handleReport}
            onDelete={handleDelete}
          />
        )}
      </View>

      <ReelCommentsSheet
        visible={commentsOpen}
        reelId={reel.id}
        onClose={() => setCommentsOpen(false)}
        onCommentAdded={onCommentAdded}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeLight: { flex: 1, backgroundColor: colors.bg },
  safeDark: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  notFoundEmoji: { fontSize: 48 },
  notFoundTitle: { fontWeight: '800', fontSize: 18, color: colors.text },
  notFoundText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  notFoundBtn: { marginTop: 12, backgroundColor: colors.primary, paddingHorizontal: 26, paddingVertical: 11, borderRadius: 999 },
  notFoundBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  closeBtn: {
    position: 'absolute',
    top: 12,
    left: 16,
    zIndex: 10,
  },
  closeIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
