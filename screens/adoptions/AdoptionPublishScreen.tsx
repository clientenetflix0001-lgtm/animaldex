// ============================================================
// Animaldex Adopciones — publicar (solo web, con cuenta).
// A) Tomar foto  B) Subir foto  C) Subir flyer (sin datos extra).
// Crea una alerta type='adoption' con la localidad fija de la URL.
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '../../components/AppIcon';
import { db, type ApiAlert } from '../../lib/db';
import { useStore } from '../../lib/store';
import { useAppTheme, type ThemeColors, radius, spacing } from '../../lib/theme';
import { RootStackParamList } from '../../lib/types';
import { adoptionLocalityBySlug, DEFAULT_ADOPTION_SLUG } from '../../lib/adoptionLocalities';
import { explainAdoptionImageError, prepareAdoptionImage, type AdoptionImageKind } from '../../lib/adoptionImagePrep';
import { markAdoptionWallRefresh } from '../../lib/adoptionWallRefresh';
import { AdoptionAccountPrompt } from '../../components/adoptions/AdoptionAccountPrompt';
import { shareAlert } from '../../lib/share';
import { adoptionPostShareUrl } from '../../components/adoptions/useAdoptionPostActions';
import { ADOPTIONS_MAX_WIDTH } from './AdoptionsWallScreen';
import {
  adoptionAnalyticsSpecies,
  trackAdoptionPublishCompleted,
  trackAdoptionPublishStarted,
  trackAdoptionShareIntent,
} from '../../lib/adoptionsAnalytics';
import { canUseWebShare } from '../../lib/adoptionsShare';

type Rt = RouteProp<RootStackParamList, 'AdoptionPublish'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;
type Source = 'camera' | 'gallery' | 'flyer';
type Species = 'perro' | 'gato' | 'otro';
type Sex = 'macho' | 'hembra' | null;

const PICKER: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, quality: 1 };

