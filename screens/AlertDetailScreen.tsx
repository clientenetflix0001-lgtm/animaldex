// ============================================================
// Animaldex — Detalle de alerta + comentarios
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { db, ApiAlert, ApiComment, timeAgoMinutes } from '../lib/db';
import { useStore } from '../lib/store';
import { shareAlert } from '../lib/share';
import { ALERT_TYPES, speciesEmoji, speciesLabel } from '../lib/alerts';
import { thumb, large, userFallbackAvatar } from '../lib/images';
import { formatCount, formatTime } from '../lib/data';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'AlertDetail'>;

export default function AlertDetailScreen() {
  const route = useRoute<Rt>();
  const navigation = useNavigation<Nav>();
  const { user } = useStore();
  const { alertId } = route.params;

  const [alert, setAlert] = useState<ApiAlert | null>(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ alert: a }, { comments: c }] = await Promise.all([
        db.alertDetail(alertId),
        db.alertComments(alertId),
      ]);
      setAlert(a);
      setComments(c);
    } catch {
      setAlert(null);
    } finally {
      setLoading(false);
    }
  }, [alertId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleLike = useCallback(() => {
    setAlert((prev) =>
      prev ? { ...prev, isLiked: !prev.isLiked, likeCount: prev.likeCount + (prev.isLiked ? -1 : 1) } : prev
    );
    if (alert) db.alertLike(alertId, !alert.isLiked).catch(() => {});
  }, [alert, alertId]);

  const handleShare = useCallback(async () => {
    if (!alert || sharing) return;
    setSharing(true);
    try {
      await shareAlert(alert);
    } finally {
      setSharing(false);
    }
  }, [alert, sharing]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    try {
      await db.alertComment(alertId, text);
      const { comments: c } = await db.alertComments(alertId);
      setComments(c);
      setAlert((prev) => (prev ? { ...prev, commentCount: prev.commentCount + 1 } : prev));
    } catch {}
    setSending(false);
  }, [draft, alertId, sending]);

  const displayComments = useMemo(
    () =>
      comments.map((c) => ({
        id: c.id,
        name: c.userName,
        avatarUri: c.avatarUrl ?? userFallbackAvatar(c.username),
        text: c.text,
        minutesAgo: timeAgoMinutes(c.createdAt),
        mine: user?.id === c.userId,
      })),
    [comments, user]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!alert) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={styles.notFoundEmoji}>🐾</Text>
          <Text style={styles.notFoundTitle}>Alerta no encontrada</Text>
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

  const typeConfig = ALERT_TYPES[alert.type] ?? ALERT_TYPES.lost;
  const avatar = alert.userAvatar ?? userFallbackAvatar(alert.username ?? 'usuario');

  const header = (
    <View>
      <View style={[styles.badgeRow, { backgroundColor: `${typeConfig.color}14` }]}>
        <Text style={[styles.badgeText, { color: typeConfig.color }]}>
          {typeConfig.emoji} {speciesLabel(alert.species).toUpperCase()} {typeConfig.label}
        </Text>
      </View>

      <View style={styles.userRow}>
        <Image source={{ uri: thumb(avatar, 100) }} style={styles.avatar} transition={200} />
        <View style={{ flex: 1 }}>
          <Text style={styles.petName}>
            {alert.petName ? alert.petName : speciesLabel(alert.species)} {speciesEmoji(alert.species)}
          </Text>
          <View style={styles.locRow}>
            <Ionicons name="location" size={12} color={colors.textMuted} />
            <Text style={styles.locText}>{alert.locality}</Text>
          </View>
        </View>
        <Text style={styles.time}>{formatTime(timeAgoMinutes(alert.createdAt))}</Text>
      </View>

      <Image
        source={{ uri: large(alert.image) }}
        style={styles.image}
        contentFit="cover"
        transition={300}
        placeholder={{ blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj' }}
      />

      <View style={styles.actions}>
        <Pressable onPress={handleToggleLike} hitSlop={8} style={styles.actionBtn}>
          <Ionicons
            name={alert.isLiked ? 'heart' : 'heart-outline'}
            size={27}
            color={alert.isLiked ? colors.heart : colors.text}
          />
          <Text style={styles.actionCount}>{formatCount(alert.likeCount)}</Text>
        </Pressable>
        <View style={styles.actionBtn}>
          <Ionicons name="chatbubble-outline" size={24} color={colors.text} />
          <Text style={styles.actionCount}>{formatCount(alert.commentCount)}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <Pressable onPress={handleShare} disabled={sharing} style={styles.difundirBtn}>
          <Ionicons name="paw" size={15} color="#fff" />
          <Text style={styles.difundirText}>DIFUNDIR</Text>
        </Pressable>
      </View>

      <Text style={styles.description}>{alert.description}</Text>
      {alert.username && <Text style={styles.postedBy}>Publicado por @{alert.username}</Text>}

      <Text style={styles.commentsTitle}>
        Comentarios {displayComments.length > 0 ? `(${displayComments.length})` : ''}
      </Text>
      {displayComments.length === 0 && (
        <View style={styles.emptyComments}>
          <Text style={styles.emptyEmoji}>💬</Text>
          <Text style={styles.emptyText}>Sé el primero en comentar</Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <FlatList
          data={displayComments}
          keyExtractor={(c) => c.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.commentRow}>
              <Image source={{ uri: thumb(item.avatarUri, 80) }} style={styles.commentAvatar} transition={200} />
              <View style={styles.commentBubble}>
                <View style={styles.commentTop}>
                  <Text style={styles.commentUser}>
                    {item.name}
                    {item.mine ? ' (tú)' : ''}
                  </Text>
                  <Text style={styles.commentTime}>{formatTime(item.minutesAgo)}</Text>
                </View>
                <Text style={styles.commentText}>{item.text}</Text>
              </View>
            </View>
          )}
        />

        <View style={styles.inputBar}>
          <Image
            source={{ uri: thumb(user?.avatarUrl ?? userFallbackAvatar(user?.username ?? 'yo'), 80) }}
            style={styles.inputAvatar}
          />
          <TextInput
            style={styles.input}
            placeholder="Escribe un comentario..."
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            returnKeyType="send"
            onSubmitEditing={send}
          />
          <Pressable
            onPress={send}
            style={[styles.sendBtn, (!draft.trim() || sending) && { opacity: 0.4 }]}
            disabled={!draft.trim() || sending}
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="arrow-up" size={18} color="#fff" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  notFoundEmoji: { fontSize: 48 },
  notFoundTitle: { fontWeight: '800', fontSize: 18, color: colors.text },
  notFoundText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  notFoundBtn: { marginTop: 12, backgroundColor: colors.primary, paddingHorizontal: 26, paddingVertical: 11, borderRadius: radius.full },
  notFoundBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  badgeRow: { paddingHorizontal: spacing.lg, paddingVertical: 10 },
  badgeText: { fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.border, borderWidth: 2, borderColor: colors.primarysoft },
  petName: { fontWeight: '700', fontSize: 15, color: colors.text },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  locText: { fontSize: 12, color: colors.textMuted },
  time: { fontSize: 11, color: colors.textMuted },
  image: { width: '100%', aspectRatio: 1, backgroundColor: colors.border },
  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.lg },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionCount: { fontSize: 13, fontWeight: '700', color: colors.text },
  difundirBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 8 },
  difundirText: { color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 0.3 },
  description: { fontSize: 14, color: colors.text, lineHeight: 20, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  postedBy: { fontSize: 11, color: colors.textMuted, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  commentsTitle: { fontWeight: '800', fontSize: 16, color: colors.text, paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
  emptyComments: { alignItems: 'center', paddingVertical: spacing.xl, gap: 4 },
  emptyEmoji: { fontSize: 32 },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  commentRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.border },
  commentBubble: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, ...shadow.card },
  commentTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  commentUser: { fontWeight: '700', fontSize: 13, color: colors.text },
  commentTime: { fontSize: 11, color: colors.textMuted },
  commentText: { fontSize: 14, color: colors.text, lineHeight: 19 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  inputAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.border },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
