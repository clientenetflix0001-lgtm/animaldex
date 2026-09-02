// ============================================================
// Animaldex — Crear alerta (animal perdido / encontrado)
// ============================================================
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
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { db } from '../lib/db';
import { uploadImage } from '../lib/api';
import { detectCurrentLocality, withProvinceFallback } from '../lib/geo';
import { LocalityPicker } from '../components/LocalityPicker';
import {
  ALERT_CREATE_PRIMARY,
  ALERT_SIGHTING_SUBCHOICES,
  ALERT_SPECIES,
  AlertCreatePrimaryId,
  AlertType,
  alertTypeFromCreatePrimary,
  todayDateString,
  yesterdayDateString,
  isValidDateString,
  dateStringToTimestamp,
} from '../lib/alerts';
import { PET_SEXES } from '../lib/petFields';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';
import { useProfiles } from '../features/profiles';
import { ADOPTION_CONTACT_REQUIRED, parseProtectorAdoptionContact } from '../lib/adoptionContact';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function CreateAlertScreen() {
  const navigation = useNavigation<Nav>();
  const { activeProfile } = useProfiles();

  const [primary, setPrimary] = useState<AlertCreatePrimaryId>('lost');
  const [seenKind, setSeenKind] = useState<'sighting' | 'found' | null>(null);
  const [species, setSpecies] = useState('perro');
  const [petName, setPetName] = useState('');
  const [sex, setSex] = useState<'macho' | 'hembra' | null>(null);
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contactWhatsapp, setContactWhatsapp] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [locality, setLocality] = useState<string | null>(null);
  const [province, setProvince] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [locating, setLocating] = useState(true);
  const [pickerVisible, setPickerVisible] = useState(false);

  const [dateText, setDateText] = useState(todayDateString());

  const type: AlertType | null = alertTypeFromCreatePrimary(primary, seenKind);
  const isProtectorAdoption = type === 'adoption' && activeProfile?.type === 'protector';
  const needsPersonalContact = type === 'adoption' && !isProtectorAdoption;

  // Ubicación por defecto = ubicación actual del usuario (representa
  // dónde se perdió/encontró el animal, no necesariamente su domicilio).
  // El usuario puede cambiarla libremente con "Cambiar ubicación".
  useEffect(() => {
    (async () => {
      const detected = await detectCurrentLocality();
      if (detected && detected.locality) {
        setLocality(detected.locality);
        setProvince(withProvinceFallback(detected.locality, detected.province));
        setLat(detected.lat);
        setLon(detected.lon);
      }
      setLocating(false);
    })();
  }, []);

  const pickPhoto = useCallback(async () => {
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
        setImage(up.url);
        db.registerImage(up.url, undefined, 'alert').catch(() => {});
      }
    } catch (e: any) {
      Alert.alert('Error al subir', e?.message || 'Inténtalo de nuevo');
    } finally {
      setUploading(false);
    }
  }, []);

  const applyLocality = useCallback(
    (entry: { locality: string; province: string | null; lat?: number | null; lon?: number | null }) => {
      setLocality(entry.locality);
      setProvince(entry.province);
      if (entry.lat != null) setLat(entry.lat);
      if (entry.lon != null) setLon(entry.lon);
    },
    []
  );

  const publish = useCallback(async () => {
    const resolvedType = alertTypeFromCreatePrimary(primary, seenKind);
    if (!resolvedType) {
      Alert.alert('¿Qué pasó?', 'Elegí si la viste o si la encontraste y está con vos.');
      return;
    }
    if (!image) {
      Alert.alert('Falta la foto', 'Agrega una foto del animal.');
      return;
    }
    if (description.trim().length < 3) {
      Alert.alert('Falta la descripción', 'Cuenta brevemente qué pasó.');
      return;
    }
    if (!locality) {
      Alert.alert('Falta la ubicación', 'Indica dónde se perdió o encontró el animal.');
      return;
    }
    if (dateText.trim() && !isValidDateString(dateText.trim())) {
      Alert.alert('Fecha inválida', 'Usa el formato DD/MM/AAAA (no puede ser una fecha futura).');
      return;
    }

    const protector = resolvedType === 'adoption' && activeProfile?.type === 'protector';
    let contactWhatsappNorm: string | null | undefined;
    let contactPhoneNorm: string | null | undefined;
    if (resolvedType === 'adoption' && !protector) {
      const parsed = parseProtectorAdoptionContact('protector', contactWhatsapp, contactPhone);
      if (!parsed.ok) {
        Alert.alert('Falta un contacto', parsed.error || ADOPTION_CONTACT_REQUIRED);
        return;
      }
      contactWhatsappNorm = parsed.whatsapp;
      contactPhoneNorm = parsed.phone;
    }

    setSaving(true);
    try {
      const eventDate = dateText.trim() ? dateStringToTimestamp(dateText.trim()) ?? undefined : undefined;
      const { alert } = await db.createAlert({
        type: resolvedType,
        species,
        petName: petName.trim() || undefined,
        sex: resolvedType === 'adoption' ? sex : undefined,
        description: description.trim(),
        image,
        locality,
        province: province || undefined,
        lat,
        lon,
        eventDate,
        authorProfileId: resolvedType === 'adoption' ? activeProfile?.id : undefined,
        contactWhatsapp: contactWhatsappNorm,
        contactPhone: contactPhoneNorm,
      });
      navigation.replace('AlertDetail', { alertId: alert.id });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo publicar la alerta');
    } finally {
      setSaving(false);
    }
  }, [image, description, locality, province, lat, lon, primary, seenKind, species, petName, sex, dateText, navigation, activeProfile, contactWhatsapp, contactPhone]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Tipo de alerta */}
          <Text style={styles.label}>Tipo de alerta *</Text>
          <View style={styles.typeRow}>
            {ALERT_CREATE_PRIMARY.map((opt) => {
              const active = primary === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[styles.typeBtn, active && { backgroundColor: opt.color, borderColor: opt.color }]}
                  onPress={() => {
                    setPrimary(opt.id);
                    if (opt.id !== 'seen-or-found') setSeenKind(null);
                  }}
                >
                  <Text style={[styles.typeBtnText, active && { color: '#fff' }]}>
                    {opt.emoji} {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {primary === 'seen-or-found' ? (
            <>
              <Text style={styles.subLabel}>¿Qué pasó?</Text>
              <View style={styles.subRow}>
                {ALERT_SIGHTING_SUBCHOICES.map((opt) => {
                  const active = seenKind === opt.type;
                  return (
                    <Pressable
                      key={opt.type}
                      style={[styles.subBtn, active && styles.subBtnActive]}
                      onPress={() => setSeenKind(opt.type)}
                    >
                      <Text style={[styles.subBtnText, active && styles.subBtnTextActive]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {/* Foto */}
          <Text style={styles.label}>Foto *</Text>
          <Pressable style={styles.photoWrap} onPress={pickPhoto}>
            {image ? (
              <Image source={{ uri: image }} style={styles.photo} transition={200} />
            ) : (
              <View style={[styles.photo, styles.photoEmpty]}>
                {uploading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="camera" size={28} color={colors.primary} />
                    <Text style={styles.photoHint}>Agregar foto del animal</Text>
                  </>
                )}
              </View>
            )}
          </Pressable>

          {/* Especie */}
          <Text style={styles.label}>Tipo de animal</Text>
          <View style={styles.speciesGrid}>
            {ALERT_SPECIES.map((s) => (
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

          {/* Nombre */}
          <Text style={styles.label}>Nombre (si lo conoces)</Text>
          <TextInput
            style={styles.input}
            placeholder="Toby, Luna..."
            placeholderTextColor={colors.textMuted}
            value={petName}
            onChangeText={setPetName}
            maxLength={40}
          />

          {type === 'adoption' ? (
            <>
              <Text style={styles.label}>Sexo (opcional)</Text>
              <View style={styles.typeRow}>
                {PET_SEXES.map((s) => (
                  <Pressable
                    key={s.id}
                    style={[styles.typeBtn, sex === s.id && styles.speciesChipActive]}
                    onPress={() => setSex(s.id)}
                  >
                    <Text style={[styles.typeBtnText, sex === s.id && { color: '#fff' }]}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>
              {isProtectorAdoption ? (
                <Text style={styles.help}>
                  Las solicitudes usarán el WhatsApp o teléfono de tu Página de refugio.
                </Text>
              ) : null}
              {needsPersonalContact ? (
                <>
                  <Text style={styles.label}>Contacto para adopción *</Text>
                  <Text style={styles.help}>Agregá al menos un WhatsApp o teléfono. No se muestra en el feed.</Text>
                  <TextInput
                    style={styles.input}
                    value={contactWhatsapp}
                    onChangeText={setContactWhatsapp}
                    keyboardType="phone-pad"
                    maxLength={30}
                    placeholder="WhatsApp"
                    placeholderTextColor={colors.textMuted}
                  />
                  <View style={{ height: spacing.sm }} />
                  <TextInput
                    style={styles.input}
                    value={contactPhone}
                    onChangeText={setContactPhone}
                    keyboardType="phone-pad"
                    maxLength={30}
                    placeholder="Teléfono"
                    placeholderTextColor={colors.textMuted}
                  />
                </>
              ) : null}
            </>
          ) : null}

          {/* Descripción */}
          <Text style={styles.label}>Descripción *</Text>
          <TextInput
            style={[styles.input, styles.descInput]}
            placeholder="Color, tamaño, características, collar, actitud, dónde exactamente..."
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={600}
          />

          {/* Ubicación del hecho */}
          <Text style={styles.label}>Ubicación donde se perdió/encontró *</Text>
          {locating ? (
            <View style={styles.locatingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.locatingText}>Detectando tu ubicación actual…</Text>
            </View>
          ) : (
            <Pressable style={styles.locationBox} onPress={() => setPickerVisible(true)}>
              <Ionicons name="location" size={18} color={colors.primary} />
              <Text style={styles.locationText} numberOfLines={1}>
                {locality ?? 'Elegir ubicación'}
              </Text>
              <Text style={styles.changeLocText}>Cambiar</Text>
            </Pressable>
          )}

          {/* Fecha del hecho */}
          <Text style={styles.label}>Fecha *</Text>
          <View style={styles.dateChipsRow}>
            <Pressable style={styles.dateChip} onPress={() => setDateText(todayDateString())}>
              <Text style={styles.dateChipText}>Hoy</Text>
            </Pressable>
            <Pressable style={styles.dateChip} onPress={() => setDateText(yesterdayDateString())}>
              <Text style={styles.dateChipText}>Ayer</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.input}
            placeholder="DD/MM/AAAA"
            placeholderTextColor={colors.textMuted}
            value={dateText}
            onChangeText={setDateText}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />

          <Pressable style={styles.saveBtn} onPress={publish} disabled={saving || uploading}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="megaphone" size={17} color="#fff" />
                <Text style={styles.saveText}>Publicar alerta</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <LocalityPicker
        visible={pickerVisible}
        currentProvince={province}
        title="Ubicación del hecho"
        onClose={() => setPickerVisible(false)}
        onSelect={applyLocality}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: 60, width: '100%', maxWidth: 680, alignSelf: 'center' },
  label: { fontWeight: '700', fontSize: 14, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  typeRow: { gap: spacing.sm },
  typeBtn: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
  },
  typeBtnText: { fontWeight: '700', fontSize: 14, color: colors.text, textAlign: 'center' },
  subLabel: { fontWeight: '700', fontSize: 13, color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
  subRow: { flexDirection: 'row', gap: spacing.sm },
  subBtn: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
  },
  subBtnActive: { backgroundColor: '#2EA65A', borderColor: '#2EA65A' },
  subBtnText: { fontWeight: '700', fontSize: 12.5, color: colors.text, textAlign: 'center' },
  subBtnTextActive: { color: '#fff' },
  help: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm, lineHeight: 17 },
  photoWrap: { marginTop: spacing.xs },
  photo: { width: '100%', height: 200, borderRadius: radius.md },
  photoEmpty: {
    backgroundColor: colors.primarysoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    gap: 6,
  },
  photoHint: { fontSize: 12, color: colors.primary, fontWeight: '600' },
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
  descInput: { minHeight: 100, textAlignVertical: 'top' },
  locatingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  locatingText: { fontSize: 13, color: colors.textMuted },
  locationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
  },
  locationText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  changeLocText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  dateChipsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  dateChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateChipText: { fontSize: 12, fontWeight: '700', color: colors.text },
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
