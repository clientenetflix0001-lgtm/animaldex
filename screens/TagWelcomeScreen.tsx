// ============================================================
// Animaldex — Pantalla de bienvenida al escanear una chapita QR
// ============================================================
// Solo se muestra cuando el usuario YA está autenticado (si no lo
// estaba, el flujo pasa primero por AuthScreen, que muestra un banner
// avisando que hay una chapita pendiente, y llega aquí automáticamente
// después de iniciar sesión/registrarse).
//
// Comportamiento:
// - Chapita ya asignada a una mascota → redirige directo a su perfil.
// - Chapita nueva/sin asignar → muestra el mensaje de bienvenida y
//   lleva al formulario de registro de mascota (que al guardar,
//   vincula automáticamente esta chapita).
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { db } from '../lib/db';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';
import { thumb, userFallbackAvatar } from '../lib/images';
import { CreateProfileSheet, useProfiles, type PublicProfile } from '../features/profiles';
import {
  addPetParamsForPageQr,
  addPetParamsForPersonalQr,
  protectorPagesForQr,
  qrPageRegisterView,
  type QrPageRegisterView,
} from '../lib/qrPageRegister';
import { centeredParentTextWrap } from '../lib/centeredText';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function TagWelcomeScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'TagWelcome'>>();
  const { code } = route.params;
  const { profiles } = useProfiles();

  const [state, setState] = useState<'loading' | 'unclaimed' | 'claimed' | 'invalid' | 'error'>('loading');
  const [pageView, setPageView] = useState<QrPageRegisterView>('welcome');
  const [selectedPage, setSelectedPage] = useState<PublicProfile | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const protectorPages = protectorPagesForQr(profiles);

  const check = useCallback(async () => {
    setState('loading');
    try {
      const res = await db.tagStatus(code);
      if (!res.exists) {
        setState('invalid');
        return;
      }
      if (res.status === 'claimed' && res.pet) {
        setState('claimed');
        // Pequeña pausa para que se note el mensaje antes de redirigir.
        setTimeout(() => {
          navigation.replace('PetProfile', { petId: res.pet!.id, fromQr: true });
        }, 700);
        return;
      }
      setState('unclaimed');
    } catch {
      setState('error');
    }
  }, [code, navigation]);

  useEffect(() => {
    check();
  }, [check]);

  const goPersonal = useCallback(() => {
    navigation.replace('AddPet', addPetParamsForPersonalQr(code));
  }, [code, navigation]);

  const goPage = useCallback(
    (page: PublicProfile) => {
      navigation.replace('AddPet', addPetParamsForPageQr(code, page.id));
    },
    [code, navigation]
  );

  const openPageRegister = useCallback(() => {
    const pages = protectorPagesForQr(profiles);
    const next = qrPageRegisterView(pages);
    setPageView(next);
    setSelectedPage(pages.length === 1 ? pages[0] : null);
  }, [profiles]);

  const onPageCreated = useCallback((profile: PublicProfile) => {
    if (profile.type !== 'protector') return;
    setSelectedPage(profile);
    setPageView('single');
    setCreateOpen(false);
  }, []);

  if (state === 'loading' || state === 'claimed') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, centeredParentTextWrap]}>
            {state === 'claimed' ? 'Llevándote al perfil de la mascota…' : 'Verificando chapita…'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (state === 'invalid') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <View style={styles.iconWrapMuted}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
          </View>
          <Text style={[styles.title, centeredParentTextWrap]}>Código no válido</Text>
          <Text style={[styles.subtitle, centeredParentTextWrap]}>
            Esta chapita QR (#{code}) no existe en Animaldex. Verifica el enlace o contacta a quien te la entregó.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => navigation.replace('Tabs')}>
            <Text style={styles.primaryBtnText}>Ir al inicio</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (state === 'error') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <View style={styles.iconWrapMuted}>
            <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
          </View>
          <Text style={[styles.title, centeredParentTextWrap]}>No se pudo verificar</Text>
          <Text style={[styles.subtitle, centeredParentTextWrap]}>Revisa tu conexión e inténtalo de nuevo.</Text>
          <Pressable style={styles.primaryBtn} onPress={check}>
            <Text style={styles.primaryBtnText}>Reintentar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const pageCard = (page: PublicProfile, onPress?: () => void) => {
    const inner = (
      <>
        <Image
          source={{ uri: thumb(page.avatar || userFallbackAvatar(page.name || page.username), 80) }}
          style={styles.pageAvatar}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.pageName}>{page.name}</Text>
          <Text style={styles.pageType}>Bienestar Animal</Text>
        </View>
      </>
    );
    if (!onPress) return <View style={styles.pageRow}>{inner}</View>;
    return (
      <Pressable style={styles.pageRow} onPress={onPress} accessibilityLabel={page.name}>
        {inner}
      </Pressable>
    );
  };

  // ---------- unclaimed: mensaje de bienvenida ----------
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.center} keyboardShouldPersistTaps="handled">
        <View style={styles.iconWrap}>
          <Text style={styles.pawEmoji}>🐾</Text>
        </View>
        <Text style={[styles.title, centeredParentTextWrap]}>¡Escaneaste una chapita QR!</Text>
        {pageView === 'welcome' ? (
          <>
            <Text style={[styles.subtitle, centeredParentTextWrap]}>
              Esta chapita (#{code}) todavía no tiene una mascota asignada. Completa estos datos para
              activarla: cada vez que alguien la escanee, llegará directo al perfil de tu mascota.
            </Text>
            <Pressable style={styles.primaryBtn} onPress={goPersonal}>
              <Ionicons name="paw" size={17} color="#fff" />
              <Text style={styles.primaryBtnText}>Registrar mi mascota</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              onPress={openPageRegister}
              accessibilityLabel="Registrar esta mascota en tu página"
            >
              <Text style={styles.secondaryBtnText}>Registrar esta mascota en tu página</Text>
            </Pressable>
          </>
        ) : null}

        {pageView === 'single' && selectedPage ? (
          <>
            <Text style={styles.sectionLabel}>Registrar en:</Text>
            {pageCard(selectedPage)}
            <Pressable style={styles.primaryBtn} onPress={() => goPage(selectedPage)}>
              <Text style={styles.primaryBtnText}>Continuar</Text>
            </Pressable>
            <Pressable onPress={() => setPageView('welcome')}>
              <Text style={styles.backText}>Volver</Text>
            </Pressable>
          </>
        ) : null}

        {pageView === 'many' ? (
          <>
            <Text style={styles.sectionLabel}>¿En qué página querés registrar esta mascota?</Text>
            {protectorPages.map((page) => (
              <View key={page.id}>{pageCard(page, () => goPage(page))}</View>
            ))}
            <Pressable onPress={() => setPageView('welcome')}>
              <Text style={styles.backText}>Volver</Text>
            </Pressable>
          </>
        ) : null}

        {pageView === 'need-create' ? (
          <>
            <Text style={[styles.subtitle, centeredParentTextWrap]}>
              Para registrar mascotas en una página primero necesitás crear una Página de Bienestar Animal.
            </Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => setCreateOpen(true)}
              accessibilityLabel="Crear Bienestar Animal"
            >
              <Text style={styles.primaryBtnText}>Crear Bienestar Animal</Text>
            </Pressable>
            <Pressable onPress={() => setPageView('welcome')}>
              <Text style={styles.backText}>Volver</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
      <CreateProfileSheet
        visible={createOpen}
        initialType="protector"
        lockType
        onClose={() => setCreateOpen(false)}
        onCreated={onPageCreated}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  iconWrap: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.primarysoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  iconWrapMuted: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  pawEmoji: { fontSize: 44 },
  title: { fontSize: 21, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 340,
  },
  loadingText: { fontSize: 14, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 26,
    paddingVertical: 14,
    marginTop: spacing.md,
    alignSelf: 'stretch',
    maxWidth: 360,
    ...shadow.card,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    paddingHorizontal: 26,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignSelf: 'stretch',
    maxWidth: 360,
  },
  secondaryBtnText: { color: colors.text, fontWeight: '800', fontSize: 15 },
  sectionLabel: { fontSize: 15, fontWeight: '800', color: colors.text, textAlign: 'center' },
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'stretch',
    maxWidth: 360,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  pageAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.border },
  pageName: { fontWeight: '800', color: colors.text, fontSize: 15 },
  pageType: { color: colors.textMuted, fontSize: 12, marginTop: 2, fontWeight: '600' },
  backText: { color: colors.primary, fontWeight: '700', marginTop: 4 },
});
