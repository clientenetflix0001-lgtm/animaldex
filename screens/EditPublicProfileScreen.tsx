import React, { useCallback, useEffect, useState } from 'react';
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
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { db } from '../lib/db';
import { uploadImage } from '../lib/api';
import { userFallbackAvatar } from '../lib/images';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';
import { useProfiles } from '../features/profiles';

export default function EditPublicProfileScreen() {
  const navigation = useNavigation<any>();
  const { profileId } = useRoute<RouteProp<RootStackParamList, 'EditPublicProfile'>>().params;
  const { refreshProfiles } = useProfiles();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.publicProfile({ profileId })
      .then(({ profile }) => {
        setName(profile.name);
        setUsername(profile.username);
        setBio(profile.bio || '');
        setLocation(profile.location || '');
        setPhone(profile.phone || '');
        setAvatarUrl(profile.avatar);
      })
      .catch((e) => Alert.alert('Error', e?.message || 'No se pudo cargar el perfil'))
      .finally(() => setLoading(false));
  }, [profileId]);

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
    const handle = username.trim().replace(/^@/, '').toLowerCase();
    if (name.trim().length < 2) {
      Alert.alert('Falta el nombre', 'Escribe el nombre del perfil.');
      return;
    }
    if (!/^[a-z0-9_.]{3,20}$/.test(handle)) {
      Alert.alert('Usuario inválido', 'El @ debe tener 3-20 caracteres: letras, números, punto o guion bajo.');
      return;
    }
    setSaving(true);
    try {
      await db.updatePublicProfile({
        profileId,
        name: name.trim(),
        username: handle,
        bio: bio.trim(),
        location: location.trim(),
        phone: phone.trim(),
        avatar: avatarUrl,
      });
      await refreshProfiles();
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }, [profileId, name, username, bio, location, phone, avatarUrl, refreshProfiles, navigation]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable style={styles.avatarWrap} onPress={pickAvatar}>
            <Image
              source={{ uri: avatarUrl ?? userFallbackAvatar(username || 'perfil') }}
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
            placeholder="Nombre del perfil"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Usuario</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
            placeholder="@usuario"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Biografía</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            maxLength={200}
            multiline
            placeholder="Contá de qué se trata este perfil..."
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Teléfono (opcional)</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            maxLength={30}
            placeholder="+54 11 5555 0000"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Dirección (opcional)</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            maxLength={80}
            placeholder="Calle, ciudad"
            placeholderTextColor={colors.textMuted}
          />

          <Pressable style={styles.saveBtn} onPress={save} disabled={saving || uploading}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Guardar cambios</Text>}
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
