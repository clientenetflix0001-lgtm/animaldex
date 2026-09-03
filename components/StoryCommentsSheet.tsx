import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { db, type ApiComment } from '../lib/db';
import { colors, spacing } from '../lib/theme';
import { STORY_EXPIRED_MESSAGE, STORY_NOT_VET_DISCLAIMER } from '../lib/stories';
import { storyCommentsComposerPadding } from '../lib/storyViewerUi';
import { thumb, userFallbackAvatar } from '../lib/images';

type Props = {
  storyId: string;
  visible: boolean;
  canComment: boolean;
  onClose: () => void;
  onExpired: () => void;
};

export default function StoryCommentsSheet({ storyId, visible, canComment, onClose, onExpired }: Props) {
  const insets = useSafeAreaInsets();
  const composerPad = storyCommentsComposerPadding(insets);
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    db.storyComments(storyId)
      .then((res) => {
        if (!cancelled) setComments(res.comments || []);
      })
      .catch((e: any) => {
        if (e?.status === 410 || /terminó/i.test(String(e?.message || ''))) onExpired();
        else if (!cancelled) setError(e?.message || 'No se pudieron cargar los comentarios');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storyId, visible, onExpired]);

  if (!visible) return null;

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const created = await db.createStoryComment(storyId, body);
      setComments((prev) => [
        ...prev,
        {
          id: created.id,
          userId: 'me',
          username: 'vos',
          userName: 'vos',
          avatarUrl: null,
          text: body,
          createdAt: created.createdAt,
        },
      ]);
      setText('');
    } catch (e: any) {
      if (e?.status === 410 || /terminó/i.test(String(e?.message || ''))) {
        onExpired();
        return;
      }
      setError(e?.message || 'No se pudo comentar');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      enabled={Platform.OS !== 'web'}
      keyboardVerticalOffset={0}
      style={[styles.wrap, { paddingBottom: composerPad }]}
    >
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text style={styles.title}>Comentarios</Text>
          <Pressable onPress={onClose} accessibilityLabel="Cerrar comentarios">
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
        <Text style={styles.disclaimer}>{STORY_NOT_VET_DISCLAIMER}</Text>
        {loading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <FlatList
          data={comments}
          keyExtractor={(c) => c.id}
          style={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Image
                source={{ uri: thumb(item.avatarUrl || userFallbackAvatar(item.username), 80) }}
                style={styles.avatar}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.username}>{item.username}</Text>
                <Text style={styles.body}>{item.text}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={!loading ? <Text style={styles.empty}>Todavía no hay comentarios.</Text> : null}
        />
        {canComment ? (
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              placeholder="Escribí un comentario..."
              placeholderTextColor={colors.textMuted}
              value={text}
              onChangeText={setText}
              maxLength={500}
            />
            <Pressable onPress={send} disabled={sending || !text.trim()} style={styles.send}>
              <Ionicons name="send" size={18} color={text.trim() ? colors.primary : colors.textMuted} />
            </Pressable>
          </View>
        ) : (
          <Text style={styles.guest}>Iniciá sesión para comentar.</Text>
        )}
        {error === STORY_EXPIRED_MESSAGE ? null : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10, elevation: 16 },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 8,
    maxHeight: 420,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  disclaimer: { paddingHorizontal: spacing.lg, color: colors.textMuted, fontSize: 11, marginTop: 4 },
  list: { paddingHorizontal: spacing.lg, marginTop: 8 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.border },
  username: { fontWeight: '700', color: colors.text, fontSize: 13 },
  body: { color: colors.text, fontSize: 13, marginTop: 2 },
  empty: { color: colors.textMuted, textAlign: 'center', marginVertical: 20 },
  error: { color: colors.heart, paddingHorizontal: spacing.lg, marginTop: 6 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: 8,
    gap: 8,
  },
  input: { flex: 1, height: 40, color: colors.text },
  send: { padding: 8 },
  guest: { textAlign: 'center', color: colors.textMuted, marginTop: 8 },
});
