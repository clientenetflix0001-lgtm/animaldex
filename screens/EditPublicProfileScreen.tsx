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
import { isValidPublicUsername, normalizePublicUsername } from '../lib/publicHandles';
import { ADOPTION_CONTACT_REQUIRED, parseProtectorAdoptionContact } from '../lib/adoptionContact';
import { LocalityPicker } from '../components/LocalityPicker';
import type { ProfileType } from '../features/profiles/profileTypes';
import BioField from '../components/BioField';
import { BIO_WORD_LIMIT_ERROR, isBioWithinWordLimit } from '../lib/bio';

export default function EditPublicProfileScreen() {
  const navigation = useNavigation<any>();
  const { profileId } = useRoute<RouteProp<RootStackParamList, 'EditPublicProfile'>>().params;
  const { refreshProfiles } = useProfiles();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [locality, setLocality] = useState<string | null>(null);
  const [province, setProvince] = useState<string | null>(null);
  const [profileType, setProfileType] = useState<ProfileType | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [phone, setPhone] = useState('');
  const [adoptionWhatsapp, setAdoptionWhatsapp] = useState('');
  const [adoptionPhone, setAdoptionPhone] = useState('');
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
        setLocality(profile.locality || null);
        setProfileType(profile.type || null);
        setPhone(profile.phone || '');
        setAdoptionWhatsapp(profile.adoptionWhatsapp || '');
        setAdoptionPhone(profile.adoptionPhone || '');
        setAvatarUrl(profile.avatar);
      })
      .catch((e) => Alert.alert('Error', e?.message || 'No se pudo cargar la página'))
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
    const handle = normalizePublicUsername(username);
    if (name.trim().length < 2) {
      Alert.alert('Falta el nombre', 'Escribe el nombre de la página.');
      return;
    }
    if (!isValidPublicUsername(handle)) {
      Alert.alert(
        'Usuario inválido',
        'El @ debe tener 3-20 caracteres: letras, números, punto o guion bajo, y no puede coincidir con una ruta del sistema.'
      );
      return;
    }
    if (!isBioWithinWordLimit(bio)) {
      Alert.alert('Biografía', BIO_WORD_LIMIT_ERROR);
      return;
    }
    if (profileType === 'protector') {
      const contact = parseProtectorAdoptionContact(profileType, adoptionWhatsapp, adoptionPhone);
      if (!contact.ok) {
        Alert.alert('Falta un contacto', contact.error || ADOPTION_CONTACT_REQUIRED);
        return;
      }
    }
    setSaving(true);
    try {
      await db.updatePublicProfile({
        profileId,
        name: name.trim(),
        username: handle,
        bio: bio.trim(),
        location: location.trim(),
        locality: profileType === 'protector' ? locality : undefined,
        phone: phone.trim(),
        avatar: avatarUrl,
        adoptionWhatsapp: profileType === 'protector' ? adoptionWhatsapp.trim() : undefined,
        adoptionPhone: profileType === 'protector' ? adoptionPhone.trim() : undefined,
      });
      await refreshProfiles();
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }, [profileId, name, username, bio, location, locality, profileType, phone, adoptionWhatsapp, adoptionPhone, avatarUrl, refreshProfiles, navigation]);

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
            <Text style={styles.avatarHint}>Cambiar foto de la página</Text>
          </Pressable>

          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            maxLength={60}
            placeholder="Nombre de la página"
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
          <BioField
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            placeholder="Contá de qué se trata esta página..."
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

          {profileType === 'protector' ? (
            <>
              <Text style={styles.sectionTitle}>SOLICITUDES DE ADOPCIÓN</Text>
              <Text style={styles.help}>
                Agregá al menos un medio de contacto para recibir solicitudes de adopción.
              </Text>
              <Text style={styles.label}>WhatsApp</Text>
              <TextInput
                style={styles.input}
                value={adoptionWhatsapp}
                onChangeText={setAdoptionWhatsapp}
                keyboardType="phone-pad"
                maxLength={30}
                placeholder="Número de WhatsApp"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.label}>Teléfono</Text>
              <TextInput
                style={styles.input}
                value={adoptionPhone}
                onChangeText={setAdoptionPhone}
                keyboardType="phone-pad"
                maxLength={30}
                placeholder="Número de teléfono"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.label}>Localidad</Text>
              <Pressable style={styles.locationBox} onPress={() => setPickerVisible(true)}>
                <Ionicons name="location" size={18} color={colors.primary} />
                <Text style={styles.locationText} numberOfLines={1}>
                  {locality || 'Elegir localidad'}
                </Text>
                <Text style={styles.changeLocText}>Cambiar</Text>
              </Pressable>
              <Text style={styles.localityHint}>
                Se usa para mostrar tus mascotas en Adoptar. La dirección de arriba sigue siendo texto libre.
              </Text>
            </>
          ) : null}

          <Pressable style={styles.saveBtn} onPress={save} disabled={saving || uploading || !isBioWithinWordLimit(bio)}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Guardar cambios</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
      <LocalityPicker
        visible={pickerVisible}
        currentProvince={province}
        title="Localidad de Bienestar Animal"
        onClose={() => setPickerVisible(false)}
        onSelect={(entry) => {
          setLocality(entry.locality);
          setProvince(entry.province);
          setPickerVisible(false);
        }}
      />
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
  sectionTitle: {
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.6,
    color: colors.text,
    marginTop: spacing.xl,
  },
  help: { fontSize: 12, color: colors.textMuted, marginTop: 6, lineHeight: 17 },
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
  locationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },
  locationText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  changeLocText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  localityHint: { fontSize: 12, color: colors.textMuted, marginTop: 6, lineHeight: 17 },
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
