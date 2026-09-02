import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { formatCount, formatTime, Post } from '../lib/data';
import { useStore, apiPostToPost } from '../lib/store';
import { db, ApiComment, timeAgoMinutes } from '../lib/db';
import { usePolling } from '../lib/realtime';
import { resolvePost, sharePost } from '../lib/share';
import { getPostDisplay } from '../lib/postDisplay';
import { thumb, large, userFallbackAvatar } from '../lib/images';
import { AdaptivePostImage } from '../components/AdaptivePostImage';
import { PostBackgroundCard } from '../components/PostBackgroundCard';
import { CommentKeyboardView } from '../components/CommentKeyboardView';
import { useGuestAccess } from '../lib/guestAccess';
import { openHumanProfile } from '../lib/publicHandles';
import {
  POST_CAPTION_MAX,
  backgroundTextNeedsSeeMore,
  isTextBackgroundPost,
} from '../lib/postBackgrounds';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';
import { useBreakpoint } from '../lib/responsive';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'PostDetail'>;

interface DisplayComment {
  id: string;
  name: string;
  avatarUri: string;
  text: string;
  minutesAgo: number;
  mine: boolean;
}

export default function PostDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { user } = useStore();
  const [realPost, setRealPost] = useState<Post | null>(null);
  const [realLoading, setRealLoading] = useState(true);

  const postId = route.params?.postId;
  const demoPost = useMemo(() => resolvePost(postId, route.params?.d), [route.params]);

  useEffect(() => {
    (async () => {
      if (demoPost || !postId) {
        setRealLoading(false);
        return;
      }
      try {
        const { post } = await db.postDetail(postId);
        setRealPost(apiPostToPost(post));
      } catch {}
      setRealLoading(false);
    })();
  }, [postId, demoPost]);

  const post = demoPost ?? realPost;

  if (realLoading && !post) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.notFound}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundEmoji}>🐾</Text>
          <Text style={styles.notFoundTitle}>Publicación no encontrada</Text>
          <Text style={styles.notFoundText}>
            Este enlace ya no está disponible o la publicación fue eliminada.
          </Text>
          <Pressable
            style={styles.notFoundBtn}
            onPress={() => {
              if (navigation.canGoBack()) navigation.goBack();
              else if (user) navigation.navigate('Tabs');
              else navigation.navigate('Auth');
            }}
          >
            <Text style={styles.notFoundBtnText}>{user ? 'Ir al inicio' : 'Entrar a Animaldex'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return <PostDetailContent post={post} />;
}