function newAdoptionRequestId(): string {
  return `alert-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function AdoptionPublishScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const route = useRoute<Rt>();
  const navigation = useNavigation<Nav>();
  const { user } = useStore();
  const place = adoptionLocalityBySlug(route.params?.city) || adoptionLocalityBySlug(DEFAULT_ADOPTION_SLUG)!;
  const city = place.slug;

  const [source, setSource] = useState<Source | null>(null);
  const [image, setImage] = useState<{ dataUrl: string; previewUri: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [petName, setPetName] = useState('');
  const [species, setSpecies] = useState<Species>('perro');
  const [flyerSpecies, setFlyerSpecies] = useState<Species | null>(null);
  const [sex, setSex] = useState<Sex>(null);
  const [description, setDescription] = useState('');
  const [contact, setContact] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ApiAlert | null>(null);
  const [retryPick, setRetryPick] = useState<{ asset: ImagePicker.ImagePickerAsset; source: Source } | null>(null);
  const publishingRef = useRef(false);
  const requestIdRef = useRef('');
  const startedRef = useRef(false);

  useEffect(() => {
    if (!user || startedRef.current) return;
    startedRef.current = true;
    trackAdoptionPublishStarted({ city });
  }, [user, city]);

  const kind: AdoptionImageKind = source === 'flyer' ? 'flyer' : 'photo';

  const preparePicked = useCallback(async (asset: ImagePicker.ImagePickerAsset, next: Source) => {
    setPreparing(true);
    setError(null);
    setRetryPick({ asset, source: next });
    try {
      const prepared = await prepareAdoptionImage(asset, next === 'flyer' ? 'flyer' : 'photo');
      requestIdRef.current = newAdoptionRequestId();
      setSource(next);
      setImage(prepared);
      if (next === 'flyer') setFlyerSpecies(null);
      setRetryPick(null);
    } catch (e: unknown) {
      setError(explainAdoptionImageError(e, 'read'));
    } finally {
      setPreparing(false);
    }
  }, []);

  const pick = useCallback(async (next: Source) => {
    setError(null);
    try {
      const result =
        next === 'camera' ? await ImagePicker.launchCameraAsync(PICKER) : await ImagePicker.launchImageLibraryAsync(PICKER);
      if (result.canceled || !result.assets?.[0]) return;
      await preparePicked(result.assets[0], next);
    } catch (e: unknown) {
      setError(explainAdoptionImageError(e, 'read'));
    }
  }, [preparePicked]);

  const reset = useCallback(() => {
    setSource(null);
    setImage(null);
    setFlyerSpecies(null);
    setRetryPick(null);
    setError(null);
    requestIdRef.current = '';
  }, []);

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('AdoptionsWall', { city });
  }, [navigation, city]);

  const publish = useCallback(async () => {
    if (!image || !source || publishingRef.current || !user) return;
    if (kind === 'photo' && !contact.trim()) {
      setError('Agregá un WhatsApp o teléfono para que puedan contactarte.');
      return;
    }
    if (kind === 'flyer' && !flyerSpecies) {
      setError('Elegí si la mascota es perro, gato u otro.');
      return;
    }
    if (!requestIdRef.current) requestIdRef.current = newAdoptionRequestId();
    publishingRef.current = true;
    setPublishing(true);
    setError(null);
    try {
      const res = await db.createAdoptionPost({
        citySlug: city,
        mediaKind: kind,
        image: image.dataUrl,
        clientRequestId: requestIdRef.current,
        ...(kind === 'photo'
          ? { petName: petName.trim(), species, sex, description: description.trim(), contactWhatsapp: contact.trim() }
          : { species: flyerSpecies || undefined }),
      });
      setDone(res.alert);
      if (res.alert?.id) {
        trackAdoptionPublishCompleted({
          adoptionId: res.alert.id,
          species: kind === 'photo' ? species : flyerSpecies || adoptionAnalyticsSpecies(res.alert),
          city,
        });
      }
    } catch (e: unknown) {
      setError(explainAdoptionImageError(e, 'upload'));
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  }, [image, source, user, kind, contact, city, petName, species, sex, description, flyerSpecies]);

  const topBar = (
    <View style={styles.topBar}>
      <Pressable onPress={goBack} hitSlop={10} accessibilityLabel="Volver">
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.topTitle}>Publicar en adopción</Text>
        <Text style={styles.topSub}>{place.locality}</Text>
      </View>
    </View>
  );

  if (done) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          {topBar}
          <View style={styles.doneBox}>
            <Text style={styles.doneTitle}>¡Publicada!</Text>
            <Text style={styles.doneText}>
              Tu publicación ya está en el muro. Se mantiene activa 7 días y después podés renovarla.
            </Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => {
                markAdoptionWallRefresh(city, 'created');
                navigation.replace('AdoptionPost', { city, alertId: done.id });
              }}
            >
              <Text style={styles.primaryBtnText}>Ver publicación</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => {
                trackAdoptionShareIntent({
                  adoptionId: done.id,
                  shareNetwork: canUseWebShare() ? 'native' : 'copy_link',
                  species: adoptionAnalyticsSpecies(done),
                  city,
                });
                shareAlert(done, adoptionPostShareUrl(city, done.id)).catch(() => {});
              }}
            >
              <Text style={styles.secondaryBtnText}>Difundir</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.content}>
          {topBar}
          <AdoptionAccountPrompt
            title="Publicá una mascota en adopción"
            message="Para publicar y administrar tus mascotas, necesitás una cuenta de Animaldex."
            onLogin={() => navigation.navigate('Auth', { mode: 'login' })}
            onRegister={() => navigation.navigate('Auth', { mode: 'register' })}
            onCancel={goBack}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {topBar}

        {!image ? (
          <View style={styles.options}>
            <Option
              styles={styles}
              colors={colors}
              icon="camera-outline"
              title="Tomar foto"
              text="Sacá una foto y completá los datos básicos."
              onPress={() => pick('camera')}
              disabled={preparing}
            />
            <Option
              styles={styles}
              colors={colors}
              icon="images-outline"
              title="Subir foto"
              text="Elegí una foto de tu galería y completá los datos."
              onPress={() => pick('gallery')}
              disabled={preparing}
            />
            <Option
              styles={styles}
              colors={colors}
              icon="document-text-outline"
              title="Subir flyer"
              text="Lo más rápido: subí tu flyer con los datos de contacto y publicá."
              onPress={() => pick('flyer')}
              disabled={preparing}
            />
            {preparing ? <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} /> : null}
            {retryPick && !preparing ? (
              <Pressable style={styles.primaryBtn} onPress={() => preparePicked(retryPick.asset, retryPick.source)}>
                <Text style={styles.primaryBtnText}>Reintentar</Text>
              </Pressable>
            ) : null}
          </View>
        ) : source === 'flyer' && !flyerSpecies ? (
          <View style={styles.form}>
            <Text style={styles.question}>¿Qué mascota estás publicando?</Text>
            <View style={styles.speciesRow}>
              {(['perro', 'gato', 'otro'] as Species[]).map((item) => (
                <Pressable
                  key={item}
                  style={styles.speciesChoice}
                  onPress={() => setFlyerSpecies(item)}
                  accessibilityRole="button"
                >
                  <Text style={styles.speciesChoiceText}>{item === 'perro' ? 'Perro' : item === 'gato' ? 'Gato' : 'Otro'}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.hint}>Flyer seleccionado. Después vas a ver la vista previa.</Text>
            <Pressable onPress={reset} hitSlop={6}>
              <Text style={styles.changeLink}>Cambiar imagen</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.form}>
            <Image
              source={{ uri: image.previewUri }}
              style={[styles.preview, source === 'flyer' && styles.previewFlyer]}
              contentFit="contain"
            />
            <Pressable onPress={reset} hitSlop={6} disabled={publishing}>
              <Text style={styles.changeLink}>Cambiar imagen</Text>
            </Pressable>

            {source === 'flyer' ? (
              <>
                <Text style={styles.label}>¿Qué mascota estás publicando?</Text>
                <View style={styles.speciesRow}>
                  {(['perro', 'gato', 'otro'] as Species[]).map((item) => (
                    <Pressable
                      key={item}
                      style={[styles.speciesChoice, flyerSpecies === item && styles.speciesChoiceOn]}
                      onPress={() => setFlyerSpecies(item)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: flyerSpecies === item }}
                    >
                      <Text style={[styles.speciesChoiceText, flyerSpecies === item && styles.speciesChoiceTextOn]}>
                        {item === 'perro' ? 'Perro' : item === 'gato' ? 'Gato' : 'Otro'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <>
                <Text style={styles.label}>Nombre (opcional)</Text>
                <TextInput
                  style={styles.input}
                  value={petName}
                  onChangeText={setPetName}
                  maxLength={40}
                  placeholder="Ej.: Rambo"
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={styles.label}>Especie</Text>
                <View style={styles.chips}>
                  {(['perro', 'gato', 'otro'] as Species[]).map((s) => (
                    <Chip key={s} styles={styles} active={species === s} onPress={() => setSpecies(s)}>
                      {s === 'perro' ? 'Perro' : s === 'gato' ? 'Gato' : 'Otro'}
                    </Chip>
                  ))}
                </View>
                <Text style={styles.label}>Sexo</Text>
                <View style={styles.chips}>
                  <Chip styles={styles} active={sex === 'macho'} onPress={() => setSex('macho')}>Macho</Chip>
                  <Chip styles={styles} active={sex === 'hembra'} onPress={() => setSex('hembra')}>Hembra</Chip>
                  <Chip styles={styles} active={sex === null} onPress={() => setSex(null)}>No sé</Chip>
                </View>
                <Text style={styles.label}>Descripción (opcional)</Text>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  value={description}
                  onChangeText={setDescription}
                  maxLength={600}
                  multiline
                  placeholder="Edad, tamaño, carácter, vacunas…"
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={styles.label}>WhatsApp o teléfono de contacto</Text>
                <TextInput
                  style={styles.input}
                  value={contact}
                  onChangeText={setContact}
                  maxLength={30}
                  keyboardType="phone-pad"
                  placeholder="Ej.: 387 555 1234"
                  placeholderTextColor={colors.textMuted}
                />
              </>
            )}

            <Text style={styles.hint}>
              {`Se publica en ${place.locality}. Activa 7 días; después podés renovarla.`}
            </Text>

            <Pressable
              style={[styles.primaryBtn, publishing && styles.disabled]}
              onPress={publish}
              disabled={publishing}
            >
              {publishing ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Publicar</Text>}
            </Pressable>
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Option({
  styles,
  colors,
  icon,
  title,
  text,
  onPress,
  disabled,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  text: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable style={[styles.option, disabled && styles.disabled]} onPress={onPress} disabled={disabled}>
      <Ionicons name={icon} size={24} color={colors.text} />
      <View style={{ flex: 1 }}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionText}>{text}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function Chip({
  styles,
  active,
  onPress,
  children,
}: {
  styles: ReturnType<typeof makeStyles>;
  active: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{children}</Text>
    </Pressable>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    content: {
      width: '100%',
      maxWidth: ADOPTIONS_MAX_WIDTH,
      alignSelf: 'center',
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
    topTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
    topSub: { fontSize: 12, color: colors.textMuted },
    options: { gap: spacing.sm },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.md,
    },
    optionTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
    optionText: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    form: { gap: spacing.sm },
    preview: { width: '100%', aspectRatio: 1, borderRadius: radius.md, backgroundColor: colors.surfaceSoft },
    previewFlyer: { aspectRatio: 3 / 4 },
    changeLink: { color: colors.textMuted, fontWeight: '700', fontSize: 13, textAlign: 'center', paddingVertical: 4 },
    label: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: spacing.xs },
    input: {
      backgroundColor: colors.inputBackground,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.text,
    },
    multiline: { minHeight: 80, textAlignVertical: 'top' },
    chips: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
    question: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
    speciesRow: { flexDirection: 'row', gap: spacing.sm },
    speciesChoice: {
      flex: 1,
      minHeight: 72,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 8,
    },
    speciesChoiceOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    speciesChoiceText: { fontSize: 16, fontWeight: '800', color: colors.text },
    speciesChoiceTextOn: { color: '#fff' },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 13, fontWeight: '700', color: colors.text },
    chipTextActive: { color: '#fff' },
    hint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: radius.full,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    secondaryBtn: {
      borderRadius: radius.full,
      paddingVertical: 11,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: spacing.sm,
    },
    secondaryBtnText: { color: colors.text, fontWeight: '700', fontSize: 14 },
    disabled: { opacity: 0.5 },
    error: { color: '#E0483E', fontSize: 13, marginTop: spacing.md, textAlign: 'center' },
    doneBox: { gap: spacing.sm, paddingTop: spacing.md },
    doneTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
    doneText: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  });
}
