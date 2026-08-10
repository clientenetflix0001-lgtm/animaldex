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
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { auth, db } from '../lib/db';
import { uploadImage } from '../lib/api';
import { useStore } from '../lib/store';
import { userFallbackAvatar } from '../lib/images';
import { colors, spacing, radius, shadow } from '../lib/theme';

export default function EditProfileScreen() {
  const navigation = useNavigation<any>();
  const { user, refreshUser } = useStore();
  const [name, setName] = useState(user?.name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [location, setLocation] = useState(user?.location ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
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
        Alert.alert('Error', 'No se pudo subir la imagen');
      } else {
        setAvatarUrl(up.url);
        db.registerImage(up.url, undefined, 'avatar').catch(() => {});
      }
    } catch (e: any) {
      Alert.alert('Error al subir', e?.message || 'Inténtalo de nuevo');
    } finally {
      setUploading(false);
    }
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await auth.updateProfile({
        name: name.trim(),
        bio: bio.trim(),
        location: location.trim(),
        avatarUrl: avatarUrl ?? undefined,
      });
      await refreshUser();
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }, [name, bio, location, avatarUrl, refreshUser, navigation]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable style={styles.avatarWrap} onPress={pickAvatar}>
            <Image
              source={{ uri: avatarUrl ?? userFallbackAvatar(user?.username ?? 'yo') }}
              style={styles.avatar}
              transition={200}
            />
            <View style={styles.cameraBadge}>
              {uploading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="camera" size={16} color="#fff" />
              )}
            </View>
            <Text style={styles.avatarHint}>Cambiar foto de perfil</Text>
          </Pressable>

          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            maxLength={60}
            placeholder="Tu nombre"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Biografía</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            maxLength={200}
            multiline
            placeholder="Cuéntanos de ti y tus mascotas..."
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Ubicación</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            maxLength={60}
            placeholder="Ciudad, País"
            placeholderTextColor={colors.textMuted}
          />

          <Pressable style={styles.saveBtn} onPress={save} disabled={saving || uploading}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveText}>Guardar cambios</Text>
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
  avatarWrap: { alignItems: 'center', marginBottom: spacing.lg },
  avatar: { width: 110, height: 110, borderRadius: 55, backgroundColor: colors.border },
  cameraBadge: {
    position: 'absolute',
    top: 78,
    right: '50%',
    marginRight: -55,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
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
  bioInput: { minHeight: 90, textAlignVertical: 'top' },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.xl,
    ...shadow.card,
  },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
