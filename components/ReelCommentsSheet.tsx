// ============================================================
// Animaldex — Hoja de comentarios de un Reel (modal)
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { db, ApiComment, timeAgoMinutes } from '../lib/db';
import { useStore } from '../lib/store';
import { thumb, userFallbackAvatar } from '../lib/images';
import { formatTime } from '../lib/data';
import { colors, spacing, radius, shadow } from '../lib/theme';

interface Props {
  visible: boolean;
  reelId: string | null;
  onClose: () => void;
  onCommentAdded?: () => void;
}

export function ReelCommentsSheet({ visible, reelId, onClose, onCommentAdded }: Props) {
  const { user } = useStore();
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!reelId) return;
    setLoading(true);
    try {
      const { comments: c } = await db.reelComments(reelId);
      setComments(c);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [reelId]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !reelId || sending) return;
    setSending(true);
    setDraft('');
    try {
      await db.reelComment(reelId, text);
      await load();
      onCommentAdded?.();
    } catch {}
    setSending(false);
  }, [draft, reelId, sending, load, onCommentAdded]);

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

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>
              Comentarios {displayComments.length > 0 ? `(${displayComments.length})` : ''}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
          ) : (
            <FlatList
              data={displayComments}
              keyExtractor={(c) => c.id}
              style={{ flexGrow: 0, maxHeight: 380 }}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyEmoji}>💬</Text>
                  <Text style={styles.emptyText}>Sé el primero en comentar</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.commentRow}>
                  <Image source={{ uri: thumb(item.avatarUri, 80) }} style={styles.commentAvatar} />
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
              contentContainerStyle={{ paddingBottom: spacing.md }}
            />
          )}

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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetWrap: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    ...shadow.card,
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  title: { fontSize: 16, fontWeight: '800', color: colors.text },
  empty: { alignItems: 'center', paddingVertical: spacing.xl, gap: 4 },
  emptyEmoji: { fontSize: 28 },
  emptyText: { color: colors.textMuted, fontSize: 13 },
  commentRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  commentAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.border },
  commentBubble: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.md },
  commentTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  commentUser: { fontWeight: '700', fontSize: 13, color: colors.text },
  commentTime: { fontSize: 11, color: colors.textMuted },
  commentText: { fontSize: 13, color: colors.text, lineHeight: 18 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inputAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.border },
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
  sendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
