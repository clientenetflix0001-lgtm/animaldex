import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useStore, apiPostToPost } from '../lib/store';
import { db } from '../lib/db';
import { uploadImage } from '../lib/api';
import { useAppTheme, type ThemeColors, spacing, radius, shadow } from '../lib/theme';
import { useBreakpoint, CONTENT } from '../lib/responsive';
import { ProfileSwitcher, useProfiles } from '../features/profiles';
import { PostBackgroundCard, PostBackgroundChip } from '../components/PostBackgroundCard';
import { SelectedImagePreview } from '../components/SelectedImagePreview';
import PetAvatar from '../components/PetAvatar';
import { GALLERY_IMAGE_PICKER_OPTIONS } from '../lib/galleryImagePicker';
import {
  DEFAULT_POST_BACKGROUND_ID,
  POST_CAPTION_MAX,
  getActivePostBackgrounds,
  isAllowedBackgroundId,
} from '../lib/postBackgrounds';
import {
  canAddPetForPublishingIdentity,
  petsForPublishingIdentity,
  reconcileSelectedPetId,
} from '../lib/petOwnership';
import {
  backgroundIdForCreatePost,
  endPublish,
  navigateAfterSuccessfulCreatePost,
  shouldShowBackgroundPreview,
  shouldShowPhotoPreview,
  toggleCreatePostPanel,
  tryBeginPublish,
  type CreatePostPanel,
} from '../lib/createPostPublish';

