import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { db } from '../lib/db';
import {
  externalLeaveNote,
  externalWarning,
  pageToExternalAdoptionNote,
  pageToPersonalWarning,
  personalToPageWarning,
  transferablePages,
} from '../lib/petTransfer';
import { thumb, userFallbackAvatar } from '../lib/images';
import { colors, spacing, radius, shadow } from '../lib/theme';
import type { PublicProfile } from '../features/profiles/profileTypes';
import { PROFILE_TYPE_BADGE } from '../features/profiles/profileTypes';

type Step = 'menu' | 'pages' | 'confirm-page' | 'confirm-personal' | 'user' | 'confirm-user';
type LookupKind = 'email' | 'phone';

interface Props {
  visible: boolean;
  petId: string;
  petName: string;
  isPersonal: boolean;
  pageName?: string | null;
  pages: PublicProfile[];
  onClose: () => void;
  onTransferred: () => void;
}

export default function TransferPetSheet({
  visible,
  petId,
  petName,
  isPersonal,
  pageName,
  pages,
  onClose,
  onTransferred,
}: Props) {
  const protectorPages = useMemo(() => transferablePages(pages), [pages]);
  const [step, setStep] = useState<Step>('menu');
  const [selectedPage, setSelectedPage] = useState<PublicProfile | null>(null);
  const [lookupKind, setLookupKind] = useState<LookupKind>('email');
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setStep('menu');
    setSelectedPage(null);
    setLookupKind('email');
    setIdentifier('');
    setBusy(false);
    setError('');
  };

  const close = () => {
    reset();
    onClose();
  };

  const runInternal = async (target: 'page' | 'personal', profileId?: string) => {
    setBusy(true);
    setError('');
    try {
      await db.transferPetInternal(petId, target, profileId);
      reset();
      onTransferred();
    } catch (e: any) {
      setError(e?.message || 'No se pudo transferir');
    } finally {
      setBusy(false);
    }
  };

  const sendExternal = async () => {
    const value = identifier.trim();
    if (!value) {
      setError('Ingresá el correo electrónico o número de teléfono.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await db.createPetTransferRequest(petId, value);
      reset();
      onTransferred();
    } catch (e: any) {
      setError(e?.message || 'No se pudo enviar la solicitud');
    } finally {
      setBusy(false);
    }
  };

  const title =
    step === 'user' || step === 'confirm-user'
      ? 'Transferir mascota a otro usuario'
      : 'Transferir perfil';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={close} hitSlop={8} accessibilityLabel="Cerrar">
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.xl }}>
          {step === 'menu' && (
            <View style={{ gap: spacing.sm }}>
              {isPersonal ? (
                <Pressable
                  style={styles.option}
                  onPress={() => {
                    if (protectorPages.length === 0) {
                      Alert.alert('Sin páginas', 'Todavía no tenés una página de Bienestar Animal.');
                      return;
                    }
                    setStep('pages');
                  }}
                >
                  <Text style={styles.optionTitle}>Transferir esta mascota a una de mis páginas</Text>
                  <Text style={styles.optionHint}>Pasa a una página de Bienestar Animal que administres.</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.option} onPress={() => setStep('confirm-personal')}>
                  <Text style={styles.optionTitle}>Transferir perfil a Mis mascotas</Text>
                  <Text style={styles.optionHint}>Queda en tu perfil personal, en la misma cuenta.</Text>
                </Pressable>
              )}
              <Pressable style={styles.option} onPress={() => setStep('user')}>
                <Text style={styles.optionTitle}>Transferir perfil a un usuario</Text>
                <Text style={styles.optionHint}>Se envía una solicitud. La titularidad no cambia hasta que acepte.</Text>
              </Pressable>
            </View>
          )}

          {step === 'pages' && (
            <View style={{ gap: spacing.sm }}>
              <Text style={styles.prompt}>¿A qué página querés transferir esta mascota?</Text>
              {protectorPages.map((page) => (
                <Pressable
                  key={page.id}
                  style={styles.pageRow}
                  onPress={() => {
                    setSelectedPage(page);
                    setStep('confirm-page');
                  }}
                >
                  <Image
                    source={{ uri: thumb(page.avatar || userFallbackAvatar(page.username), 80) }}
                    style={styles.pageAvatar}
                    transition={200}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pageName}>{page.name}</Text>
                    <Text style={styles.pageType}>{PROFILE_TYPE_BADGE.protector || 'Bienestar Animal'}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {step === 'confirm-page' && selectedPage && (
            <View style={{ gap: spacing.md }}>
              <Text style={styles.warn}>{personalToPageWarning()}</Text>
              <Text style={styles.optionHint}>
                Esta mascota dejará de aparecer en Mis mascotas y pasará a formar parte de la página
                seleccionada. Podrás seguir administrándola desde esa página.
              </Text>
              <View style={styles.actions}>
                <Pressable style={styles.ghostBtn} onPress={close} disabled={busy}>
                  <Text style={styles.ghostText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={styles.primaryBtn}
                  onPress={() => runInternal('page', selectedPage.id)}
                  disabled={busy}
                >
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Transferir</Text>}
                </Pressable>
              </View>
            </View>
          )}

          {step === 'confirm-personal' && (
            <View style={{ gap: spacing.md }}>
              <Text style={styles.warn}>{pageToPersonalWarning(pageName)}</Text>
              <View style={styles.actions}>
                <Pressable style={styles.ghostBtn} onPress={close} disabled={busy}>
                  <Text style={styles.ghostText}>Cancelar</Text>
                </Pressable>
                <Pressable style={styles.primaryBtn} onPress={() => runInternal('personal')} disabled={busy}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Transferir</Text>}
                </Pressable>
              </View>
            </View>
          )}

          {step === 'user' && (
            <View style={{ gap: spacing.md }}>
              <Text style={styles.prompt}>
                Ingresá el correo electrónico o número de teléfono de la persona que recibirá la mascota.
              </Text>
              <View style={styles.kindRow}>
                <Pressable
                  style={[styles.kindBtn, lookupKind === 'email' && styles.kindActive]}
                  onPress={() => setLookupKind('email')}
                >
                  <Text style={[styles.kindText, lookupKind === 'email' && styles.kindTextActive]}>
                    Correo electrónico
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.kindBtn, lookupKind === 'phone' && styles.kindActive]}
                  onPress={() => setLookupKind('phone')}
                >
                  <Text style={[styles.kindText, lookupKind === 'phone' && styles.kindTextActive]}>Teléfono</Text>
                </Pressable>
              </View>
              <TextInput
                style={styles.input}
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={lookupKind === 'email' ? 'email-address' : 'phone-pad'}
                placeholder={lookupKind === 'email' ? 'correo@ejemplo.com' : 'Número de teléfono'}
                placeholderTextColor={colors.textMuted}
              />
              <Pressable style={styles.primaryBtn} onPress={() => setStep('confirm-user')}>
                <Text style={styles.primaryText}>Continuar</Text>
              </Pressable>
            </View>
          )}

          {step === 'confirm-user' && (
            <View style={{ gap: spacing.md }}>
              <Text style={styles.warn}>{externalWarning()}</Text>
              <Text style={styles.optionHint}>{externalLeaveNote()}</Text>
              {!isPersonal && <Text style={styles.optionHint}>{pageToExternalAdoptionNote(pageName)}</Text>}
              <View style={styles.actions}>
                <Pressable style={styles.ghostBtn} onPress={close} disabled={busy}>
                  <Text style={styles.ghostText}>Cancelar</Text>
                </Pressable>
                <Pressable style={styles.primaryBtn} onPress={sendExternal} disabled={busy}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Enviar solicitud</Text>}
                </Pressable>
              </View>
            </View>
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '82%',
    ...shadow.card,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.text, flex: 1, paddingRight: spacing.sm },
  prompt: { fontSize: 14, fontWeight: '600', color: colors.text, lineHeight: 20 },
  option: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  optionHint: { fontSize: 13, color: colors.textMuted, marginTop: 4, lineHeight: 18 },
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pageAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.border },
  pageName: { fontSize: 15, fontWeight: '800', color: colors.text },
  pageType: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginTop: 2 },
  warn: { fontSize: 14, fontWeight: '700', color: colors.text, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  ghostBtn: {
    flex: 1,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: colors.card,
  },
  ghostText: { fontWeight: '700', color: colors.text },
  primaryBtn: {
    flex: 1,
    borderRadius: radius.full,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: colors.primary,
  },
  primaryText: { fontWeight: '800', color: '#fff' },
  kindRow: { flexDirection: 'row', gap: spacing.sm },
  kindBtn: {
    flex: 1,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: 8,
  },
  kindActive: { backgroundColor: colors.primarysoft, borderColor: colors.primary },
  kindText: { fontSize: 12, fontWeight: '700', color: colors.text },
  kindTextActive: { color: colors.primary },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  error: { color: colors.heart, fontWeight: '700', marginTop: spacing.md },
});
