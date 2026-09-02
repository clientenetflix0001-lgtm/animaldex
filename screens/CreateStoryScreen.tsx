import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useStore } from '../lib/store';
import { db } from '../lib/db';
import { uploadImage } from '../lib/api';
import { colors, spacing, radius } from '../lib/theme';
import { ProfileSwitcher, useProfiles } from '../features/profiles';
import { petsForPublishingIdentity, reconcileSelectedPetId } from '../lib/petOwnership';
import {
  STORY_CAPTION_MAX,
  STORY_IMAGE_KIND,
  STORY_PRIVACY_BREED,
  STORY_VIDEO_MAX_MS,
  cfIdFromImageUrl,
  clientStoryVideoRejects,
  resolveStoryAudience,
  resolveStoryBreedFromPet,
  storyDestinations,
  storyTrimEditorConfig,
} from '../lib/stories';
import { fileToUpload } from '../lib/reelTrim';
import { normalizeLocalFileUri } from '../lib/reelUri';

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

export default function CreateStoryScreen() {
  const navigation = useNavigation<any>();
  const { myPets } = useStore();
  const { activeProfileId, activeProfile, profiles } = useProfiles();
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [trimmedUri, setTrimmedUri] = useState<string | null>(null);
  const [mime, setMime] = useState<string | null>(null);
  const [bytes, setBytes] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [caption, setCaption] = useState('');
  const [selectedPet, setSelectedPet] = useState<string | null>(null);
  const [audience, setAudience] = useState<'normal' | 'breed' | 'both'>('normal');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const pickerPets = useMemo(
    () =>
      petsForPublishingIdentity(
        myPets,
        { profileId: activeProfileId, type: activeProfile?.type },
        profiles
      ),
    [myPets, activeProfileId, activeProfile?.type, profiles]
  );

  useEffect(() => {
    setSelectedPet((current) => reconcileSelectedPetId(current, pickerPets));
  }, [activeProfileId, pickerPets]);

  const activePetId = reconcileSelectedPetId(selectedPet, pickerPets);
  const activePet = pickerPets.find((p) => p.id === activePetId);
  const breed = resolveStoryBreedFromPet(activePet);
  const destinations = storyDestinations(breed);
  const resolvedAudience = resolveStoryAudience(audience, breed);

  const pickImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setMediaType('image');
    setUri(result.assets[0].uri);
    setTrimmedUri(null);
    setMime(result.assets[0].mimeType || 'image/jpeg');
    setBytes(result.assets[0].fileSize ?? null);
    setDurationMs(null);
    const mimeType = result.assets[0].mimeType || 'image/jpeg';
    setImageDataUrl(
      result.assets[0].base64 ? `data:${mimeType};base64,${result.assets[0].base64}` : null
    );
  }, []);

  const applyTrim = useCallback(async (videoUri: string) => {
    const native = await loadTrimNative();
    if (!native) {
      Alert.alert(
        'Recorte no disponible',
        'El recorte de videos largos se activa en el próximo build Android. Elegí un video de hasta 15 s.'
      );
      return false;
    }
    const cfg = storyTrimEditorConfig();
    return await new Promise<boolean>((resolve) => {
      const subs: Array<{ remove: () => void }> = [];
      const done = (ok: boolean, outUri?: string, outMs?: number | null) => {
        subs.forEach((s) => {
          try {
            s.remove();
          } catch {}
        });
        if (ok && outUri) {
          setTrimmedUri(outUri);
          setDurationMs(outMs ?? STORY_VIDEO_MAX_MS);
          setMime('video/mp4');
        }
        resolve(ok);
      };
      if (native.onFinishTrimming) {
        subs.push(
          native.onFinishTrimming((e: any) => {
            const out = normalizeLocalFileUri(e.outputPath);
            const ms =
              e.startTime != null && e.endTime != null ? Number(e.endTime) - Number(e.startTime) : e.duration ?? null;
            if (ms != null && ms > STORY_VIDEO_MAX_MS) {
              Alert.alert('Muy largo', 'Las historias de video pueden durar hasta 15 segundos.');
              done(false);
              return;
            }
            done(!!out, out, ms);
          })
        );
      }
      if (native.onCancel) subs.push(native.onCancel(() => done(false)));
      if (native.onError) subs.push(native.onError(() => done(false)));
      try {
        native.showEditor(videoUri, cfg);
      } catch {
        done(false);
      }
    });
  }, []);

  const pickVideo = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const nextDuration = asset.duration == null ? null : Number(asset.duration);
    if (clientStoryVideoRejects(nextDuration)) {
      const ok = await applyTrim(asset.uri);
      if (!ok) return;
    } else {
      setDurationMs(nextDuration);
    }
    setMediaType('video');
    setUri(asset.uri);
    setImageDataUrl(null);
    setMime(asset.mimeType || 'video/mp4');
    setBytes(asset.fileSize ?? null);
  }, [applyTrim]);

  const publish = useCallback(async () => {
    if (busy || !uri || !mediaType) {
      Alert.alert('Elegí una foto o un video', 'Podés publicar una foto o un video de hasta 15 segundos.');
      return;
    }
    setBusy(true);
    setNote('Publicando…');
    try {
      if (mediaType === 'image') {
        const dataUrl = imageDataUrl;
        if (!dataUrl || !dataUrl.startsWith('data:')) throw new Error('No se pudo leer la imagen');
        const up = await uploadImage(dataUrl);
        const cfId = cfIdFromImageUrl(up.url);
        db.registerImage(up.url, cfId || undefined, STORY_IMAGE_KIND).catch(() => {});
        await db.createStory({
          imageUrl: up.url,
          cfId,
          caption: caption.trim(),
          audience: resolvedAudience,
          protagonistPetId: activePetId,
          authorProfileId: activeProfileId,
        });
      } else {
        const source = fileToUpload(uri, trimmedUri);
        if (!source || !mime) throw new Error('Falta el video');
        if (clientStoryVideoRejects(durationMs)) {
          throw new Error('Las historias de video pueden durar hasta 15 segundos.');
        }
        const created = await db.createStoryUpload({
          mime,
          byteSize: bytes,
          durationMs,
          caption: caption.trim(),
          audience: resolvedAudience,
          protagonistPetId: activePetId,
          authorProfileId: activeProfileId,
        });
        const fileRes = await fetch(source);
        const blob = await fileRes.blob();
        const put = await fetch(created.uploadUrl, {
          method: 'PUT',
          body: blob,
          headers: { 'content-type': mime },
        });
        if (!put.ok) throw new Error('No se pudo subir el video');
        await db.completeStoryUpload(created.storyId);
      }
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('No se pudo publicar', e?.message || 'Intentá de nuevo.');
    } finally {
      setBusy(false);
      setNote('');
    }
  }, [
    busy,
    uri,
    mediaType,
    imageDataUrl,
    caption,
    resolvedAudience,
    activePetId,
    activeProfileId,
    trimmedUri,
    mime,
    bytes,
    durationMs,
    navigation,
  ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Cerrar">
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Crear historia</Text>
        <Pressable onPress={publish} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.publish}>Publicar</Text>}
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <ProfileSwitcher compact />
        <View style={styles.pickRow}>
          <Pressable style={styles.pickBtn} onPress={pickImage}>
            <Ionicons name="image-outline" size={20} color={colors.primary} />
            <Text style={styles.pickText}>Foto</Text>
          </Pressable>
          <Pressable style={styles.pickBtn} onPress={pickVideo}>
            <Ionicons name="videocam-outline" size={20} color={colors.primary} />
            <Text style={styles.pickText}>Video 15s</Text>
          </Pressable>
        </View>
        {uri ? (
          <Image source={{ uri: trimmedUri || uri }} style={styles.preview} contentFit="cover" />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Elegí una foto o un video corto.</Text>
          </View>
        )}
        <Text style={styles.label}>Mascota protagonista (opcional)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pets}>
          <Pressable style={[styles.petChip, !activePetId && styles.petChipOn]} onPress={() => setSelectedPet(null)}>
            <Text style={styles.petChipText}>Ninguna</Text>
          </Pressable>
          {pickerPets.map((pet) => (
            <Pressable
              key={pet.id}
              style={[styles.petChip, activePetId === pet.id && styles.petChipOn]}
              onPress={() => setSelectedPet(pet.id)}
            >
              <Text style={styles.petChipText}>{pet.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={styles.label}>¿Dónde querés compartirla?</Text>
        <View style={styles.destRow}>
          {destinations.map((d) => (
            <Pressable
              key={d.id}
              style={[styles.dest, resolvedAudience === d.id && styles.destOn]}
              onPress={() => setAudience(d.id)}
            >
              <Text style={[styles.destText, resolvedAudience === d.id && styles.destTextOn]}>{d.label}</Text>
            </Pressable>
          ))}
        </View>
        {resolvedAudience !== 'normal' ? <Text style={styles.privacy}>{STORY_PRIVACY_BREED}</Text> : null}
        <TextInput
          style={styles.caption}
          placeholder="Escribí algo (opcional)"
          placeholderTextColor={colors.textMuted}
          value={caption}
          onChangeText={setCaption}
          maxLength={STORY_CAPTION_MAX}
        />
        {note ? <Text style={styles.note}>{note}</Text> : null}
        {Platform.OS === 'web' ? <Text style={styles.note}>El recorte nativo de video no está en web.</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  publish: { color: colors.primary, fontWeight: '700' },
  body: { padding: spacing.lg, gap: spacing.md },
  pickRow: { flexDirection: 'row', gap: 12 },
  pickBtn: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    padding: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  pickText: { fontWeight: '700', color: colors.text },
  preview: { width: '100%', height: 280, borderRadius: radius.lg, backgroundColor: '#111' },
  placeholder: {
    height: 160,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: { color: colors.textMuted },
  label: { fontWeight: '700', color: colors.text, marginTop: 4 },
  pets: { gap: 8 },
  petChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  petChipOn: { borderColor: colors.primary, backgroundColor: colors.primarysoft },
  petChipText: { color: colors.text, fontWeight: '600' },
  destRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dest: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  destOn: { backgroundColor: colors.primarysoft, borderColor: colors.primary },
  destText: { color: colors.text, fontWeight: '600' },
  destTextOn: { color: colors.primary },
  privacy: { color: colors.textMuted, fontSize: 12 },
  caption: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 12,
    color: colors.text,
  },
  note: { color: colors.textMuted, fontSize: 12 },
});
