// ============================================================
// Animaldex — Pantalla de bienvenida al escanear una chapita QR
// ============================================================
// Chapita YA vinculada: el visitante (con o sin sesión) ve el perfil
// público. Claim / registro de chapita sin vincular exige login.
//
// Comportamiento:
// - claimed + mascota → PetProfile (anónimo permitido).
// - unclaimed + invitado → Auth, conservando el código pendiente.
// - unclaimed + sesión → bienvenida y registro de mascota.
// - inválida → estado controlado, sin pantalla blanca.
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, ScrollView, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { auth, db } from '../lib/db';
import { useStore } from '../lib/store';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';
import { thumb, userFallbackAvatar } from '../lib/images';
import { CreateProfileSheet, useProfiles, type PublicProfile } from '../features/profiles';
import { guestTagWelcomeHome, publicTagTargetFromStatus, TAG_UNAVAILABLE_TITLE } from '../lib/tagPublicResolve';
import {
  addPetParamsForPageQr,
  addPetParamsForPersonalQr,
  protectorPagesForQr,
  qrPageRegisterView,
  type QrPageRegisterView,
} from '../lib/qrPageRegister';
import {
  QR_LINK_EXISTING_PET_HELP,
  QR_LINK_EXISTING_PET_LABEL,
  QR_REGISTER_NEW_PET_HELP,
  QR_REGISTER_NEW_PET_LABEL,
  QR_REGISTER_PAGE_PET_HELP,
  QR_REGISTER_PAGE_PET_LABEL,
  existingPetsForQr,
  pageSourceForQrContact,
  qrNeedsContactStep,
  qrPageOptionVisible,
} from '../lib/qrTagLink';
import {
  PAGE_PET_CONTACT_VISIBLE_HELP,
  PAGE_PET_CONTACT_VISIBLE_LABEL,
  PET_CONTACT_STEP_HELP,
  PET_CONTACT_STEP_TITLE,
  PET_CONTACT_VISIBLE_HELP,
  PET_CONTACT_VISIBLE_LABEL,
} from '../lib/petOwnerContact';
import { centeredParentTextWrap } from '../lib/centeredText';
import PetAvatar from '../components/PetAvatar';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function TagWelcomeScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'TagWelcome'>>();
  const { code } = route.params;
  const { user, setPendingTagCode, myPets, refreshUser, refreshMyPets } = useStore();
  const { profiles, refreshProfiles } = useProfiles();

  const [state, setState] = useState<'loading' | 'unclaimed' | 'claimed' | 'invalid' | 'error'>('loading');
  const [pageView, setPageView] = useState<QrPageRegisterView | 'contact' | 'pick-existing'>('welcome');
  const [selectedPage, setSelectedPage] = useState<PublicProfile | null>(null);
  const [pendingChoice, setPendingChoice] = useState<'new_personal' | 'existing' | 'new_page' | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [contactWhatsapp, setContactWhatsapp] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactVisible, setContactVisible] = useState(true);
  const [savingContact, setSavingContact] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const protectorPages = protectorPagesForQr(profiles);

  const check = useCallback(async () => {
    setState('loading');
    try {
      const res = await db.tagStatus(code);
      const target = publicTagTargetFromStatus(code, res);
      if (target.kind === 'unavailable') {
        setState('invalid');
        return;
      }
      if (target.kind === 'pet') {
        setState('claimed');
        setTimeout(() => {
          navigation.replace('PetProfile', { petId: target.petId, fromQr: true });
        }, 700);
        return;
      }
      if (!user) {
        setPendingTagCode(code);
        navigation.replace('Auth', { mode: 'login' });
        return;
      }
      setState('unclaimed');
    } catch {
      setState('error');
    }
  }, [code, navigation, user, setPendingTagCode]);

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

  const finishChoice = useCallback(
    (choice: 'new_personal' | 'existing' | 'new_page', page?: PublicProfile | null) => {
      if (choice === 'new_personal') {
        goPersonal();
        return;
      }
      if (choice === 'existing') {
        setPageView('pick-existing');
        return;
      }
      const target = page || selectedPage;
      if (target) goPage(target);
    },
    [goPage, goPersonal, selectedPage]
  );

  const startChoice = useCallback(
    (choice: 'new_personal' | 'existing' | 'new_page') => {
      if (choice === 'new_page') {
        const pages = protectorPagesForQr(profiles);
        if (!pages.length) return;
        setPendingChoice('new_page');
        setSelectedPage(pages.length === 1 ? pages[0] : null);
        if (pages.length === 1 && qrNeedsContactStep(pageSourceForQrContact(pages[0]))) {
          setPageView('contact');
          return;
        }
        setPageView(qrPageRegisterView(pages));
        return;
      }
      setPendingChoice(choice);
      if (qrNeedsContactStep(user)) {
        setPageView('contact');
        return;
      }
      finishChoice(choice);
    },
    [finishChoice, profiles, user]
  );

  const saveContactAndContinue = useCallback(async () => {
    if (!contactWhatsapp.trim() && !contactPhone.trim()) {
      Alert.alert('Falta un contacto', 'Agregá un WhatsApp o un teléfono.');
      return;
    }
    setSavingContact(true);
    try {
      if (pendingChoice === 'new_page' && selectedPage) {
        await auth.updatePetContact({
          profileId: selectedPage.id,
          contactWhatsapp: contactWhatsapp.trim() || null,
          contactPhone: contactPhone.trim() || null,
          petContactVisible: contactVisible,
          requireContact: true,
        });
        await refreshProfiles();
        finishChoice('new_page', selectedPage);
      } else {
        await auth.updatePetContact({
          contactWhatsapp: contactWhatsapp.trim() || null,
          contactPhone: contactPhone.trim() || null,
          petContactVisible: contactVisible,
          requireContact: true,
        });
        await refreshUser();
        finishChoice(pendingChoice || 'new_personal');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo guardar el contacto');
    } finally {
      setSavingContact(false);
    }
  }, [contactPhone, contactVisible, contactWhatsapp, finishChoice, pendingChoice, refreshProfiles, refreshUser, selectedPage]);

  const claimExisting = useCallback(
    async (petId: string) => {
      setClaimingId(petId);
      try {
        await db.claimTag(code, petId);
        await refreshMyPets();
        navigation.replace('PetProfile', { petId, fromQr: true });
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'No se pudo vincular la chapita');
      } finally {
        setClaimingId(null);
      }
    },
    [code, navigation, refreshMyPets]
  );

  const openPageRegister = useCallback(() => {
    startChoice('new_page');
  }, [startChoice]);

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
          <Text style={[styles.title, centeredParentTextWrap]}>{TAG_UNAVAILABLE_TITLE}</Text>
          <Text style={[styles.subtitle, centeredParentTextWrap]}>
            Esta chapita QR (#{code}) no existe en Animaldex. Verifica el enlace o contacta a quien te la entregó.
          </Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => navigation.replace(guestTagWelcomeHome(!!user))}
          >
            <Text style={styles.primaryBtnText}>{user ? 'Ir al inicio' : 'Entendido'}</Text>
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
              Esta chapita (#{code}) todavía no tiene una mascota asignada. Elegí cómo querés vincularla.
            </Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => startChoice('new_personal')}
              accessibilityLabel={QR_REGISTER_NEW_PET_LABEL}
            >
              <Ionicons name="paw" size={17} color="#fff" />
              <Text style={styles.primaryBtnText}>{QR_REGISTER_NEW_PET_LABEL}</Text>
            </Pressable>
            <Text style={[styles.optionHelp, centeredParentTextWrap]}>{QR_REGISTER_NEW_PET_HELP}</Text>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => startChoice('existing')}
              accessibilityLabel={QR_LINK_EXISTING_PET_LABEL}
            >
              <Text style={styles.secondaryBtnText}>{QR_LINK_EXISTING_PET_LABEL}</Text>
            </Pressable>
            <Text style={[styles.optionHelp, centeredParentTextWrap]}>{QR_LINK_EXISTING_PET_HELP}</Text>
            {qrPageOptionVisible(profiles) ? (
              <>
                <Pressable
                  style={styles.secondaryBtn}
                  onPress={openPageRegister}
                  accessibilityLabel={QR_REGISTER_PAGE_PET_LABEL}
                >
                  <Text style={styles.secondaryBtnText}>{QR_REGISTER_PAGE_PET_LABEL}</Text>
                </Pressable>
                <Text style={[styles.optionHelp, centeredParentTextWrap]}>{QR_REGISTER_PAGE_PET_HELP}</Text>
              </>
            ) : null}
          </>
        ) : null}

        {pageView === 'contact' ? (
          <>
            <Text style={[styles.title, centeredParentTextWrap]}>{PET_CONTACT_STEP_TITLE}</Text>
            <Text style={[styles.subtitle, centeredParentTextWrap]}>{PET_CONTACT_STEP_HELP}</Text>
            <TextInput
              style={styles.input}
              value={contactWhatsapp}
              onChangeText={setContactWhatsapp}
              placeholder="WhatsApp"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.input}
              value={contactPhone}
              onChangeText={setContactPhone}
              placeholder="Teléfono"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
            />
            <Pressable style={styles.checkRow} onPress={() => setContactVisible((v) => !v)}>
              <Ionicons
                name={contactVisible ? 'checkbox' : 'square-outline'}
                size={20}
                color={contactVisible ? colors.secondary : colors.textMuted}
              />
              <Text style={styles.checkText}>
                {pendingChoice === 'new_page' ? PAGE_PET_CONTACT_VISIBLE_LABEL : PET_CONTACT_VISIBLE_LABEL}
              </Text>
            </Pressable>
            <Text style={[styles.optionHelp, centeredParentTextWrap]}>
              {pendingChoice === 'new_page' ? PAGE_PET_CONTACT_VISIBLE_HELP : PET_CONTACT_VISIBLE_HELP}
            </Text>
            <Pressable style={styles.primaryBtn} onPress={saveContactAndContinue} disabled={savingContact}>
              <Text style={styles.primaryBtnText}>{savingContact ? 'Guardando…' : 'Continuar'}</Text>
            </Pressable>
            <Pressable onPress={() => setPageView('welcome')}>
              <Text style={styles.backText}>Volver</Text>
            </Pressable>
          </>
        ) : null}

        {pageView === 'pick-existing' ? (
          <>
            <Text style={styles.sectionLabel}>{QR_LINK_EXISTING_PET_LABEL}</Text>
            {existingPetsForQr(myPets).map((pet) => (
              <Pressable
                key={pet.id}
                style={styles.pageRow}
                onPress={() => claimExisting(pet.id)}
                accessibilityLabel={pet.name}
              >
                <PetAvatar uri={pet.avatarUrl} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pageName}>{pet.name}</Text>
                  <Text style={styles.pageType}>{pet.username || 'Mascota'}</Text>
                </View>
                {claimingId === pet.id ? <ActivityIndicator color={colors.primary} /> : null}
              </Pressable>
            ))}
            {existingPetsForQr(myPets).length === 0 ? (
              <Text style={[styles.subtitle, centeredParentTextWrap]}>
                Todavía no tenés mascotas registradas. Creá una nueva para vincular esta chapita.
              </Text>
            ) : null}
            <Pressable onPress={() => setPageView('welcome')}>
              <Text style={styles.backText}>Volver</Text>
            </Pressable>
          </>
        ) : null}

        {pageView === 'single' && selectedPage ? (
          <>
            <Text style={styles.sectionLabel}>Registrar en:</Text>
            {pageCard(selectedPage)}
            <Pressable
              style={styles.primaryBtn}
              onPress={() => {
                if (qrNeedsContactStep(pageSourceForQrContact(selectedPage))) {
                  setPendingChoice('new_page');
                  setPageView('contact');
                  return;
                }
                goPage(selectedPage);
              }}
            >
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
              <View key={page.id}>
                {pageCard(page, () => {
                  setSelectedPage(page);
                  if (qrNeedsContactStep(pageSourceForQrContact(page))) {
                    setPendingChoice('new_page');
                    setPageView('contact');
                    return;
                  }
                  goPage(page);
                })}
              </View>
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
  optionHelp: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: -6, maxWidth: 340 },
  input: {
    alignSelf: 'stretch',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    backgroundColor: colors.card,
  },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, alignSelf: 'stretch', maxWidth: 360 },
  checkText: { flex: 1, fontWeight: '700', color: colors.text, fontSize: 14 },
});