export default function CreatePostScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const { desktopWeb } = useBreakpoint();
  const { myPets, notifyPostCreated } = useStore();
  const { activeProfileId, activeProfile, profiles } = useProfiles();

  const [selectedPet, setSelectedPet] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [photoDimensions, setPhotoDimensions] = useState<{ width: number; height: number } | null>(null);
  const [backgroundId, setBackgroundId] = useState(DEFAULT_POST_BACKGROUND_ID);
  const [backgroundTouched, setBackgroundTouched] = useState(false);
  const [panel, setPanel] = useState<CreatePostPanel>('none');
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploadNote, setUploadNote] = useState('');
  const publishLock = useRef(false);

  const pickerPets = useMemo(
    () =>
      petsForPublishingIdentity(
        myPets,
        { profileId: activeProfileId, type: activeProfile?.type },
        profiles
      ),
    [myPets, activeProfileId, activeProfile?.type, profiles]
  );
  const canAddPet = canAddPetForPublishingIdentity({
    profileId: activeProfileId,
    type: activeProfile?.type,
  });

  useEffect(() => {
    setSelectedPet((current) => reconcileSelectedPetId(current, pickerPets));
  }, [activeProfileId, pickerPets]);

  const activePetId = reconcileSelectedPetId(selectedPet, pickerPets);
  const activePet = pickerPets.find((p) => p.id === activePetId);
  const showPhoto = shouldShowPhotoPreview(photo, previewUri);
  const showBackground = shouldShowBackgroundPreview(!!photo, backgroundTouched);

  const pickFromGallery = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para elegir la foto.');
      return;
    }
    // Importante: NO usar allowsEditing ni aspect ni legacy.
    // En Android, legacy:true abre el editor de recorte de la galería OEM.
    const result = await ImagePicker.launchImageLibraryAsync(GALLERY_IMAGE_PICKER_OPTIONS);
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setPreviewUri(asset.uri);
    if (asset.width && asset.height && asset.width > 0 && asset.height > 0) {
      setPhotoDimensions({ width: asset.width, height: asset.height });
    } else {
      setPhotoDimensions(null);
    }
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

  const openPanel = useCallback(
    (next: Exclude<CreatePostPanel, 'none'>) => {
      setPanel((current) => toggleCreatePostPanel(current, next));
    },
    []
  );

  const onPressPhoto = useCallback(() => {
    setPanel('photo');
    if (!photo && !previewUri && !uploading) {
      void pickFromGallery();
    }
  }, [photo, previewUri, uploading, pickFromGallery]);

  const onPressBackground = useCallback(() => {
    if (photo || previewUri) return;
    openPanel('background');
  }, [photo, previewUri, openPanel]);

  const clearPhoto = useCallback(() => {
    setPhoto(null);
    setPreviewUri(null);
    setPhotoDimensions(null);
    setUploadNote('');
    setBackgroundId((id) => id || DEFAULT_POST_BACKGROUND_ID);
  }, []);

  const publish = useCallback(async () => {
    if (!tryBeginPublish(publishLock, uploading)) return;
    if (!photo && caption.trim().length === 0) {
      endPublish(publishLock);
      Alert.alert('Publicación vacía', 'Escribe un texto o agrega una foto 🐾');
      return;
    }
    if (!photo && !isAllowedBackgroundId(backgroundId)) {
      endPublish(publishLock);
      Alert.alert('Elegí un fondo', 'Las publicaciones de texto necesitan un fondo prediseñado.');
      return;
    }
    setPublishing(true);
    try {
      const { post } = await db.createPost(
        activePetId || '',
        photo || '',
        caption.trim(),
        activeProfileId,
        photo ? photoDimensions?.width ?? null : null,
        photo ? photoDimensions?.height ?? null : null,
        backgroundIdForCreatePost(!!photo, backgroundId)
      );
      // Inserción incremental: el post aparece arriba del feed al instante,
      // sin recargar nada.
      notifyPostCreated(apiPostToPost(post));
      setCaption('');
      setPhoto(null);
      setPreviewUri(null);
      setPhotoDimensions(null);
      setBackgroundId(DEFAULT_POST_BACKGROUND_ID);
      setBackgroundTouched(false);
      setPanel('none');
      setUploadNote('');
      navigateAfterSuccessfulCreatePost(navigation);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo publicar');
    } finally {
      endPublish(publishLock);
      setPublishing(false);
    }
  }, [activePetId, photo, photoDimensions, caption, backgroundId, navigation, notifyPostCreated, activeProfileId, uploading]);

  const wrapStyle = desktopWeb ? styles.desktopWrap : styles.mobileWrap;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={wrapStyle}>
        <View style={styles.header}>
          <Pressable
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Tabs'))}
            hitSlop={10}
            accessibilityLabel="Cerrar"
          >
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>Nueva publicación</Text>
          <Pressable style={styles.publishBtn} onPress={publish} disabled={publishing || uploading}>
            {publishing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.publishText}>Publicar</Text>
            )}
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior="padding"
          enabled={Platform.OS !== 'web'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            <ProfileSwitcher compact />

            <TextInput
              style={styles.captionInput}
              placeholder="¿Qué querés compartir?"
              placeholderTextColor={colors.textMuted}
              multiline
              value={caption}
              onChangeText={setCaption}
              maxLength={POST_CAPTION_MAX}
            />
            <View style={styles.metaRow}>
              <Text style={styles.hint}>Contá algo, compartí una foto o elegí un fondo.</Text>
              <Text style={styles.counter}>
                {caption.length}/{POST_CAPTION_MAX}
              </Text>
            </View>

            <View style={styles.actions}>
              <Pressable
                style={[styles.actionBtn, (panel === 'photo' || showPhoto) && styles.actionBtnActive]}
                onPress={onPressPhoto}
                accessibilityLabel="Foto"
              >
                <Ionicons name="camera-outline" size={22} color={colors.primary} />
                <Text style={styles.actionText}>Foto</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, (panel === 'background' || showBackground) && styles.actionBtnActive]}
                onPress={onPressBackground}
                accessibilityLabel="Fondo"
              >
                <Ionicons name="color-palette-outline" size={22} color={colors.primary} />
                <Text style={styles.actionText}>Fondo</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, (panel === 'pet' || !!activePetId) && styles.actionBtnActive]}
                onPress={() => openPanel('pet')}
                accessibilityLabel="Protagonista"
              >
                <Ionicons name="paw-outline" size={22} color={colors.primary} />
                <Text style={styles.actionText}>Protagonista</Text>
              </Pressable>
            </View>

            {showPhoto ? (
              <>
                <Pressable style={styles.preview} onPress={pickFromGallery}>
                  <SelectedImagePreview uri={previewUri || photo!} loading={uploading} />
                </Pressable>
                {uploadNote !== '' && <Text style={styles.uploadNote}>{uploadNote}</Text>}
                <View style={styles.photoActions}>
                  <Pressable style={styles.changePhotoBtn} onPress={pickFromGallery}>
                    <Ionicons name="swap-horizontal" size={15} color={colors.primary} />
                    <Text style={styles.changePhotoText}>Cambiar foto</Text>
                  </Pressable>
                  <Pressable style={styles.changePhotoBtn} onPress={clearPhoto}>
                    <Ionicons name="close-circle-outline" size={15} color={colors.primary} />
                    <Text style={styles.changePhotoText}>Quitar foto</Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            {showBackground ? (
              <View style={styles.bgPreviewWrap}>
                <PostBackgroundCard
                  backgroundId={backgroundId}
                  text={caption.trim() || 'Tu texto aparecerá aquí'}
                  placeholder={!caption.trim()}
                />
              </View>
            ) : null}

            {activePet && panel !== 'pet' ? (
              <View style={styles.petChip}>
                <PetAvatar uri={activePet.avatarUrl} size={28} style={styles.petChipImg} />
                <Text style={styles.petChipName}>
                  {activePet.name} {activePet.emoji}
                </Text>
              </View>
            ) : null}

            {panel === 'background' && !photo ? (
              <View style={styles.expand}>
                <View style={styles.expandHead}>
                  <Text style={styles.expandTitle}>Elegí un fondo</Text>
                  <Pressable onPress={() => setPanel('none')} hitSlop={8} accessibilityLabel="Cerrar fondos">
                    <Ionicons name="close" size={20} color={colors.textMuted} />
                  </Pressable>
                </View>
                <View style={styles.bgGrid}>
                  {getActivePostBackgrounds().map((bg) => (
                    <PostBackgroundChip
                      key={bg.id}
                      backgroundId={bg.id}
                      selected={bg.id === backgroundId && backgroundTouched}
                      onPress={() => {
                        setBackgroundId(bg.id);
                        setBackgroundTouched(true);
                      }}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {panel === 'pet' ? (
              <View style={styles.expand}>
                <Text style={styles.expandTitle}>¿Quién protagoniza esta publicación?</Text>
                <Pressable
                  style={[styles.petOption, !activePetId && styles.petOptionActive]}
                  onPress={() => setSelectedPet(null)}
                >
                  <View style={[styles.petOptionImg, styles.noneAvatar]}>
                    <Ionicons name="person" size={18} color={colors.textMuted} />
                  </View>
                  <Text style={[styles.petOptionName, !activePetId && { color: colors.primary }]}>Ninguno</Text>
                  {!activePetId && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
                </Pressable>
                {pickerPets.map((p) => {
                  const active = p.id === activePetId;
                  return (
                    <Pressable
                      key={p.id}
                      style={[styles.petOption, active && styles.petOptionActive]}
                      onPress={() => setSelectedPet(p.id)}
                    >
                      <PetAvatar uri={p.avatarUrl} size={34} style={styles.petOptionImg} />
                      <Text style={[styles.petOptionName, active && { color: colors.primary }]}>
                        {p.name} {p.emoji}
                      </Text>
                      {active && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
                    </Pressable>
                  );
                })}
                {canAddPet ? (
                  <Pressable
                    style={styles.petOptionAdd}
                    onPress={() =>
                      navigation.navigate(
                        'AddPet',
                        activeProfile?.type === 'protector' && activeProfile.id
                          ? { profileId: activeProfile.id }
                          : undefined
                      )
                    }
                  >
                    <Ionicons name="add" size={20} color={colors.primary} />
                    <Text style={styles.petOptionAddText}>Nueva</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {panel === 'none' && !showPhoto && !showBackground && !activePetId ? (
              <View style={styles.tip}>
                <Text style={styles.tipEmoji}>💡</Text>
                <Text style={styles.tipText}>
                  Podés agregar una foto, un fondo o elegir una mascota como protagonista. No es obligatorio.
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
    gap: spacing.sm,
  },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: colors.text },
  publishBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  captionInput: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    minHeight: 120,
    fontSize: 16,
    color: colors.text,
    textAlignVertical: 'top',
  },
  metaRow: {
    marginHorizontal: spacing.lg,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  hint: { flex: 1, fontSize: 12, color: colors.textMuted, lineHeight: 16 },
  counter: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: 14,
  },
  actionBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarysoft,
  },
  actionText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  preview: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.card,
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
  },
  changePhotoText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  photoActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  bgPreviewWrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  expand: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  expandHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  expandTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  bgGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  petChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  petChipImg: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.border },
  petChipName: { fontWeight: '700', fontSize: 13, color: colors.text },
  petOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: radius.full,
    paddingRight: 14,
    paddingLeft: 6,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  petOptionActive: { borderColor: colors.primary, backgroundColor: colors.primarysoft },
  petOptionImg: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.border },
  noneAvatar: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarysoft },
  petOptionName: { flex: 1, fontWeight: '700', fontSize: 14, color: colors.text },
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
    alignSelf: 'flex-start',
  },
  petOptionAddText: { fontWeight: '700', fontSize: 13, color: colors.primary },
  tip: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  tipEmoji: { fontSize: 16 },
  tipText: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.text, fontWeight: '600' },
});
}
