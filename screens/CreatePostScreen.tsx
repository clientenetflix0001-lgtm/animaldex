import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useStore, apiPostToPost } from '../lib/store';
import { db } from '../lib/db';
import { uploadImage } from '../lib/api';
import { thumb, petFallbackAvatar } from '../lib/images';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { useBreakpoint, CONTENT } from '../lib/responsive';

export default function CreatePostScreen() {
  const navigation = useNavigation<any>();
  const { desktopWeb } = useBreakpoint();
  const { myPets, refreshMyPets, notifyPostCreated } = useStore();

  const [selectedPet, setSelectedPet] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploadNote, setUploadNote] = useState('');

  const activePetId = selectedPet ?? myPets[0]?.id ?? null;
  const activePet = myPets.find((p) => p.id === activePetId);

  const pickFromGallery = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para elegir la foto.');
      return;
    }
    // Android: el Photo Picker nuevo a veces abre recorte igual.
    // legacy:true usa la galería clásica SIN editor de recorte.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.9,
      base64: true,
      ...(Platform.OS === 'android' ? { legacy: true } : {}),
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const mime = asset.mimeType || 'image/jpeg';
    const dataUrl = asset.base64 ? `data:${mime};base64,${asset.base64}` : asset.uri;
    if (!dataUrl.startsWith('data:')) {
      Alert.alert('Error', 'No se pudo leer la imagen');
      return;
    }
    setUploading(true);
    setUploadNote('');
    try {
      const up = await uploadImage(dataUrl);
      if (up.url.startsWith('data:')) {
        Alert.alert('Error', 'No se pudo subir la imagen a Cloudflare Images');
      } else {
        setPhoto(up.url);
        setUploadNote('Subida a Cloudflare Images ☁️✓');
        db.registerImage(up.url, undefined, 'post').catch(() => {});
      }
    } catch (e: any) {
      Alert.alert('Error al subir', e?.message || 'Inténtalo de nuevo');
    } finally {
      setUploading(false);
    }
  }, []);

  const publish = useCallback(async () => {
    if (!activePetId) {
      Alert.alert('Sin mascotas', 'Primero registra una mascota en tu perfil 🐾');
      return;
    }
    if (!photo && caption.trim().length === 0) {
      Alert.alert('Publicación vacía', 'Escribe un texto o agrega una foto 🐾');
      return;
    }
    setPublishing(true);
    try {
      const { post } = await db.createPost(activePetId, photo || '', caption.trim());
      // Inserción incremental: el post aparece arriba del feed al instante,
      // sin recargar nada.
      notifyPostCreated(apiPostToPost(post));
      setCaption('');
      setPhoto(null);
      setUploadNote('');
      navigation.navigate('Inicio');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo publicar');
    } finally {
      setPublishing(false);
    }
  }, [activePetId, photo, caption, navigation, notifyPostCreated]);

  const wrapStyle = desktopWeb ? styles.desktopWrap : styles.mobileWrap;

  // ---------- Sin mascotas: invitar a crear una ----------
  if (myPets.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={wrapStyle}>
        <View style={styles.header}>
          <Text style={styles.title}>Nueva publicación</Text>
        </View>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>🐾</Text>
          <Text style={styles.emptyTitle}>Aún no tienes mascotas</Text>
          <Text style={styles.emptyText}>
            Registra a tu peludito para empezar a publicar sus mejores momentos.
          </Text>
          <Pressable
            style={styles.addPetBtn}
            onPress={() => navigation.navigate('AddPet')}
          >
            <Ionicons name="add-circle-outline" size={19} color="#fff" />
            <Text style={styles.addPetText}>Registrar mi mascota</Text>
          </Pressable>
          <Pressable onPress={refreshMyPets}>
            <Text style={styles.refreshLink}>Ya la registré, actualizar</Text>
          </Pressable>
        </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={wrapStyle}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Nueva publicación</Text>
          <Pressable style={styles.publishBtn} onPress={publish} disabled={publishing || uploading}>
            {publishing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={styles.publishText}>Publicar</Text>
                <Ionicons name="paw" size={15} color="#fff" />
              </>
            )}
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sectionLabel}>¿Quién protagoniza esta foto?</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.petPicker}>
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
                    transition={200}
                  />
                  <Text style={[styles.petOptionName, active && { color: colors.primary }]}>
                    {p.name} {p.emoji}
                  </Text>
                  {active && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
                </Pressable>
              );
            })}
            <Pressable style={styles.petOptionAdd} onPress={() => navigation.navigate('AddPet')}>
              <Ionicons name="add" size={20} color={colors.primary} />
              <Text style={styles.petOptionAddText}>Nueva</Text>
            </Pressable>
          </ScrollView>

          <Text style={styles.sectionLabel}>Foto (opcional)</Text>
          <Pressable style={styles.preview} onPress={pickFromGallery}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.previewImg} contentFit="contain" transition={300} />
            ) : (
              <View style={[styles.previewImg, styles.previewEmpty]}>
                {uploading ? (
                  <>
                    <ActivityIndicator color={colors.primary} size="large" />
                    <Text style={styles.previewEmptyText}>Subiendo a Cloudflare...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="images-outline" size={44} color={colors.primary} />
                    <Text style={styles.previewEmptyText}>Elegí una foto (sin recorte)</Text>
                    <Text style={styles.previewHint}>O publicá solo texto, sin recorte</Text>
                  </>
                )}
              </View>
            )}
            {photo && uploading && (
              <View style={styles.uploadOverlay}>
                <ActivityIndicator color="#fff" size="large" />
              </View>
            )}
          </Pressable>
          {uploadNote !== '' && <Text style={styles.uploadNote}>{uploadNote}</Text>}
          {photo && (
            <Pressable style={styles.changePhotoBtn} onPress={pickFromGallery}>
              <Ionicons name="swap-horizontal" size={15} color={colors.primary} />
              <Text style={styles.changePhotoText}>Cambiar foto</Text>
            </Pressable>
          )}

          <Text style={styles.sectionLabel}>Texto</Text>
          <TextInput
            style={styles.captionInput}
            placeholder={`¿Qué está pasando, ${activePet?.name ?? 'peludo'}? Podés publicar solo texto.`}
            placeholderTextColor={colors.textMuted}
            multiline
            value={caption}
            onChangeText={setCaption}
            maxLength={280}
          />
          <Text style={styles.counter}>{caption.length}/280</Text>
        </ScrollView>
      </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  mobileWrap: { flex: 1 },
  desktopWrap: {
    flex: 1,
    width: '100%',
    maxWidth: CONTENT.narrow,
    alignSelf: 'center',
    paddingTop: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: radius.full,
    minWidth: 100,
    justifyContent: 'center',
  },
  publishText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  petPicker: { paddingHorizontal: spacing.lg, gap: spacing.md },
  petOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingRight: 14,
    paddingLeft: 6,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  petOptionActive: { borderColor: colors.primary, backgroundColor: colors.primarysoft },
  petOptionImg: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.border },
  petOptionName: { fontWeight: '700', fontSize: 14, color: colors.text },
  petOptionAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  petOptionAddText: { fontWeight: '700', fontSize: 13, color: colors.primary },
  preview: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  previewImg: { width: '100%', aspectRatio: 1, backgroundColor: colors.border },
  previewEmpty: {
    backgroundColor: colors.primarysoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  previewHint: { color: colors.textMuted, fontSize: 12, marginTop: 6, fontWeight: '600' },
  previewEmptyText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  uploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadNote: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.secondary,
    fontWeight: '600',
  },
  changePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  changePhotoText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  captionInput: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    minHeight: 100,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: 'top',
  },
  counter: {
    textAlign: 'right',
    marginHorizontal: spacing.lg,
    marginTop: 6,
    fontSize: 12,
    color: colors.textMuted,
  },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontWeight: '900', fontSize: 20, color: colors.text },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  addPetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 24,
    paddingVertical: 13,
    marginTop: spacing.lg,
  },
  addPetText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  refreshLink: { color: colors.secondary, fontWeight: '700', fontSize: 13, marginTop: spacing.md },
});
