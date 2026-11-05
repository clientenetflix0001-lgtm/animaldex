// ============================================================
// Animaldex Adopciones — publicar (solo web). Con o sin cuenta.
// A) Tomar foto  B) Subir foto  C) Subir flyer (sin datos extra).
// Crea una alerta type='adoption' con la localidad fija de la URL.
// ============================================================
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '../../components/AppIcon';
import { db, type ApiAlert } from '../../lib/db';
import { useStore } from '../../lib/store';
import { useAppTheme, type ThemeColors, radius, spacing } from '../../lib/theme';
import { RootStackParamList } from '../../lib/types';
import { adoptionLocalityBySlug, DEFAULT_ADOPTION_SLUG } from '../../lib/adoptionLocalities';
import { prepareAdoptionImage, type AdoptionImageKind } from '../../lib/adoptionImagePrep';
import { guestManageUrl, saveGuestLink } from '../../lib/adoptionGuestLinks';
import { TurnstileWidget, TURNSTILE_SITE_KEY } from '../../components/adoptions/TurnstileWidget';
import { shareAlert } from '../../lib/share';
import { adoptionPostShareUrl } from '../../components/adoptions/useAdoptionPostActions';
import { ADOPTIONS_MAX_WIDTH } from './AdoptionsWallScreen';

type Rt = RouteProp<RootStackParamList, 'AdoptionPublish'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;
type Source = 'camera' | 'gallery' | 'flyer';
type Species = 'perro' | 'gato' | 'otro';
type Sex = 'macho' | 'hembra' | null;

const PICKER: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, quality: 0.9, base64: true };

