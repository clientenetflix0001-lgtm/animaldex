import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useStore } from '../lib/store';
import { db } from '../lib/db';
import { thumb, petFallbackAvatar } from '../lib/images';
import { colors, spacing, radius } from '../lib/theme';
import { ProfileSwitcher, useProfiles } from '../features/profiles';
import {
  REEL_CAPTION_MAX,
  REEL_DURATION_REJECT_MESSAGE,
  clientReelValidationError,
} from '../lib/reels';

type Phase = 'pick' | 'preparing' | 'uploading' | 'processing' | 'ready' | 'error';

export default function CreateReelScreen() {
  const navigation = useNavigation<any>();
  const { myPets, user } = useStore();
  const { activeProfileId, activeProfile } = useProfiles();
  const isOrg = activeProfile?.type === 'business' || activeProfile?.type === 'protector';
  const busyRef = useRef(false);

  const [selectedPet, setSelectedPet] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [mime, setMime] = useState<string | null>(null);
  const [bytes, setBytes] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [error, setError] = useState('');

  const activePetId = isOrg ? null : selectedPet;
  const phaseLabel =
    phase === 'preparing'
      ? 'Preparando...'
      : phase === 'uploading'
        ? 'Subiendo...'
        : phase === 'processing'
          ? 'Procesando...'
          : phase === 'ready'
            ? 'Listo'
            : phase === 'error'
              ? error || 'Error'
              : 'Nuevo Reel';

  const pickVideo = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para elegir el video.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      videoMaxDuration: 30,
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const nextMime = asset.mimeType || 'video/mp4';
    const nextBytes = asset.fileSize ?? null;
    const nextDuration = asset.duration == null ? null : Number(asset.duration);
    const reject = clientReelValidationError({ mime: nextMime, bytes: nextBytes, durationMs: nextDuration });
    if (reject) {
      Alert.alert(reject === REEL_DURATION_REJECT_MESSAGE ? 'Video muy largo' : 'Video no válido', reject);
      return;
    }
    setLocalUri(asset.uri);
    setMime(nextMime);
    setBytes(nextBytes);
    setDurationMs(nextDuration);
    setWidth(asset.width || null);
    setHeight(asset.height || null);
    setError('');
    setPhase('pick');
  }, []);

  const publish = useCallback(async () => {
    if (busyRef.current) return;
    if (!localUri || !mime) {
      Alert.alert('Elegí un video', 'Seleccioná un video de hasta 30 segundos.');
      return;
    }
    const reject = clientReelValidationError({ mime, bytes, durationMs });
    if (reject) {
      Alert.alert('Video no válido', reject);
      return;
    }
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
      });
      setPhase('uploading');
      const fileRes = await fetch(localUri);
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
      setPhase('processing');
      let ready = false;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 1500));
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
        ready ? 'Reel publicado' : 'Reel en proceso',
        ready
          ? 'Ya está disponible en Reels.'
          : 'Lo estamos procesando. Aparecerá cuando Mux lo tenga listo.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e: any) {
      setPhase('error');
      setError(e?.message || 'No se pudo publicar el Reel');
      Alert.alert('Error', e?.message || 'No se pudo publicar el Reel');
    } finally {
      busyRef.current = false;
    }
  }, [localUri, mime, bytes, durationMs, caption, activePetId, activeProfileId, navigation]);

  const busy = phase === 'preparing' || phase === 'uploading' || phase === 'processing';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Nuevo Reel</Text>
        <Pressable style={styles.publishBtn} onPress={publish} disabled={busy || !localUri}>
          {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.publishText}>Publicar</Text>}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.phase}>{phaseLabel}</Text>
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

        <Text style={styles.sectionLabel}>Video (máx. 30.00 s, MP4/MOV, hasta 50 MB en el dispositivo)</Text>
        <Pressable style={styles.pickBtn} onPress={pickVideo} disabled={busy}>
          <Ionicons name="videocam-outline" size={22} color={colors.primary} />
          <Text style={styles.pickText}>{localUri ? 'Cambiar video' : 'Elegir de la galería'}</Text>
        </Pressable>
        {localUri ? (
          <View style={styles.metaBox}>
            <Text style={styles.meta}>
              {durationMs != null ? `${Math.round(durationMs / 100) / 10} s` : 'Duración: la confirmará Mux'}
              {width && height ? ` · ${width}×${height}` : ''}
              {bytes != null ? ` · ${Math.round(bytes / 1024 / 1024 * 10) / 10} MB` : ''}
            </Text>
            <Text style={styles.metaMuted}>{mime} · preferencia 9:16</Text>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Texto</Text>
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
  metaBox: { marginTop: spacing.sm },
  meta: { color: colors.text, fontWeight: '700' },
  metaMuted: { color: colors.textMuted, marginTop: 2 },
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
