import React, { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
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
import { useProfiles } from '../features/profiles';
import BirthDatePicker from '../components/BirthDatePicker';
import { formatBirthDate, isValidBirthDateParts, parseBirthDate } from '../lib/birthDate';
import {
  FORM_SPECIES,
  PET_SIZES,
  PERSONAL_STATUSES,
  PROTECTOR_STATUSES,
  defaultCareStatus,
} from '../lib/petFields';

function normalizeHandle(raw: string): string {
  return raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_.]/g, '').slice(0, 20);
}
function suggestHandle(name: string): string {
  const base = normalizeHandle(name);
  return base.length >= 3 ? base : (base + 'pet').slice(0, 20);
}
const HANDLE_RE = /^[a-z0-9_.]{3,20}$/;

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function AddPetScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'AddPet'>>();
  const tagCode = route.params?.tagCode;
  const editPetId = route.params?.petId;
  const { refreshMyPets, setPendingTagCode } = useStore();
  const savingRef = useRef(false);
  const createdPetRef = useRef<{ id: string; username: string | null; name: string } | null>(null);
  const { activeProfile } = useProfiles();
  const routeProfileId = route.params?.profileId;
  const protectorProfileId =
    routeProfileId || (activeProfile?.type === 'protector' ? activeProfile.id : null);
  const isProtector = !!protectorProfileId && !editPetId;

  const [realId, setRealId] = useState(editPetId || '');
  const [loadingPet, setLoadingPet] = useState(!!editPetId);
  const [isProtectorPet, setIsProtectorPet] = useState(isProtector);
  const [profileId, setProfileId] = useState<string | null>(protectorProfileId);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [userTouched, setUserTouched] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [species, setSpecies] = useState('perro');
  const [breed, setBreed] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [size, setSize] = useState<string | null>(null);
  const [neutered, setNeutered] = useState<boolean | null>(null);
  const [careStatus, setCareStatus] = useState(defaultCareStatus(isProtector));
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [birthMonth, setBirthMonth] = useState<number | null>(null);
  const [birthDay, setBirthDay] = useState<number | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: editPetId ? 'Editar mascota' : 'Nueva mascota' });
  }, [navigation, editPetId]);

  useEffect(() => {
    if (!userTouched && !editPetId) setUsername(suggestHandle(name));
  }, [name, userTouched, editPetId]);

  useEffect(() => {
    if (!HANDLE_RE.test(username)) {
      setAvailable(null);
      return;
    }
    setChecking(true);
    const t = setTimeout(() => {
      db.checkPetUsername(username, realId || editPetId)
        .then((r) => setAvailable(r.available))
        .catch(() => setAvailable(null))
        .finally(() => setChecking(false));
    }, 280);
    return () => clearTimeout(t);
  }, [username, editPetId, realId]);

  useEffect(() => {
    if (!editPetId) return;
    let cancelled = false;
    (async () => {
      try {
        const { pet } = await db.petProfile(editPetId);
        if (cancelled) return;
        setName(pet.name);
        setUsername(pet.username || suggestHandle(pet.name));
        setRealId(pet.id);
        setUserTouched(true);
        setSpecies(pet.species === 'gato' || pet.species === 'perro' ? pet.species : 'otro');
        setBreed(pet.breed || '');
        setBio(pet.bio || '');
        setAvatarUrl(pet.avatarUrl);
        setSize(pet.size || null);
        setNeutered(pet.neutered ?? null);
        const protector = !!pet.profileId;
        setIsProtectorPet(protector);
        setProfileId(pet.profileId || null);
        setCareStatus(
          (protector
            ? pet.careStatus === 'en_recuperacion'
              ? 'en_recuperacion'
              : 'en_adopcion'
            : pet.careStatus === 'perdido'
            ? 'perdido'
            : 'en_casa')
        );
        const parsed = parseBirthDate(pet.birthDate);
        if (parsed) {
          setBirthYear(parsed.year);
          setBirthMonth(parsed.month);
          setBirthDay(parsed.day);
        }
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'No se pudo cargar la mascota');
      } finally {
        if (!cancelled) setLoadingPet(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editPetId]);

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

  const birthTouched = birthYear != null || birthMonth != null || birthDay != null;
  const birthOk = isValidBirthDateParts(birthYear, birthMonth, birthDay);
  const birthDate = birthOk && birthYear && birthMonth && birthDay ? formatBirthDate(birthYear, birthMonth, birthDay) : null;

  const goToCreatedPet = useCallback((pet: { id: string; username?: string | null }) => {
    const petId = pet.username || pet.id;
    navigation.replace('PetProfile', { petId });
  }, [navigation]);

  const save = useCallback(async () => {
    if (savingRef.current) return;
    if (name.trim().length < 1) {
      Alert.alert('Falta el nombre', 'Ponle nombre a tu mascota 🐾');
      return;
    }
    const handle = normalizeHandle(username || name);
    if (!HANDLE_RE.test(handle)) {
      Alert.alert('Usuario inválido', 'El @ de tu mascota debe tener 3-20 caracteres: letras, números, punto o _.');
      return;
    }
    if (available === false && !createdPetRef.current) {
      Alert.alert('Usuario ocupado', 'Ese nombre o @ ya lo tiene otra mascota. Probá otro.');
      return;
    }
    if (birthTouched && !birthOk) {
      Alert.alert('Fecha inválida', 'Revisá el día, el mes y el año. No se permiten fechas inexistentes ni futuras.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const emoji = FORM_SPECIES.find((s) => s.id === species)?.emoji ?? '🐾';
      const payload = {
        name: name.trim(),
        username: handle,
        species,
        breed: breed.trim(),
        bio: bio.trim(),
        emoji,
        avatarUrl: avatarUrl ?? undefined,
        careStatus,
        birthDate,
        size: (size as 'pequeno' | 'mediano' | 'grande' | null) || null,
        neutered,
        profileId: isProtectorPet ? profileId : null,
      };

      let pet: { id: string; username?: string | null; name: string };
      if (editPetId) {
        const updated = await db.updatePet(realId || editPetId, payload);
        pet = updated.pet;
      } else if (createdPetRef.current) {
        pet = createdPetRef.current;
      } else {
        const created = await db.createPet(payload);
        pet = created.pet;
        createdPetRef.current = {
          id: pet.id,
          username: pet.username || handle,
          name: pet.name,
        };
      }

      if (!editPetId && tagCode != null) {
        try {
          await db.claimTag(tagCode, pet.id);
        } catch (e: any) {
          Alert.alert(
            'Mascota guardada',
            `${pet.name} ya existe, pero no se pudo vincular la chapita: ${e?.message || 'inténtalo de nuevo.'} Tocá Guardar para reintentar el vínculo, sin crear otra mascota.`
          );
          return;
        }
        setPendingTagCode(null);
      }

      refreshMyPets().catch(() => {});
      goToCreatedPet(pet);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo guardar');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [
    name,
    username,
    available,
    species,
    breed,
    bio,
    avatarUrl,
    careStatus,
    birthDate,
    birthTouched,
    birthOk,
    size,
    neutered,
    isProtectorPet,
    profileId,
    refreshMyPets,
    goToCreatedPet,
    setPendingTagCode,
    tagCode,
    realId,
    editPetId,
  ]);

  const statuses = isProtectorPet ? PROTECTOR_STATUSES : PERSONAL_STATUSES;

  if (loadingPet) {
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
          {tagCode != null && (
            <View style={styles.tagBanner}>
              <Ionicons name="qr-code" size={18} color={colors.primary} />
              <Text style={styles.tagBannerText}>
                Esta mascota se vinculará a la chapita QR #{tagCode}
              </Text>
            </View>
          )}
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

          <Text style={styles.label}>Usuario único *</Text>
          <View style={styles.handleWrap}>
            <Text style={styles.handleAt}>@</Text>
            <TextInput
              style={styles.handleInput}
              placeholder="tamy"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={(t) => {
                setUserTouched(true);
                setUsername(normalizeHandle(t));
              }}
              maxLength={20}
            />
            <Text style={styles.handleStatus}>
              {checking ? '…' : available === true ? '✓' : available === false ? '✕' : ''}
            </Text>
          </View>
          <Text style={styles.handleHint}>
            {available === false
              ? 'Ese @ o nombre ya está tomado.'
              : 'Se muestra en el feed y en el perfil. No se puede repetir.'}
          </Text>

          <Text style={styles.label}>Especie</Text>
          <View style={styles.speciesGrid}>
            {FORM_SPECIES.map((s) => (
              <Pressable
                key={s.id}
                style={[styles.speciesChip, species === s.id && styles.speciesChipActive]}
                onPress={() => setSpecies(s.id)}
              >
                <Text style={styles.speciesEmoji}>{s.emoji}</Text>
                <Text style={[styles.speciesText, species === s.id && { color: '#fff' }]}>{s.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Estado</Text>
          <View style={styles.speciesGrid}>
            {statuses.map((s) => (
              <Pressable
                key={s.id}
                style={[styles.speciesChip, careStatus === s.id && styles.speciesChipActive]}
                onPress={() => setCareStatus(s.id)}
              >
                <Text style={[styles.speciesText, careStatus === s.id && { color: '#fff' }]}>
                  {'emoji' in s ? `${s.emoji} ${s.label}` : s.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Porte</Text>
          <View style={styles.speciesGrid}>
            {PET_SIZES.map((s) => (
              <Pressable
                key={s.id}
                style={[styles.speciesChip, size === s.id && styles.speciesChipActive]}
                onPress={() => setSize(s.id)}
              >
                <Text style={[styles.speciesText, size === s.id && { color: '#fff' }]}>{s.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Castrado</Text>
          <View style={styles.speciesGrid}>
            {[
              { id: true, label: 'Sí' },
              { id: false, label: 'No' },
            ].map((s) => (
              <Pressable
                key={String(s.id)}
                style={[styles.speciesChip, neutered === s.id && styles.speciesChipActive]}
                onPress={() => setNeutered(s.id)}
              >
                <Text style={[styles.speciesText, neutered === s.id && { color: '#fff' }]}>{s.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Fecha de nacimiento</Text>
          <BirthDatePicker
            year={birthYear}
            month={birthMonth}
            day={birthDay}
            onChange={({ year, month, day }) => {
              setBirthYear(year);
              setBirthMonth(month);
              setBirthDay(day);
            }}
          />
          {birthTouched && !birthOk && (
            <Text style={styles.dateError}>Esa fecha no existe o es futura. Elegí un día válido.</Text>
          )}

          <Text style={styles.label}>Raza</Text>
          <TextInput
            style={styles.input}
            placeholder="Golden Retriever, Siamés..."
            placeholderTextColor={colors.textMuted}
            value={breed}
            onChangeText={setBreed}
            maxLength={60}
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
                <Text style={styles.saveText}>{editPetId ? 'Guardar cambios' : 'Guardar mascota'}</Text>
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
  handleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
  },
  handleAt: { fontWeight: '900', fontSize: 18, color: colors.primary, marginRight: 4 },
  handleInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: colors.text, fontWeight: '700' },
  handleStatus: { fontWeight: '900', fontSize: 18, color: colors.secondary, width: 22, textAlign: 'center' },
  handleHint: { marginTop: 6, fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  dateError: { marginTop: 6, fontSize: 12, color: colors.heart, fontWeight: '700' },
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
