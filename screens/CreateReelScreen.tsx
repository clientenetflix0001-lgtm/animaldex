import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useStore } from '../lib/store';
import { db } from '../lib/db';
import { thumb, petFallbackAvatar } from '../lib/images';
import { colors, spacing, radius } from '../lib/theme';
import { ProfileSwitcher, useProfiles } from '../features/profiles';
import {
  REEL_CAPTION_MAX,
  REEL_DURATION_REJECT_MESSAGE,
  clientReelValidationError,
  createReelIsDirty,
} from '../lib/reels';
import {
  canAddReelOverlay,
  createDraftOverlay,
  parseReelOverlays,
  type ReelTextOverlay,
} from '../lib/reelOverlays';
import {
  fileToUpload,
  openReelTrimEditor,
  shouldOpenReelTrim,
} from '../lib/reelTrim';
import { rememberLocalReel } from '../lib/reelSession';
import { ReelOverlayLayer } from '../components/ReelOverlayLayer';
import { ReelTextEditor } from '../components/ReelTextEditor';

type Phase = 'pick' | 'trim' | 'edit' | 'preparing' | 'uploading' | 'processing' | 'ready' | 'error';

async function loadTrimNative() {
  try {
    const mod: any = await import('react-native-video-trim');
    const VideoTrim = mod.default || mod;
    if (!mod.showEditor) return null;
    return {
      showEditor: mod.showEditor,
      onFinishTrimming: VideoTrim.onFinishTrimming?.bind(VideoTrim),
      onCancel: VideoTrim.onCancel?.bind(VideoTrim),
      onError: VideoTrim.onError?.bind(VideoTrim),
    };
  } catch {
    return null;
  }
}

function PreviewPlayer({ uri, muted }: { uri: string; muted: boolean }) {
  const [paused, setPaused] = useState(false);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = muted;
    p.staysActiveInBackground = false;
  });
  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);
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
  return (
    <>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => setPaused((p) => !p)}
        accessibilityLabel={paused ? 'Reproducir' : 'Pausar'}
      />
      {paused ? (
        <View style={previewPause.badge} pointerEvents="none">
          <Ionicons name="pause" size={22} color="#fff" />
        </View>
      ) : null}
    </>
  );
}

