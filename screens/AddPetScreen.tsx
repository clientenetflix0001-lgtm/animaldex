import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { db } from '../lib/db';
import { uploadImage } from '../lib/api';
import { useStore } from '../lib/store';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const SPECIES = [
  { id: 'perro', label: 'Perro', emoji: '🐶' },
  { id: 'gato', label: 'Gato', emoji: '🐱' },
  { id: 'conejo', label: 'Conejo', emoji: '🐰' },
  { id: 'loro', label: 'Ave', emoji: '🦜' },
  { id: 'hámster', label: 'Hámster', emoji: '🐹' },
  { id: 'otro', label: 'Otro', emoji: '🐾' },
];

export default function AddPetScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'AddPet'>>();
  const tagCode = route.params?.tagCode;
  const { refreshMyPets } = useStore();
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('perro');
  const [breed, setBreed] = useState('');
  const [age, setAge] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const pickAvatar = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const mime = asset.mimeType || 'image/jpeg';
    const dataUrl = asset.base64 ? `data:${mime};base64,${asset.base64}` : asset.uri;
    if (!dataUrl.startsWith('data:')) return;
    setUploading(true);
    try {
      const up = await uploadImage(dataUrl);
      if (up.url.startsWith('data:')) {
        Alert.alert('Error', 'No se pudo subir la imagen a Cloudflare');
      } else {
        setAvatarUrl(up.url);
        db.registerImage(up.url, undefined, 'pet-avatar').catch(() => {});
      }
    } catch (e: any) {
      Alert.alert('Error al subir', e?.message || 'Inténtalo de nuevo');
    } finally {
      setUploading(false);
    }
  }, []);

  const save = useCallback(async () => {
    if (name.trim().length < 1) {
      Alert.alert('Falta el nombre', 'Ponle nombre a tu mascota 🐾');
      return;
    }
    setSaving(true);
    try {
      const emoji = SPECIES.find((s) => s.id === species)?.emoji ?? '🐾';
      const { pet } = await db.createPet({
        name: name.trim(),
        species,
        breed: breed.trim(),
        age: age.trim(),
        bio: bio.trim(),
        emoji,
        avatarUrl: avatarUrl ?? undefined,
      });
      await refreshMyPets();

      // Si esta mascota se está registrando a partir de escanear una
      // chapita QR sin asignar, la vinculamos ahora: a partir de este
      // momento, ese mismo link/QR llevará directo al perfil de la mascota.
      if (tagCode != null) {
        try {
          await db.claimTag(tagCode, pet.id);
          Alert.alert(
            '¡Listo! 🎉',
            `${pet.name} ya tiene su chapita QR activada. La próxima vez que alguien la escanee, llegará directo a su perfil.`,
            [{ text: 'Ver perfil', onPress: () => navigation.replace('PetProfile', { petId: pet.id }) }]
          );
        } catch (e: any) {
          Alert.alert(
            'Mascota guardada',
            `${pet.name} se registró correctamente, pero no se pudo vincular la chapita: ${e?.message || 'inténtalo de nuevo desde el perfil.'}`,
            [{ text: 'Ver perfil', onPress: () => navigation.replace('PetProfile', { petId: pet.id }) }]
          );
        }
        return;
      }

      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }, [name, species, breed, age, bio, avatarUrl, refreshMyPets, navigation, tagCode]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {tagCode != null && (
            <View style={styles.tagBanner}>
              <Ionicons name="qr-code" size={18} color={colors.primary} />
              <Text style={styles.tagBannerText}>
                Esta mascota se vinculará a la chapita QR #{tagCode}
              </Text>
            </View>
          )}
          {/* Avatar */}
          <Pressable style={styles.avatarWrap} onPress={pickAvatar}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} transition={200} />
            ) : (
              <View style={[styles.avatar, styles.avatarEmpty]}>
                {uploading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Ionicons name="camera" size={30} color={colors.primary} />
                )}
              </View>
            )}
            <Text style={styles.avatarHint}>
              {avatarUrl ? 'Cambiar foto' : 'Agregar foto (se guarda en Cloudflare)'}
            </Text>
          </Pressable>

          <Text style={styles.label}>Nombre *</Text>
          <TextInput
            style={styles.input}
            placeholder="Luna, Rocky, Michi..."
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            maxLength={40}
          />

          <Text style={styles.label}>Especie</Text>
          <View style={styles.speciesGrid}>
            {SPECIES.map((s) => (
              <Pressable
                key={s.id}
                style={[styles.speciesChip, species === s.id && styles.speciesChipActive]}
                onPress={() => setSpecies(s.id)}
              >
                <Text style={styles.speciesEmoji}>{s.emoji}</Text>
                <Text style={[styles.speciesText, species === s.id && { color: '#fff' }]}>
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Raza</Text>
          <TextInput
            style={styles.input}
            placeholder="Golden Retriever, Siamés..."
            placeholderTextColor={colors.textMuted}
            value={breed}
            onChangeText={setBreed}
            maxLength={60}
          />

          <Text style={styles.label}>Edad</Text>
          <TextInput
            style={styles.input}
            placeholder="2 años, 8 meses..."
            placeholderTextColor={colors.textMuted}
            value={age}
            onChangeText={setAge}
            maxLength={30}
          />

          <Text style={styles.label}>Biografía</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            placeholder="Cuéntanos de tu mascota..."
            placeholderTextColor={colors.textMuted}
            value={bio}
            onChangeText={setBio}
            multiline
            maxLength={200}
          />

          <Pressable style={styles.saveBtn} onPress={save} disabled={saving || uploading}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="paw" size={17} color="#fff" />
                <Text style={styles.saveText}>Guardar mascota</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    padding: spacing.xl,
    paddingBottom: 60,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  tagBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarysoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  tagBannerText: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.text },
  avatarWrap: { alignItems: 'center', marginBottom: spacing.lg },
  avatar: { width: 110, height: 110, borderRadius: 55 },
  avatarEmpty: {
    backgroundColor: colors.primarysoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  avatarHint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },
  label: { fontWeight: '700', fontSize: 14, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  bioInput: { minHeight: 80, textAlignVertical: 'top' },
  speciesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  speciesChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  speciesChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  speciesEmoji: { fontSize: 15 },
  speciesText: { fontWeight: '600', fontSize: 13, color: colors.text },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 15,
    marginTop: spacing.xl,
    ...shadow.card,
  },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