export default function AdoptionPublishScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const route = useRoute<Rt>();
  const navigation = useNavigation<Nav>();
  const { user } = useStore();
  const guest = !user;
  const place = adoptionLocalityBySlug(route.params?.city) || adoptionLocalityBySlug(DEFAULT_ADOPTION_SLUG)!;
  const city = place.slug;
  const guestEnabled = !!TURNSTILE_SITE_KEY;

  const [source, setSource] = useState<Source | null>(null);
  const [image, setImage] = useState<{ dataUrl: string; previewUri: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [petName, setPetName] = useState('');
  const [species, setSpecies] = useState<Species>('perro');
  const [sex, setSex] = useState<Sex>(null);
  const [description, setDescription] = useState('');
  const [contact, setContact] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ alert: ApiAlert; manageUrl: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  const kind: AdoptionImageKind = source === 'flyer' ? 'flyer' : 'photo';

  const pick = useCallback(async (next: Source) => {
    setError(null);
    try {
      const result =
        next === 'camera' ? await ImagePicker.launchCameraAsync(PICKER) : await ImagePicker.launchImageLibraryAsync(PICKER);
      if (result.canceled || !result.assets?.[0]) return;
      setPreparing(true);
      const prepared = await prepareAdoptionImage(result.assets[0], next === 'flyer' ? 'flyer' : 'photo');
      setSource(next);
      setImage(prepared);
    } catch (e: any) {
      setError(e?.message || 'No se pudo leer la imagen. Probá con otra.');
    } finally {
      setPreparing(false);
    }
  }, []);

  const reset = useCallback(() => {
    setSource(null);
    setImage(null);
    setError(null);
  }, []);

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('AdoptionsWall', { city });
  }, [navigation, city]);

  const publish = useCallback(async () => {
    if (!image || !source || publishing) return;
    if (guest && !guestEnabled) return;
    if (guest && !turnstileToken) {
      setError('Esperá un segundo mientras verificamos que no seas un robot.');
      return;
    }
    if (kind === 'photo' && !contact.trim()) {
      setError('Agregá un WhatsApp o teléfono para que puedan contactarte.');
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const res = await db.createAdoptionPost({
        citySlug: city,
        mediaKind: kind,
        image: image.dataUrl,
        ...(kind === 'photo'
          ? { petName: petName.trim(), species, sex, description: description.trim(), contactWhatsapp: contact.trim() }
          : {}),
        ...(guest && turnstileToken ? { turnstileToken } : {}),
      });
      let manageUrl: string | null = null;
      if (res.manageToken) {
        manageUrl = guestManageUrl(city, res.alert.id, res.manageToken);
        saveGuestLink({ alertId: res.alert.id, token: res.manageToken, city, expiresAt: res.expiresAt });
      }
      setDone({ alert: res.alert, manageUrl });
    } catch (e: any) {
      setError(e?.message || 'No se pudo publicar. Probá de nuevo.');
      if (guest) {
        setTurnstileToken(null);
        setTurnstileKey((k) => k + 1);
      }
    } finally {
      setPublishing(false);
    }
  }, [image, source, publishing, guest, guestEnabled, turnstileToken, kind, contact, city, petName, species, sex, description]);

  const copyManage = useCallback(async () => {
    if (!done?.manageUrl) return;
    try {
      await Clipboard.setStringAsync(done.manageUrl);
      setCopied(true);
    } catch {}
  }, [done]);

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
              {done.manageUrl
                ? 'Tu publicación ya está en el muro y se mantiene visible durante 7 días.'
                : 'Tu publicación ya está en el muro. Se mantiene activa 7 días y después podés renovarla.'}
            </Text>
            {done.manageUrl ? (
              <View style={styles.manageBox}>
                <Text style={styles.manageTitle}>Tu enlace privado</Text>
                <Text style={styles.manageText}>
                  Guardalo para ver el tiempo restante o eliminar la publicación. No lo compartas: quien lo tenga puede
                  eliminarla.
                </Text>
                <Text style={styles.manageUrl} selectable numberOfLines={2}>
                  {done.manageUrl}
                </Text>
                <Pressable style={styles.secondaryBtn} onPress={copyManage}>
                  <Text style={styles.secondaryBtnText}>{copied ? 'Enlace copiado' : 'Copiar enlace privado'}</Text>
                </Pressable>
              </View>
            ) : null}
            <Pressable
              style={styles.primaryBtn}
              onPress={() => navigation.replace('AdoptionPost', { city, alertId: done.alert.id })}
            >
              <Text style={styles.primaryBtnText}>Ver publicación</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => shareAlert(done.alert, adoptionPostShareUrl(city, done.alert.id)).catch(() => {})}
            >
              <Text style={styles.secondaryBtnText}>Difundir</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const guestBlocked = guest && !guestEnabled;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {topBar}

        {guestBlocked ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>Publicar sin cuenta todavía no está habilitado.</Text>
            <Pressable onPress={() => navigation.navigate('Auth', { mode: 'login' })} hitSlop={6}>
              <Text style={styles.noticeLink}>Iniciar sesión</Text>
            </Pressable>
          </View>
        ) : null}

        {!image ? (
          <View style={styles.options}>
            <Option
              styles={styles}
              colors={colors}
              icon="camera-outline"
              title="Tomar foto"
              text="Sacá una foto y completá los datos básicos."
              onPress={() => pick('camera')}
              disabled={preparing || guestBlocked}
            />
            <Option
              styles={styles}
              colors={colors}
              icon="images-outline"
              title="Subir foto"
              text="Elegí una foto de tu galería y completá los datos."
              onPress={() => pick('gallery')}
              disabled={preparing || guestBlocked}
            />
            <Option
              styles={styles}
              colors={colors}
              icon="document-text-outline"
              title="Subir flyer"
              text="Lo más rápido: subí tu flyer con los datos de contacto y publicá."
              onPress={() => pick('flyer')}
              disabled={preparing || guestBlocked}
            />
            {preparing ? <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} /> : null}
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

            {source !== 'flyer' ? (
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
            ) : null}

            <Text style={styles.hint}>
              {`Se publica en ${place.locality}. ${guest ? 'Sin cuenta: visible 7 días.' : 'Activa 7 días; después podés renovarla.'}`}
            </Text>

            {guest ? <TurnstileWidget key={turnstileKey} onToken={setTurnstileToken} /> : null}

            <Pressable
              style={[styles.primaryBtn, (publishing || guestBlocked) && styles.disabled]}
              onPress={publish}
              disabled={publishing || guestBlocked}
            >
              {publishing ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Publicar</Text>}
            </Pressable>
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {Platform.OS === 'web' && guest && !guestBlocked ? (
          <Text style={styles.footNote}>Protegido por Cloudflare Turnstile.</Text>
        ) : null}
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
    notice: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.warningSoft,
      borderRadius: radius.sm,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    noticeText: { color: colors.text, fontSize: 13 },
    noticeLink: { color: colors.primary, fontWeight: '800', fontSize: 13 },
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
    footNote: { color: colors.textMuted, fontSize: 11, marginTop: spacing.lg, textAlign: 'center' },
    doneBox: { gap: spacing.sm, paddingTop: spacing.md },
    doneTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
    doneText: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
    manageBox: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.md,
      marginTop: spacing.sm,
      gap: 6,
    },
    manageTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
    manageText: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
    manageUrl: { fontSize: 12, color: colors.text },
  });
}