const previewPause = StyleSheet.create({
  badge: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
    width: 48,
    height: 48,
    marginLeft: -24,
    left: '50%',
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function phaseLabelOf(phase: Phase, error: string): string {
  if (phase === 'pick') return '1. Elegir video';
  if (phase === 'trim') return '2. Recortar';
  if (phase === 'edit') return '3. Editar';
  if (phase === 'preparing') return '4. Preparando…';
  if (phase === 'uploading') return '5. Subiendo…';
  if (phase === 'processing') return '6. Procesando video…';
  if (phase === 'ready') return '7. Listo';
  return error || 'Error';
}

export default function CreateReelScreen() {
  const navigation = useNavigation<any>();
  const { myPets, user } = useStore();
  const { activeProfileId, activeProfile } = useProfiles();
  const isOrg = activeProfile?.type === 'business' || activeProfile?.type === 'protector';
  const busyRef = useRef(false);
  const createdIdRef = useRef<string | null>(null);
  const leavingRef = useRef(false);

  const [selectedPet, setSelectedPet] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [originalUri, setOriginalUri] = useState<string | null>(null);
  const [trimmedUri, setTrimmedUri] = useState<string | null>(null);
  const [mime, setMime] = useState<string | null>(null);
  const [bytes, setBytes] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [overlays, setOverlays] = useState<ReelTextOverlay[]>([]);
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(null);
  const [previewBox, setPreviewBox] = useState({ w: 0, h: 0 });
  const [previewMuted, setPreviewMuted] = useState(false);
  const [phase, setPhase] = useState<Phase>('pick');
  const [error, setError] = useState('');

  const uploadUri = fileToUpload(originalUri, trimmedUri);
  const activePetId = isOrg ? null : selectedPet;
  const busy = phase === 'preparing' || phase === 'uploading';
  const submitted = phase === 'processing' || phase === 'ready';
  const dirty = createReelIsDirty({
    originalUri,
    caption,
    overlayCount: overlays.length,
    phase,
  });

  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e: any) => {
      if (leavingRef.current || submitted || !dirty) return;
      e.preventDefault();
      const uploading = phase === 'preparing' || phase === 'uploading';
      Alert.alert(
        uploading ? 'Subida en curso' : '¿Descartar Reel?',
        uploading
          ? 'Si salís ahora se cancela la subida.'
          : 'Vas a perder el video y los textos que agregaste.',
        [
          { text: 'Seguir', style: 'cancel' },
          {
            text: uploading ? 'Cancelar subida' : 'Salir',
            style: 'destructive',
            onPress: () => {
              const id = createdIdRef.current;
              if (id && uploading) db.cancelReelUpload(id).catch(() => {});
              leavingRef.current = true;
              navigation.dispatch(e.data.action);
            },
          },
        ]
      );
    });
    return sub;
  }, [navigation, dirty, submitted, phase]);

  const applyTrim = useCallback(async (uri: string) => {
    const native = await loadTrimNative();
    if (!native) {
      Alert.alert(
        'Recorte no disponible',
        'El recorte de videos largos se activa en el próximo build Android (react-native-video-trim). Elegí un video de hasta 30 s o esperá el AAB.'
      );
      return false;
    }
    setPhase('trim');
    const result = await openReelTrimEditor(uri, native);
    if (result.status === 'cancelled') {
      setPhase(originalUri ? 'edit' : 'pick');
      return false;
    }
    if (result.status === 'error') {
      Alert.alert('No se pudo recortar', result.message);
      setPhase(originalUri ? 'edit' : 'pick');
      return false;
    }
    setTrimmedUri(result.uri);
    setDurationMs(result.durationMs);
    setMime('video/mp4');
    setPhase('edit');
    return true;
  }, [originalUri]);

  const pickVideo = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para elegir el video.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const nextMime = asset.mimeType || 'video/mp4';
    const nextBytes = asset.fileSize ?? null;
    const nextDuration = asset.duration == null ? null : Number(asset.duration);
    const reject = clientReelValidationError({ mime: nextMime, bytes: nextBytes, durationMs: nextDuration, stage: 'gallery' });
    if (reject) {
      Alert.alert('Video no válido', reject);
      return;
    }
    setOriginalUri(asset.uri);
    setTrimmedUri(null);
    setMime(nextMime);
    setBytes(nextBytes);
    setDurationMs(nextDuration);
    setWidth(asset.width || null);
    setHeight(asset.height || null);
    setError('');
    setPhase('edit');
    if (shouldOpenReelTrim(nextDuration)) {
      const ok = await applyTrim(asset.uri);
      if (!ok) {
        setOriginalUri(null);
        setDurationMs(null);
        setPhase('pick');
      }
    }
  }, [applyTrim]);

  const addText = useCallback(() => {
    if (!canAddReelOverlay(overlays)) {
      Alert.alert('Límite', 'Podés agregar hasta 3 textos.');
      return;
    }
    const next = createDraftOverlay({
      id: `ov-${Date.now()}`,
      x: 0.5,
      y: 0.3,
      fontSize: 22,
      textColor: '#FFFFFF',
      background: 'none',
    });
    setOverlays((prev) => [...prev, next]);
    setActiveOverlayId(next.id);
  }, [overlays]);

  const publish = useCallback(async () => {
    if (busyRef.current) return;
    const source = fileToUpload(originalUri, trimmedUri);
    if (!source || !mime) {
      Alert.alert('Elegí un video', 'Seleccioná un video. Si dura más de 30 s, recortalo.');
      return;
    }
    const reject = clientReelValidationError({ mime, bytes, durationMs, stage: 'publish' });
    if (reject) {
      Alert.alert('Video no válido', reject);
      return;
    }
    const cleanOverlays = parseReelOverlays(overlays);
    busyRef.current = true;
    setPhase('preparing');
    setError('');
    try {
      const created = await db.createReelUpload({
        mime,
        byteSize: bytes,
        durationMs,
        caption: caption.trim(),
        petId: activePetId,
        authorProfileId: activeProfileId,
        overlays: cleanOverlays,
      });
      createdIdRef.current = created.reelId;
      setPhase('uploading');
      const fileRes = await fetch(source);
      const blob = await fileRes.blob();
      const put = await fetch(created.uploadUrl, {
        method: 'PUT',
        body: blob,
        headers: { 'content-type': mime },
      });
      if (!put.ok) {
        await db.cancelReelUpload(created.reelId).catch(() => {});
        throw new Error('No se pudo subir el video a Mux');
      }
      await db.completeReelUpload(created.reelId);
      rememberLocalReel({
        id: created.reelId,
        status: 'processing',
        caption: caption.trim(),
        thumbnailUri: source,
        createdAt: Date.now(),
      });
      setPhase('processing');
      let ready = false;
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const { reel } = await db.myReel(created.reelId);
        if (reel.status === 'ready') {
          ready = true;
          break;
        }
        if (reel.status === 'rejected') {
          throw new Error(REEL_DURATION_REJECT_MESSAGE);
        }
        if (reel.status === 'upload_failed' || reel.status === 'processing_failed') {
          throw new Error('Mux no pudo procesar el video');
        }
      }
      setPhase(ready ? 'ready' : 'processing');
      Alert.alert(
        ready ? 'Reel publicado' : 'Procesando video…',
        ready
          ? 'Ya está disponible en Reels.'
          : 'Lo estamos procesando. Podés seguir usando la app; aparecerá cuando esté listo.',
        [{
          text: 'OK',
          onPress: () => {
            leavingRef.current = true;
            navigation.goBack();
          },
        }]
      );
    } catch (e: any) {
      setPhase('error');
      setError(e?.message || 'No se pudo publicar el Reel');
      Alert.alert('Error', e?.message || 'No se pudo publicar el Reel');
    } finally {
      busyRef.current = false;
    }
  }, [originalUri, trimmedUri, mime, bytes, durationMs, caption, overlays, activePetId, activeProfileId, navigation]);

  const askClose = () => {
    if (!dirty || submitted) {
      leavingRef.current = true;
      navigation.goBack();
      return;
    }
    navigation.goBack();
  };

  const activeOverlay = overlays.find((o) => o.id === activeOverlayId) || null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={askClose} hitSlop={8} accessibilityLabel="Cerrar">
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Nuevo Reel</Text>
        <Pressable
          style={styles.publishBtn}
          onPress={publish}
          disabled={busy || submitted || !uploadUri}
          accessibilityLabel="Publicar"
        >
          {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.publishText}>Publicar</Text>}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.phase}>{phaseLabelOf(phase, error)}</Text>

        <Text style={styles.sectionLabel}>Video (MP4/MOV, hasta 50 MB). Máx. 30.00 s al publicar.</Text>
        <Pressable style={styles.pickBtn} onPress={pickVideo} disabled={busy || submitted} accessibilityLabel="Elegir de la galería">
          <Ionicons name="videocam-outline" size={22} color={colors.primary} />
          <Text style={styles.pickText}>{originalUri ? 'Cambiar video' : 'Elegir de la galería'}</Text>
        </Pressable>

        {uploadUri ? (
          <View
            style={styles.preview}
            onLayout={(e) => setPreviewBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
          >
            <PreviewPlayer uri={uploadUri} muted={previewMuted} />
            <ReelOverlayLayer overlays={overlays.filter((o) => o.id !== activeOverlayId)} />
            {overlays.map((ov) =>
              ov.id === activeOverlayId || previewBox.w <= 0 ? null : (
                <Pressable
                  key={ov.id}
                  onPress={() => setActiveOverlayId(ov.id)}
                  accessibilityLabel="Seleccionar texto"
                  style={{
                    position: 'absolute',
                    left: ov.x * previewBox.w - 80,
                    top: ov.y * previewBox.h - 18,
                    width: 160,
                    height: 36,
                  }}
                />
              )
            )}
            {activeOverlay && previewBox.w > 0 ? (
              <ReelTextEditor
                overlay={activeOverlay}
                boxW={previewBox.w}
                boxH={previewBox.h}
                onChange={(next) => setOverlays((prev) => prev.map((o) => (o.id === next.id ? next : o)))}
                onRemove={() => {
                  setOverlays((prev) => prev.filter((o) => o.id !== activeOverlay.id));
                  setActiveOverlayId(null);
                }}
              />
            ) : null}
            <Pressable style={styles.aa} onPress={addText} hitSlop={8} accessibilityLabel="Agregar texto">
              <Text style={styles.aaT}>Aa</Text>
            </Pressable>
            <Pressable
              style={styles.muteBtn}
              onPress={() => setPreviewMuted((m) => !m)}
              accessibilityLabel={previewMuted ? 'Activar sonido' : 'Silenciar'}
            >
              <Ionicons name={previewMuted ? 'volume-mute' : 'volume-high'} size={18} color="#fff" />
            </Pressable>
          </View>
        ) : null}

        {uploadUri ? (
          <View style={styles.tools}>
            <Pressable
              style={styles.toolBtn}
              onPress={() => originalUri && applyTrim(originalUri)}
              disabled={busy || submitted || Platform.OS === 'web'}
              accessibilityLabel="Recortar"
            >
              <Ionicons name="cut-outline" size={16} color={colors.primary} />
              <Text style={styles.toolT}>{shouldOpenReelTrim(durationMs) ? 'Recortar (obligatorio)' : 'Recortar'}</Text>
            </Pressable>
            <Pressable style={styles.toolBtn} onPress={addText} disabled={busy || submitted} accessibilityLabel="Texto Aa">
              <Text style={styles.toolT}>Aa Texto</Text>
            </Pressable>
          </View>
        ) : null}

        {overlays.length ? (
          <View style={styles.chips}>
            {overlays.map((ov, i) => (
              <Pressable
                key={ov.id}
                style={[styles.chip, ov.id === activeOverlayId && styles.chipOn]}
                onPress={() => setActiveOverlayId(ov.id)}
                accessibilityLabel={`Seleccionar texto ${i + 1}`}
              >
                <Text style={styles.chipT}>{ov.text || `Texto ${i + 1}`}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {uploadUri ? (
          <View style={styles.metaBox}>
            <Text style={styles.meta}>
              {trimmedUri ? 'Se subirá el recorte · ' : 'Se subirá el archivo elegido · '}
              {durationMs != null ? `${Math.round(durationMs / 100) / 10} s` : 'duración: la confirmará Mux'}
              {width && height ? ` · ${width}×${height}` : ''}
            </Text>
            <Text style={styles.metaMuted}>{mime} · preview 9:16 · texto no se quema en el video</Text>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Publicar como</Text>
        <ProfileSwitcher compact />

        {!isOrg && (
          <>
            <Text style={styles.sectionLabel}>¿Quién protagoniza?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.petPicker}>
              <Pressable
                style={[styles.petOption, !activePetId && styles.petOptionActive]}
                onPress={() => setSelectedPet(null)}
              >
                <View style={[styles.petOptionImg, styles.noneAvatar]}>
                  <Ionicons name="person" size={18} color={colors.textMuted} />
                </View>
                <Text style={[styles.petOptionName, !activePetId && { color: colors.primary }]}>Ninguno</Text>
              </Pressable>
              {myPets.map((p) => {
                const active = p.id === activePetId;
                return (
                  <Pressable
                    key={p.id}
                    style={[styles.petOption, active && styles.petOptionActive]}
                    onPress={() => setSelectedPet(p.id)}
                  >
                    <Image
                      source={{ uri: thumb(p.avatarUrl ?? petFallbackAvatar(p.id), 100) }}
                      style={styles.petOptionImg}
                    />
                    <Text style={[styles.petOptionName, active && { color: colors.primary }]}>
                      {p.name} {p.emoji}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )}

        <Text style={styles.sectionLabel}>Descripción</Text>
        <TextInput
          style={styles.input}
          value={caption}
          onChangeText={(t) => setCaption(t.slice(0, REEL_CAPTION_MAX))}
          placeholder={user ? `Contá algo, ${user.name.split(' ')[0]}...` : 'Escribí un texto'}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={REEL_CAPTION_MAX}
        />
        <Text style={styles.counter}>{caption.length}/{REEL_CAPTION_MAX}</Text>
        {phase === 'processing' ? <Text style={styles.metaMuted}>Procesando video… podés volver a Reels.</Text> : null}
        {phase === 'error' ? <Text style={styles.err}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  publishBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 92,
    alignItems: 'center',
  },
  publishText: { color: '#fff', fontWeight: '800' },
  phase: { color: colors.textMuted, fontWeight: '700', marginBottom: spacing.md },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.sm },
  petPicker: { gap: spacing.sm, paddingRight: spacing.lg },
  petOption: {
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
    minWidth: 76,
  },
  petOptionActive: { borderColor: colors.primary, backgroundColor: colors.primarysoft },
  petOptionImg: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.border },
  noneAvatar: { alignItems: 'center', justifyContent: 'center' },
  petOptionName: { fontSize: 12, fontWeight: '700', color: colors.text, marginTop: 4 },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  pickText: { color: colors.primary, fontWeight: '800' },
  preview: {
    marginTop: spacing.md,
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 420,
    alignSelf: 'center',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  aa: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aaT: { color: '#fff', fontWeight: '800', fontSize: 16 },
  muteBtn: {
    position: 'absolute',
    left: 10,
    top: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tools: { flexDirection: 'row', gap: 10, marginTop: 10 },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toolT: { color: colors.primary, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarysoft },
  chipT: { color: colors.text, fontWeight: '700', fontSize: 12 },
  metaBox: { marginTop: spacing.sm },
  meta: { color: colors.text, fontWeight: '700' },
  metaMuted: { color: colors.textMuted, marginTop: 2 },
  err: { color: colors.heart, fontWeight: '700', marginTop: 8 },
  input: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    textAlignVertical: 'top',
    backgroundColor: colors.card,
  },
  counter: { alignSelf: 'flex-end', color: colors.textMuted, marginTop: 4, fontSize: 12 },
});
