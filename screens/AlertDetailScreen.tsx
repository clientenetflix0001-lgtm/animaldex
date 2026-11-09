// ============================================================
// Animaldex — Detalle de alerta + comentarios
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '../components/AppIcon';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { db, ApiAlert, ApiComment, timeAgoMinutes } from '../lib/db';
import { useStore } from '../lib/store';
import { shareAlert } from '../lib/share';
import { alertBadgeColor, alertBadgeText, alertContextLine, alertFoundSafeNote, isAlertResolved } from '../lib/alerts';
import { thumb, userFallbackAvatar } from '../lib/images';
import { AdaptivePostImage } from '../components/AdaptivePostImage';
import { useImageNaturalSize } from '../lib/imageNaturalSize';
import { formatCount, formatTime } from '../lib/data';
import { useAppTheme, type ThemeColors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';
import WantToAdoptButton from '../components/WantToAdoptButton';
import { CommentKeyboardView } from '../components/CommentKeyboardView';
import { adoptCtaLabel } from '../lib/adoptionContact';
import { openAlertAdoption } from '../lib/openAlertAdoption';
import { useGuestAccess } from '../lib/guestAccess';
import { DEFAULT_ADOPTION_SLUG } from '../lib/adoptionLocalities';
import { adoptionPostShareUrl, useAdoptionPostActions } from '../components/adoptions/useAdoptionPostActions';
import {
  adoptionThumbFrame,
  cancelHeldAdoptionImage,
  flyAdoptionImage,
  heldAdoptionImageActive,
  peekAdoptionPreview,
  prefersReducedMotion,
  fadeHeldAdoptionImage,
  releaseHeldAdoptionImage,
  retargetHeldAdoptionImage,
  returnHeldAdoptionImage,
  setHeldDismissListener,
  type FlightRect,
} from '../components/adoptions/adoptionImageFlight';
import { convertImage } from '../lib/images';

type Rt = RouteProp<RootStackParamList, 'AlertDetail' | 'AdoptionPost'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const DIFUNDIR_LABEL_MIN_WIDTH = 400;

export default function AlertDetailScreen() {
  const { colors, scheme } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const route = useRoute<Rt>();
  const navigation = useNavigation<Nav>();
  const { width } = useWindowDimensions();
  const { user } = useStore();
  const { alertId } = route.params;
  // Solo la ruta web /adopciones/:city/:alertId (Difundir, denuncia, URL de la sección).
  const adoptionSection = route.name === 'AdoptionPost';
  const { guest, requireLogin, inviteBar, goBackOrClose } = useGuestAccess({ headerClose: !adoptionSection });
  // Modal de flyer sin contacto: también en /a/:id, pero solo en web. Android no cambia.
  const flyerModalEnabled = adoptionSection || Platform.OS === 'web';
  const adoptionCity =
    (route.params as RootStackParamList['AdoptionPost']).city || DEFAULT_ADOPTION_SLUG;
  const adoptionActions = useAdoptionPostActions();
  const [reported, setReported] = useState(false);

  const stagedPreview = adoptionSection ? peekAdoptionPreview(alertId) : null;
  const hadPreview = useRef(!!stagedPreview);
  const [alert, setAlert] = useState<ApiAlert | null>(stagedPreview);
  const [loading, setLoading] = useState(!stagedPreview);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const [revealPhoto, setRevealPhoto] = useState(() => !adoptionSection || !heldAdoptionImageActive());
  const [photoReady, setPhotoReady] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [loadedSize, setLoadedSize] = useState<{ width: number; height: number } | null>(null);
  const [chromeOn, setChromeOn] = useState(() => !adoptionSection || prefersReducedMotion());
  const detailFrame = useRef<FlightRect | null>(null);
  const imageWrapRef = useRef<View>(null);
  const handedOff = useRef(false);

  const load = useCallback(async () => {
    try {
      const [{ alert: a }, { comments: c }] = await Promise.all([
        db.alertDetail(alertId),
        db.alertComments(alertId),
      ]);
      setAlert(a);
      setComments(c);
    } catch {
      if (!hadPreview.current) setAlert(null);
    } finally {
      setCommentsLoaded(true);
      setLoading(false);
    }
  }, [alertId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (chromeOn) return;
    const frame = requestAnimationFrame(() => setChromeOn(true));
    return () => cancelAnimationFrame(frame);
  }, [chromeOn]);

  const seenImage = useRef(alert?.image);
  useEffect(() => {
    if (seenImage.current === alert?.image) return;
    seenImage.current = alert?.image;
    setPhotoReady(false);
    setPhotoError(false);
    setLoadedSize(null);
    handedOff.current = false;
    setRevealPhoto(!heldAdoptionImageActive());
  }, [alert?.image]);

  const measureDetailImage = useCallback(() => {
    imageWrapRef.current?.measureInWindow((x, y, width, height) => {
      if (width <= 8 || height <= 8) return;
      const frame = { x, y, width, height };
      detailFrame.current = frame;
      if (heldAdoptionImageActive() && !handedOff.current) retargetHeldAdoptionImage(frame);
    });
  }, []);

  useEffect(() => {
    if (!adoptionSection || !photoError) return;
    cancelHeldAdoptionImage();
    setRevealPhoto(true);
  }, [adoptionSection, photoError]);

  useEffect(() => {
    if (!adoptionSection || photoError || !photoReady || handedOff.current) return;
    let cancelled = false;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        imageWrapRef.current?.measureInWindow((x, y, width, height) => {
          if (cancelled || handedOff.current) return;
          handedOff.current = true;
          if (width > 8 && height > 8) {
            const next = { x, y, width, height };
            detailFrame.current = next;
            if (heldAdoptionImageActive()) retargetHeldAdoptionImage(next);
          }
          if (heldAdoptionImageActive()) releaseHeldAdoptionImage(() => setRevealPhoto(true));
          else setRevealPhoto(true);
        });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [adoptionSection, photoError, photoReady, loadedSize]);

  useEffect(() => {
    if (!adoptionSection) return;
    setHeldDismissListener(() => setRevealPhoto(true));
    return () => setHeldDismissListener(null);
  }, [adoptionSection]);

  useEffect(() => {
    if (!adoptionSection || !revealPhoto) return;
    fadeHeldAdoptionImage();
  }, [adoptionSection, revealPhoto]);

  useEffect(() => {
    if (!adoptionSection) return;
    return navigation.addListener('beforeRemove', () => {
      const to = adoptionThumbFrame(alertId);
      if (to && !prefersReducedMotion() && returnHeldAdoptionImage(to)) return;
      const from = detailFrame.current;
      const uri = alert?.image ? convertImage(alert.image, 720, 74, 'cover') : '';
      if (!from || !to || !uri || prefersReducedMotion()) return;
      void flyAdoptionImage({ uri, from, to, fit: 'cover', duration: 240 });
    });
  }, [adoptionSection, navigation, alertId, alert?.image]);

  const natural = useImageNaturalSize(alert?.image);

  const handleToggleLike = useCallback(() => {
    if (guest) { requireLogin(); return; }
    setAlert((prev) =>
      prev ? { ...prev, isLiked: !prev.isLiked, likeCount: prev.likeCount + (prev.isLiked ? -1 : 1) } : prev
    );
    if (alert) db.alertLike(alertId, !alert.isLiked).catch(() => {});
  }, [alert, alertId, guest, requireLogin]);

  const handleShare = useCallback(async () => {
    if (!alert || sharing) return;
    setSharing(true);
    try {
      await shareAlert(alert, adoptionSection ? adoptionPostShareUrl(adoptionCity, alert.id) : undefined);
    } finally {
      setSharing(false);
    }
  }, [alert, sharing, adoptionSection, adoptionCity]);

  const handleAdopt = useCallback(async () => {
    if (!alert || adopting) return;
    setAdopting(true);
    try {
      if (flyerModalEnabled) await adoptionActions.adopt(alert);
      else await openAlertAdoption(alert);
    } finally {
      setAdopting(false);
    }
  }, [alert, adopting, flyerModalEnabled, adoptionActions]);

  const handleReport = useCallback(() => {
    if (!alert || reported) return;
    if (guest) { requireLogin(); return; }
    const send = () => {
      db.reportAlert(alert.id)
        .then(() => {
          setReported(true);
          if (Platform.OS === 'web') window.alert('Gracias. Vamos a revisar la publicación.');
          else Alert.alert('Gracias', 'Vamos a revisar la publicación.');
        })
        .catch((e: any) => {
          const msg = e?.message || 'No se pudo enviar la denuncia.';
          if (Platform.OS === 'web') window.alert(msg);
          else Alert.alert('Error', msg);
        });
    };
    if (Platform.OS === 'web') {
      if (window.confirm('¿Denunciar esta publicación por contenido inapropiado o engañoso?')) send();
    } else {
      Alert.alert('Denunciar', '¿Denunciar esta publicación?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Denunciar', style: 'destructive', onPress: send },
      ]);
    }
  }, [alert, reported, guest, requireLogin]);

  const backToWall = useCallback(() => {
    navigation.navigate('AdoptionsWall', { city: adoptionCity });
  }, [navigation, adoptionCity]);

  const send = useCallback(async () => {
    if (guest) { requireLogin(); return; }
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
  }, [draft, alertId, sending, guest, requireLogin]);

  const displayComments = useMemo(
    () =>
      comments.map((c) => ({
        id: c.id,
        name: c.username,
        avatarUri: c.avatarUrl ?? userFallbackAvatar(c.username),
        text: c.text,
        minutesAgo: timeAgoMinutes(c.createdAt),
        mine: user?.id === c.userId,
      })),
    [comments, user]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={adoptionSection ? ['top', 'bottom'] : ['bottom']}>
        {adoptionSection ? (
          <Pressable
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : backToWall)}
            hitSlop={10}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Volver"
          >
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
        ) : null}
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
            onPress={adoptionSection ? backToWall : goBackOrClose}
          >
            <Text style={styles.notFoundBtnText}>{adoptionSection ? 'Ver adopciones' : 'Volver'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const avatar = alert.userAvatar ?? userFallbackAvatar(alert.username ?? 'usuario');
  const resolved = isAlertResolved(alert);
  const badgeColor = alertBadgeColor(alert);

  const chromeStyle = adoptionSection && !prefersReducedMotion()
    ? ({ opacity: chromeOn ? 1 : 0, transition: 'opacity 200ms ease' } as const)
    : undefined;
  const detailWidth = loadedSize?.width ?? natural?.width ?? (adoptionSection ? 4 : undefined);
  const detailHeight = loadedSize?.height ?? natural?.height ?? (adoptionSection ? 5 : undefined);

  const header = (
    <View>
      {adoptionSection ? (
        <View style={[styles.adoptTop, chromeStyle]}>
          <Pressable
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : backToWall)}
            hitSlop={10}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Volver"
          >
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
          <Image source={{ uri: thumb(avatar, 100) }} style={styles.avatar} transition={200} />
          <View style={styles.adoptCopy}>
            <Text style={styles.petName} numberOfLines={2}>
              {alertContextLine(alert)}
            </Text>
            <Text style={styles.adoptMeta} numberOfLines={2}>
              {formatTime(timeAgoMinutes(alert.createdAt))} · {alert.locality}
              {alert.locationReference ? ` · ${alert.locationReference}` : ''}
            </Text>
            {alertFoundSafeNote(alert) ? <Text style={styles.safeNote}>{alertFoundSafeNote(alert)}</Text> : null}
          </View>
        </View>
      ) : (
        <>
          <View style={[styles.badgeRow, { backgroundColor: `${badgeColor}14` }]}>
            <Text style={[styles.badgeText, { color: badgeColor }]}>
              {alertBadgeText(alert)}
            </Text>
          </View>
          <View style={styles.userRow}>
            <Image source={{ uri: thumb(avatar, 100) }} style={styles.avatar} transition={200} />
            <View style={{ flex: 1 }}>
              <Text style={styles.petName}>{alertContextLine(alert)}</Text>
              <View style={styles.locRow}>
                <Ionicons name="location" size={12} color={colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.locText}>{alert.locality}</Text>
                  {alert.locationReference ? (
                    <Text style={styles.locText}>{alert.locationReference}</Text>
                  ) : null}
                </View>
              </View>
              {alertFoundSafeNote(alert) ? (
                <Text style={styles.safeNote}>{alertFoundSafeNote(alert)}</Text>
              ) : null}
            </View>
            <Text style={styles.time}>{formatTime(timeAgoMinutes(alert.createdAt))}</Text>
          </View>
        </>
      )}

      <View
        ref={imageWrapRef}
        collapsable={false}
        onLayout={adoptionSection ? measureDetailImage : undefined}
        style={adoptionSection && !revealPhoto && !photoError ? { opacity: 0 } : undefined}
      >
        {photoError ? (
          <View style={styles.photoError}>
            <Text style={styles.notFoundText}>No se pudo mostrar la imagen.</Text>
          </View>
        ) : (
          <AdaptivePostImage
            uri={alert.image}
            imageWidth={detailWidth}
            imageHeight={detailHeight}
            layout="feed"
            recyclingKey={alert.id}
            contentFit={adoptionSection ? 'contain' : 'cover'}
            onLoad={adoptionSection ? (size) => {
              if (size) setLoadedSize(size);
              setPhotoReady(true);
            } : undefined}
            onError={adoptionSection ? () => setPhotoError(true) : undefined}
          />
        )}
      </View>

      <View style={[styles.actions, chromeStyle]}>
        <Pressable onPress={handleToggleLike} hitSlop={8} style={styles.actionBtn}>
          <Ionicons
            name={alert.isLiked ? 'heart' : 'heart-outline'}
            size={27}
            color={alert.isLiked ? colors.heart : colors.text}
          />
          <Text style={styles.actionCount}>{formatCount(alert.likeCount)}</Text>
        </Pressable>
        <Pressable onPress={() => { if (guest) requireLogin(); }} hitSlop={8} style={styles.actionBtn}>
          <Ionicons name="chatbubble-outline" size={24} color={colors.text} />
          <Text style={styles.actionCount}>{formatCount(alert.commentCount)}</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        {resolved ? (
          <Pressable onPress={handleShare} disabled={sharing} hitSlop={8} accessibilityLabel="Compartir">
            <Ionicons name="arrow-redo-outline" size={22} color={colors.text} />
          </Pressable>
        ) : alert.type === 'adoption' && !resolved ? (
          <>
            <WantToAdoptButton label={adoptCtaLabel(alert.sex)} onPress={handleAdopt} />
            {adoptionSection ? (
              <Pressable
                onPress={handleShare}
                disabled={sharing}
                hitSlop={8}
                style={styles.actionBtn}
                accessibilityRole="button"
                accessibilityLabel="Difundir"
              >
                <Ionicons name="arrow-redo-outline" size={22} color={colors.text} />
                {width >= DIFUNDIR_LABEL_MIN_WIDTH ? <Text style={styles.actionCount}>Difundir</Text> : null}
              </Pressable>
            ) : null}
          </>
        ) : (
          <Pressable onPress={handleShare} disabled={sharing} style={styles.difundirBtn}>
            <Ionicons name="paw" size={15} color="#fff" />
            <Text style={styles.difundirText}>DIFUNDIR</Text>
          </Pressable>
        )}
      </View>

      <View style={chromeStyle}>
      <Text style={styles.description}>{alert.description}</Text>
      {alert.username && <Text style={styles.postedBy}>Publicado por {alert.username}</Text>}
      {adoptionSection && user?.id !== alert.userId ? (
        <Pressable onPress={handleReport} disabled={reported} hitSlop={6} accessibilityRole="button">
          <Text style={styles.postedBy}>{reported ? 'Denuncia enviada' : 'Denunciar publicación'}</Text>
        </Pressable>
      ) : null}

      <Text style={styles.commentsTitle}>
        Comentarios {displayComments.length > 0 ? `(${displayComments.length})` : ''}
      </Text>
      {displayComments.length === 0 && (!adoptionSection || commentsLoaded) && (
        <View style={styles.emptyComments}>
          <Text style={styles.emptyEmoji}>💬</Text>
          <Text style={styles.emptyText}>Sé el primero en comentar</Text>
        </View>
      )}
      </View>
    </View>
  );

  const pageBg = adoptionSection && scheme === 'light' ? { backgroundColor: '#FFFFFF' } : null;

  return (
    <SafeAreaView style={[styles.safe, pageBg]} edges={adoptionSection ? ['top', 'bottom'] : ['bottom']}>
      {guest ? (
        <>
          <FlatList
            data={displayComments}
            keyExtractor={(c) => c.id}
            ListHeaderComponent={header}
            contentContainerStyle={{ paddingBottom: 260 }}
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
          {inviteBar}
        </>
      ) : (
        <CommentKeyboardView>
          <FlatList
            data={displayComments}
            keyExtractor={(c) => c.id}
            ListHeaderComponent={header}
            contentContainerStyle={{ paddingBottom: spacing.xl }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
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
        </CommentKeyboardView>
      )}
      {flyerModalEnabled ? adoptionActions.overlays : null}
    </SafeAreaView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  notFoundEmoji: { fontSize: 48 },
  notFoundTitle: { fontWeight: '800', fontSize: 18, color: colors.text },
  notFoundText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  notFoundBtn: { marginTop: 12, backgroundColor: colors.primary, paddingHorizontal: 26, paddingVertical: 11, borderRadius: radius.full },
  notFoundBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  adoptTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingTop: 4, paddingBottom: 8 },
  adoptCopy: { flex: 1, paddingTop: 2, paddingRight: spacing.sm },
  adoptMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  photoError: { width: '100%', aspectRatio: 4 / 5, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  badgeRow: { paddingHorizontal: spacing.lg, paddingVertical: 10 },
  badgeText: { fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.border, borderWidth: 2, borderColor: colors.primarysoft },
  petName: { fontWeight: '700', fontSize: 15, color: colors.text },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  locText: { fontSize: 12, color: colors.textMuted },
  safeNote: { fontSize: 11, color: '#2EA65A', fontWeight: '700', marginTop: 3 },
  time: { fontSize: 11, color: colors.textMuted },
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
}
