// ============================================================
// Animaldex — Vender (crear producto o servicio)
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
  categoriesFor,
  DELIVERY_OPTIONS,
  MODALITY_OPTIONS,
  ListingKind,
} from '../lib/market';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const MAX_IMAGES = 6;

export default function CreateListingScreen() {
  const navigation = useNavigation<Nav>();

  const [step, setStep] = useState<'choose' | 'form'>('choose');
  const [kind, setKind] = useState<ListingKind>('product');

  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [pricePatitas, setPricePatitas] = useState('');
  const [priceArs, setPriceArs] = useState('');
  const [stock, setStock] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<string | null>(null);
  const [modality, setModality] = useState<string | null>(null);
  const [availability, setAvailability] = useState('');

  const [locality, setLocality] = useState<string | null>(null);
  const [province, setProvince] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [locating, setLocating] = useState(true);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const chooseKind = useCallback((k: ListingKind) => {
    setKind(k);
    setCategory(null);
    setStep('form');
  }, []);

  const pickPhoto = useCallback(async () => {
    if (images.length >= MAX_IMAGES) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - images.length,
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets?.length) return;

    setUploading(true);
    try {
      for (const asset of result.assets) {
        const mime = asset.mimeType || 'image/jpeg';
        const dataUrl = asset.base64 ? `data:${mime};base64,${asset.base64}` : asset.uri;
        if (!dataUrl.startsWith('data:')) continue;
        const up = await uploadImage(dataUrl);
        if (!up.url.startsWith('data:')) {
          setImages((prev) => [...prev, up.url].slice(0, MAX_IMAGES));
          db.registerImage(up.url, undefined, 'listing').catch(() => {});
        }
      }
    } catch (e: any) {
      Alert.alert('Error al subir', e?.message || 'Inténtalo de nuevo');
    } finally {
      setUploading(false);
    }
  }, [images.length]);

  const removeImage = useCallback((uri: string) => {
    setImages((prev) => prev.filter((i) => i !== uri));
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
    if (images.length === 0) {
      Alert.alert('Faltan fotos', 'Agrega al menos una foto.');
      return;
    }
    if (title.trim().length < 3) {
      Alert.alert('Falta el nombre', kind === 'product' ? 'Ponle nombre al producto.' : 'Ponle nombre al servicio.');
      return;
    }
    if (description.trim().length < 3) {
      Alert.alert('Falta la descripción', 'Cuenta brevemente de qué se trata.');
      return;
    }
    if (!locality) {
      Alert.alert('Falta la ubicación', 'Indica desde dónde vendes.');
      return;
    }
    const patitasNum = Number(pricePatitas.replace(/[^\d]/g, ''));
    if (!patitasNum || patitasNum <= 0) {
      Alert.alert('Falta el precio', 'Ingresa un precio en Patitas mayor a cero.');
      return;
    }

    setSaving(true);
    try {
      const { listing } = await db.createListing({
        kind,
        title: title.trim(),
        category: category ?? 'otros',
        description: description.trim(),
        pricePatitas: patitasNum,
        priceArs: priceArs.trim() ? Number(priceArs.replace(/[^\d]/g, '')) : undefined,
        stock: kind === 'product' && stock.trim() ? Number(stock.replace(/[^\d]/g, '')) : undefined,
        deliveryMethod: kind === 'product' ? deliveryMethod ?? undefined : undefined,
        modality: kind === 'service' ? modality ?? undefined : undefined,
        availability: kind === 'service' && availability.trim() ? availability.trim() : undefined,
        images,
        locality,
        province: province || undefined,
        lat,
        lon,
      });
      navigation.replace('ListingDetail', { listingId: listing.id });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo publicar');
    } finally {
      setSaving(false);
    }
  }, [images, title, description, locality, province, lat, lon, kind, category, pricePatitas, priceArs, stock, deliveryMethod, modality, availability, navigation]);

  // ---------- Paso 1: elegir tipo ----------
  if (step === 'choose') {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.chooseWrap}>
          <Text style={styles.chooseTitle}>¿Qué querés publicar?</Text>
          <Pressable style={styles.chooseCard} onPress={() => chooseKind('product')}>
            <View style={styles.chooseIconWrap}>
              <Text style={styles.chooseEmoji}>🛍️</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.chooseCardTitle}>Producto</Text>
              <Text style={styles.chooseCardText}>Alimentos, juguetes, accesorios y más.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>
          <Pressable style={styles.chooseCard} onPress={() => chooseKind('service')}>
            <View style={[styles.chooseIconWrap, { backgroundColor: colors.secondarySoft }]}>
              <Text style={styles.chooseEmoji}>🛠️</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.chooseCardTitle}>Servicio</Text>
              <Text style={styles.chooseCardText}>Paseos, peluquería, veterinaria y más.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ---------- Paso 2: formulario ----------
  const categories = categoriesFor(kind);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable style={styles.backRow} onPress={() => setStep('choose')}>
            <Ionicons name="chevron-back" size={16} color={colors.primary} />
            <Text style={styles.backText}>{kind === 'product' ? 'Producto' : 'Servicio'} · cambiar tipo</Text>
          </Pressable>

          {/* Fotos */}
          <Text style={styles.label}>Fotos * ({images.length}/{MAX_IMAGES})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {images.map((uri) => (
              <View key={uri} style={styles.photoThumbWrap}>
                <Image source={{ uri }} style={styles.photoThumb} />
                <Pressable style={styles.removePhotoBtn} onPress={() => removeImage(uri)}>
                  <Ionicons name="close" size={13} color="#fff" />
                </Pressable>
              </View>
            ))}
            {images.length < MAX_IMAGES && (
              <Pressable style={styles.addPhotoBtn} onPress={pickPhoto} disabled={uploading}>
                {uploading ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="camera" size={24} color={colors.primary} />}
              </Pressable>
            )}
          </ScrollView>

          {/* Nombre */}
          <Text style={styles.label}>{kind === 'product' ? 'Nombre del producto' : 'Nombre del servicio'} *</Text>
          <TextInput
            style={styles.input}
            placeholder={kind === 'product' ? 'Alimento premium 15kg...' : 'Paseo de perros a domicilio...'}
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />

          {/* Categoría */}
          <Text style={styles.label}>Categoría</Text>
          <View style={styles.chipsWrap}>
            {categories.map((c) => (
              <Pressable
                key={c.id}
                style={[styles.chip, category === c.id && styles.chipActive]}
                onPress={() => setCategory(c.id)}
              >
                <Text style={styles.chipEmoji}>{c.emoji}</Text>
                <Text style={[styles.chipText, category === c.id && { color: '#fff' }]}>{c.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Precio */}
          <Text style={styles.label}>Precio en Patitas *</Text>
          <View style={styles.priceInputWrap}>
            <Text style={styles.pricePrefix}>🐾</Text>
            <TextInput
              style={styles.priceInput}
              placeholder="8500"
              placeholderTextColor={colors.textMuted}
              value={pricePatitas}
              onChangeText={setPricePatitas}
              keyboardType="number-pad"
              maxLength={9}
            />
          </View>

          <Text style={styles.label}>Precio normal (opcional)</Text>
          <View style={styles.priceInputWrap}>
            <Text style={styles.pricePrefix}>$</Text>
            <TextInput
              style={styles.priceInput}
              placeholder="45000"
              placeholderTextColor={colors.textMuted}
              value={priceArs}
              onChangeText={setPriceArs}
              keyboardType="number-pad"
              maxLength={12}
            />
          </View>

          {/* Stock (solo productos) */}
          {kind === 'product' && (
            <>
              <Text style={styles.label}>Stock disponible (opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder="10"
                placeholderTextColor={colors.textMuted}
                value={stock}
                onChangeText={setStock}
                keyboardType="number-pad"
                maxLength={6}
              />
            </>
          )}

          {/* Descripción */}
          <Text style={styles.label}>Descripción *</Text>
          <TextInput
            style={[styles.input, styles.descInput]}
            placeholder={kind === 'product' ? 'Detalles, marca, tamaño, estado...' : 'Qué incluye, duración, experiencia...'}
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={1000}
          />

          {/* Entrega (productos) / Modalidad (servicios) */}
          {kind === 'product' ? (
            <>
              <Text style={styles.label}>Entrega</Text>
              <View style={styles.chipsWrap}>
                {DELIVERY_OPTIONS.map((d) => (
                  <Pressable
                    key={d.id}
                    style={[styles.chip, deliveryMethod === d.id && styles.chipActive]}
                    onPress={() => setDeliveryMethod(deliveryMethod === d.id ? null : d.id)}
                  >
                    <Ionicons name={d.icon as any} size={14} color={deliveryMethod === d.id ? '#fff' : colors.text} />
                    <Text style={[styles.chipText, deliveryMethod === d.id && { color: '#fff' }]}>{d.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <>
              <Text style={styles.label}>Modalidad</Text>
              <View style={styles.chipsWrap}>
                {MODALITY_OPTIONS.map((m) => (
                  <Pressable
                    key={m.id}
                    style={[styles.chip, modality === m.id && styles.chipActive]}
                    onPress={() => setModality(modality === m.id ? null : m.id)}
                  >
                    <Ionicons name={m.icon as any} size={14} color={modality === m.id ? '#fff' : colors.text} />
                    <Text style={[styles.chipText, modality === m.id && { color: '#fff' }]}>{m.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Disponibilidad</Text>
              <TextInput
                style={styles.input}
                placeholder="Lunes a viernes, 9 a 18hs"
                placeholderTextColor={colors.textMuted}
                value={availability}
                onChangeText={setAvailability}
                maxLength={200}
              />
            </>
          )}

          {/* Ubicación */}
          <Text style={styles.label}>{kind === 'product' ? 'Ubicación de venta' : 'Zona donde trabajás'} *</Text>
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

          <Pressable style={styles.saveBtn} onPress={publish} disabled={saving || uploading}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="pricetag" size={17} color="#fff" />
                <Text style={styles.saveText}>Publicar</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <LocalityPicker
        visible={pickerVisible}
        currentProvince={province}
        title="Ubicación de tu publicación"
        onClose={() => setPickerVisible(false)}
        onSelect={applyLocality}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  chooseWrap: { flex: 1, padding: spacing.xl, gap: spacing.md, justifyContent: 'center' },
  chooseTitle: { fontSize: 20, fontWeight: '900', color: colors.text, textAlign: 'center', marginBottom: spacing.lg },
  chooseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
  chooseIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarysoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chooseEmoji: { fontSize: 26 },
  chooseCardTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  chooseCardText: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  scroll: { padding: spacing.xl, paddingBottom: 60, width: '100%', maxWidth: 680, alignSelf: 'center' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: spacing.md },
  backText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  label: { fontWeight: '700', fontSize: 14, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  photoThumbWrap: { position: 'relative' },
  photoThumb: { width: 90, height: 90, borderRadius: radius.md, backgroundColor: colors.border },
  removePhotoBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.heart,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoBtn: {
    width: 90,
    height: 90,
    borderRadius: radius.md,
    backgroundColor: colors.primarysoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
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
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
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
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipEmoji: { fontSize: 15 },
  chipText: { fontWeight: '600', fontSize: 13, color: colors.text },
  priceInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  pricePrefix: { fontSize: 16, fontWeight: '700', color: colors.primary },
  priceInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 12 },
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