function PostDetailContent({ post }: { post: Post }) {
  const navigation = useNavigation<Nav>();
  const { desktopWeb, height } = useBreakpoint();
  const {
    likedPosts,
    savedPosts,
    toggleLike,
    toggleSave,
    user,
    markPostDeleted,
    markPostEdited,
    editedCaptions,
  } = useStore();

  const isMine = !!post.real && post.authorUserId === user?.id;
  const effectiveCaption = editedCaptions[post.id] ?? post.caption;
  const [editing, setEditing] = useState(false);
  const [captionDraft, setCaptionDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const { guest, requireLogin, inviteBar } = useGuestAccess({ headerClose: true });

  const disp = getPostDisplay(post);
  const liked = likedPosts.includes(post.id);
  const saved = savedPosts.includes(post.id);
  const [draft, setDraft] = useState('');
  const [dbComments, setDbComments] = useState<ApiComment[]>([]);
  const [sending, setSending] = useState(false);
  // Contador de likes en vivo (null = aún sin datos del servidor)
  const [dbLikes, setDbLikes] = useState<number | null>(post.real ? post.likes : null);
  const sinceRef = React.useRef(0);

  // Cargar comentarios reales desde la base de datos
  const loadComments = useCallback(async () => {
    try {
      const { comments } = await db.comments(post.id);
      setDbComments(comments);
      if (comments.length > 0) {
        sinceRef.current = Math.max(sinceRef.current, comments[comments.length - 1].createdAt);
      }
    } catch {}
  }, [post.id]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // ========== TIEMPO REAL ==========
  // Cada 6 s: SOLO los comentarios nuevos desde el último conocido +
  // contadores frescos. Los nuevos se agregan al final (no mueve el
  // scroll del lector) y el contador se actualiza en su lugar.
  usePolling(
    useCallback(async () => {
      try {
        const { likeCount, newComments } = await db.postUpdates(post.id, sinceRef.current);
        setDbLikes(likeCount);
        if (newComments.length > 0) {
          sinceRef.current = Math.max(
            sinceRef.current,
            newComments[newComments.length - 1].createdAt
          );
          setDbComments((prev) => {
            const seen = new Set(prev.map((c) => c.id));
            const fresh = newComments.filter((c) => !seen.has(c.id));
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
        }
      } catch {}
    }, [post.id]),
    6000
  );

  const allComments: DisplayComment[] = useMemo(() => {
    const seed: DisplayComment[] = post.real
      ? []
      : post.comments.map((c) => ({
          id: c.id,
          name: 'Fan de mascotas',
          avatarUri: userFallbackAvatar(c.userId),
          text: c.text,
          minutesAgo: c.minutesAgo,
          mine: false,
        }));
    const real: DisplayComment[] = dbComments.map((c) => ({
      id: c.id,
      name: c.username,
      avatarUri: c.avatarUrl ?? userFallbackAvatar(c.username),
      text: c.text,
      minutesAgo: timeAgoMinutes(c.createdAt),
      mine: user?.id === c.userId,
    }));
    return [...seed, ...real];
  }, [post, dbComments, user]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    try {
      await db.comment(post.id, text);
      await loadComments();
    } catch {}
    setSending(false);
  }, [draft, post.id, sending, loadComments]);

  // ---------- Editar / eliminar mi publicación ----------
  const startEdit = useCallback(() => {
    setCaptionDraft(effectiveCaption);
    setEditing(true);
  }, [effectiveCaption]);

  const saveEdit = useCallback(async () => {
    const text = captionDraft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await db.updatePost(post.id, text);
      markPostEdited(post.id, text);
      setEditing(false);
    } catch (e: any) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(e?.message || 'No se pudo guardar');
      else Alert.alert('Error', e?.message || 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }, [captionDraft, busy, post.id, markPostEdited]);

  const confirmDelete = useCallback(() => {
    const doDelete = async () => {
      setBusy(true);
      try {
        await db.deletePost(post.id);
        markPostDeleted(post.id);
        if (navigation.canGoBack()) navigation.goBack();
        else navigation.navigate('Tabs');
      } catch (e: any) {
        if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(e?.message || 'No se pudo eliminar');
        else Alert.alert('Error', e?.message || 'No se pudo eliminar');
        setBusy(false);
      }
    };
    const msg = '¿Eliminar esta publicación? La foto también se borrará del servidor. Esta acción no se puede deshacer.';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(msg)) doDelete();
    } else {
      Alert.alert('Eliminar publicación', msg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [post.id, markPostDeleted, navigation]);

  // Like con actualización optimista del contador en vivo
  const handleToggleLike = useCallback(() => {
    if (guest) { requireLogin(); return; }
    toggleLike(post.id);
    setDbLikes((c) => (c == null ? c : Math.max(0, c + (liked ? -1 : 1))));
  }, [guest, requireLogin, toggleLike, post.id, liked]);

  const handleToggleSave = useCallback(() => {
    if (guest) { requireLogin(); return; }
    toggleSave(post.id);
  }, [guest, requireLogin, toggleSave, post.id]);

  const openAuthor = useCallback(() => {
    const org = post.authorProfileType === 'business' || post.authorProfileType === 'protector';
    const handle = post.authorProfileUsername;
    if (org && handle) openHumanProfile(navigation, { username: handle });
    else if (post.petId) navigation.navigate('PetProfile', { petId: post.petId });
    else openHumanProfile(navigation, { username: disp.username, userId: post.authorUserId });
  }, [post, navigation, disp.username]);

  // Posts reales: contador vivo del servidor. Demo: base + likes reales de la BD.
  const likeCount = post.real
    ? dbLikes ?? post.likes
    : post.likes + (dbLikes ?? (liked ? 1 : 0));

  // ---------- Piezas reutilizables ----------
  const petHeader = (
    <View style={styles.postHeader}>
      <Pressable style={styles.headerLeft} onPress={openAuthor}>
        <Image source={{ uri: thumb(disp.avatarUri, 100) }} style={styles.avatar} transition={200} />
        <View>
          <Text style={styles.petName}>
            {disp.petUsername || disp.petName.toLowerCase()}{disp.petEmoji}
          </Text>
          <Text style={styles.subText}>
            {(disp.speciesLabel || 'mascota').toLowerCase()} de ({disp.username})
          </Text>
        </View>
      </Pressable>
      <View style={styles.headerRight}>
        <Text style={styles.time}>{formatTime(post.minutesAgo)}</Text>
        {isMine && (
          <View style={styles.ownActions}>
            <Pressable onPress={startEdit} hitSlop={8} style={styles.ownBtn} disabled={busy}>
              <Ionicons name="create-outline" size={19} color={colors.text} />
            </Pressable>
            <Pressable onPress={confirmDelete} hitSlop={8} style={styles.ownBtn} disabled={busy}>
              {busy ? (
                <ActivityIndicator size="small" color={colors.heart} />
              ) : (
                <Ionicons name="trash-outline" size={19} color={colors.heart} />
              )}
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );

  const captionContent = editing ? (
    <View style={styles.editBlock}>
      <TextInput
        style={styles.editInput}
        value={captionDraft}
        onChangeText={setCaptionDraft}
        multiline
        maxLength={POST_CAPTION_MAX}
        autoFocus
        placeholder="Escribe el nuevo pie de foto..."
        placeholderTextColor={colors.textMuted}
      />
      <View style={styles.editActions}>
        <Pressable style={styles.editCancel} onPress={() => setEditing(false)} disabled={busy}>
          <Text style={styles.editCancelText}>Cancelar</Text>
        </Pressable>
        <Pressable
          style={[styles.editSave, (!captionDraft.trim() || busy) && { opacity: 0.5 }]}
          onPress={saveEdit}
          disabled={!captionDraft.trim() || busy}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.editSaveText}>Guardar</Text>
          )}
        </Pressable>
      </View>
    </View>
  ) : (
    <Text style={styles.caption}>
      {effectiveCaption}
    </Text>
  );

  const actionsRow = (
    <View style={styles.actions}>
      <Pressable onPress={handleToggleLike} hitSlop={8}>
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          size={27}
          color={liked ? colors.heart : colors.text}
        />
      </Pressable>
      <Pressable onPress={() => { if (guest) requireLogin(); }} hitSlop={8}>
        <Ionicons name="chatbubble-outline" size={24} color={colors.text} />
      </Pressable>
      <Pressable onPress={() => sharePost(post)} hitSlop={8}>
        <Ionicons name="paper-plane-outline" size={24} color={colors.text} />
      </Pressable>
      <View style={{ flex: 1 }} />
      <Pressable onPress={handleToggleSave} hitSlop={8}>
        <Ionicons
          name={saved ? 'bookmark' : 'bookmark-outline'}
          size={24}
          color={saved ? colors.gold : colors.text}
        />
      </Pressable>
    </View>
  );

  const inputBar = (
    <View style={styles.inputBar}>
      <Image
        source={{ uri: thumb(user?.avatarUrl ?? userFallbackAvatar(user?.username ?? 'yo'), 80) }}
        style={styles.inputAvatar}
      />
      <TextInput
        style={styles.input}
        placeholder={`Comenta la foto de ${disp.petName}...`}
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
        {sending ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Ionicons name="arrow-up" size={18} color="#fff" />
        )}
      </Pressable>
    </View>
  );

  const renderComment = ({ item }: { item: DisplayComment }) => (
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
  );

  const isBgPost = isTextBackgroundPost(post);
  const showFullCaptionBelow = isBgPost && !editing && backgroundTextNeedsSeeMore(effectiveCaption);
  const detailCaption =
    editing || !isBgPost || showFullCaptionBelow ? captionContent : null;

  // ---------- Escritorio: dos columnas (imagen + conversación) ----------
  if (desktopWeb) {
    const cardH = Math.min(height - 140, 820);
    return (
      <View style={styles.dtRoot}>
        <View style={[styles.dtCard, { height: cardH }]}>
          {!!post.image && (
          <View style={styles.dtImageCol}>
            <AdaptivePostImage
              uri={post.image}
              containerHeight={cardH}
              imageWidth={post.imageWidth}
              imageHeight={post.imageHeight}
            />
          </View>
          )}
          {isBgPost && post.backgroundId ? (
            <View style={styles.dtImageCol}>
              <PostBackgroundCard backgroundId={post.backgroundId} text={effectiveCaption} />
            </View>
          ) : null}
          <View style={styles.dtSideCol}>
            {petHeader}
            <View style={styles.dtDivider} />
            <FlatList
              style={{ flex: 1 }}
              data={allComments}
              keyExtractor={(c) => c.id}
              ListHeaderComponent={
                detailCaption ? <View style={styles.dtCaptionBlock}>{detailCaption}</View> : null
              }
              ListEmptyComponent={
                <View style={styles.emptyComments}>
                  <Text style={styles.emptyEmoji}>💬</Text>
                  <Text style={styles.emptyText}>Sé el primero en comentar</Text>
                </View>
              }
              renderItem={renderComment}
              contentContainerStyle={{ paddingTop: spacing.md }}
              showsVerticalScrollIndicator={false}
            />
            <View style={styles.dtDivider} />
            {actionsRow}
            <Text style={[styles.likes, { paddingHorizontal: spacing.lg, paddingTop: spacing.sm }]}>
              {formatCount(likeCount)} me gusta
            </Text>
            {guest ? null : inputBar}
          </View>
        </View>
        {inviteBar}
      </View>
    );
  }

  // ---------- Móvil / tablet (sin cambios) ----------
  const header = (
    <View style={styles.mobilePostCard}>
      {petHeader}

      {!!post.image && (
        <AdaptivePostImage
          uri={post.image}
          containerHeight={380}
          imageWidth={post.imageWidth}
          imageHeight={post.imageHeight}
        />
      )}
      {isBgPost && post.backgroundId ? (
        <PostBackgroundCard backgroundId={post.backgroundId} text={effectiveCaption} />
      ) : null}

      {actionsRow}

      <View style={styles.metaBlock}>
        <Text style={styles.likes}>{formatCount(likeCount)} me gusta</Text>
        {detailCaption}
      </View>

      <Text style={styles.commentsTitle}>
        Comentarios {allComments.length > 0 ? `(${allComments.length})` : ''}
      </Text>
      {allComments.length === 0 && (
        <View style={styles.emptyComments}>
          <Text style={styles.emptyEmoji}>💬</Text>
          <Text style={styles.emptyText}>Sé el primero en comentar</Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {guest ? (
        <>
          <FlatList
            data={allComments}
            keyExtractor={(c) => c.id}
            ListHeaderComponent={header}
            contentContainerStyle={{ paddingBottom: 260 }}
            renderItem={renderComment}
            showsVerticalScrollIndicator={false}
          />
          {inviteBar}
        </>
      ) : (
        <CommentKeyboardView>
          <FlatList
            data={allComments}
            keyExtractor={(c) => c.id}
            ListHeaderComponent={header}
            contentContainerStyle={{ paddingBottom: spacing.xl }}
            renderItem={renderComment}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
          {inputBar}
        </CommentKeyboardView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  mobilePostCard: {
    backgroundColor: colors.card,
    width: '100%',
    marginTop: 0,
    marginBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  dtRoot: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  dtCard: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 1080,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  dtImageCol: { flex: 1.25, backgroundColor: '#000' },
  dtImage: { width: '100%', height: '100%' },
  dtSideCol: {
    width: 420,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    backgroundColor: colors.card,
  },
  dtDivider: { height: 1, backgroundColor: colors.border },
  dtCaptionBlock: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  notFoundEmoji: { fontSize: 48 },
  notFoundTitle: { fontWeight: '800', fontSize: 18, color: colors.text },
  notFoundText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  notFoundBtn: {
    marginTop: 12,
    backgroundColor: colors.primary,
    paddingHorizontal: 26,
    paddingVertical: 11,
    borderRadius: radius.full,
  },
  notFoundBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerRight: { alignItems: 'flex-end', gap: 6 },
  ownActions: { flexDirection: 'row', gap: spacing.sm },
  ownBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBlock: { gap: spacing.sm, marginTop: 4 },
  editInput: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 70,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: 'top',
  },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  editCancel: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editCancelText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  editSave: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    minWidth: 80,
    alignItems: 'center',
  },
  editSaveText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  avatar: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, borderColor: colors.primarysoft, backgroundColor: colors.border },
  petName: { fontWeight: '700', fontSize: 15, color: colors.text },
  subText: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  time: { fontSize: 11, color: colors.textMuted },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.lg,
  },
  metaBlock: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm },
  likes: { fontWeight: '700', fontSize: 14, color: colors.text, marginBottom: 4 },
  caption: { fontSize: 14, color: colors.text, lineHeight: 20 },
  captionName: { fontWeight: '700' },
  commentsTitle: {
    fontWeight: '800',
    fontSize: 16,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  emptyComments: { alignItems: 'center', paddingVertical: spacing.xl, gap: 4 },
  emptyEmoji: { fontSize: 32 },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  commentRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.border },
  commentBubble: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadow.card,
  },
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
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
