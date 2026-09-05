import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { db, ApiPet, ApiPetTransferRequest, ApiTransferUser } from '../lib/db';
import { useStore } from '../lib/store';
import { thumb, petFallbackAvatar } from '../lib/images';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';
import {
  PET_TRANSFER_STALE,
  recipientAcceptConfirm,
  recipientAcceptWarning,
  rejectConfirmCopy,
} from '../lib/petTransfer';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'PetTransferRequest'>;

export default function PetTransferRequestScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { user, refreshMyPets } = useStore();
  const requestId = route.params.requestId;

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState<ApiPetTransferRequest | null>(null);
  const [pet, setPet] = useState<ApiPet | null>(null);
  const [sender, setSender] = useState<ApiTransferUser | null>(null);
  const [pageName, setPageName] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await db.petTransferDetail(requestId);
      setRequest(res.request);
      setPet(res.pet);
      setSender(res.sender);
      setPageName(res.sourcePageName);
      setError('');
    } catch (e: any) {
      setError(e?.message || PET_TRANSFER_STALE);
      setRequest(null);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    load();
  }, [load]);

  const isRecipient = !!request && request.recipientUserId === user?.id;
  const pending = request?.status === 'pending';

  const decide = async (decision: 'accept' | 'reject') => {
    if (!request || !pet) return;
    setBusy(true);
    try {
      await db.respondPetTransfer(request.id, decision);
      await refreshMyPets();
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('No disponible', e?.message || PET_TRANSFER_STALE);
      load();
    } finally {
      setBusy(false);
    }
  };

  const onAccept = () => {
    if (!pet) return;
    Alert.alert('Aceptar transferencia', recipientAcceptConfirm(pet.name), [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Aceptar transferencia', onPress: () => decide('accept') },
    ]);
  };

  const onReject = () => {
    Alert.alert('Rechazar', rejectConfirmCopy(), [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Rechazar', style: 'destructive', onPress: () => decide('reject') },
    ]);
  };

  const statusLabel =
    request?.status === 'accepted'
      ? 'Aceptada'
      : request?.status === 'rejected'
        ? 'Rechazada'
        : request?.status === 'cancelled'
          ? 'Cancelada'
          : 'Pendiente';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Volver">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Solicitud de transferencia</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error || !request || !pet ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error || PET_TRANSFER_STALE}</Text>
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.card}>
            <Image
              source={{ uri: thumb(pet.avatarUrl || petFallbackAvatar(pet.username || pet.name), 160) }}
              style={styles.avatar}
              transition={200}
            />
            <Text style={styles.petName}>{pet.name}</Text>
            {!!pet.username && <Text style={styles.handle}>@{pet.username}</Text>}
            <Text style={styles.meta}>
              {pageName ? `Enviada por ${pageName}` : `Enviada por ${sender?.name || sender?.username || 'un usuario'}`}
            </Text>
            <Text style={styles.status}>Estado: {statusLabel}</Text>
            {pending && isRecipient && (
              <Text style={styles.warn}>{recipientAcceptWarning(pet.name)}</Text>
            )}
          </View>

          {pending && isRecipient && (
            <View style={styles.actions}>
              <Pressable style={styles.ghostBtn} onPress={onReject} disabled={busy}>
                <Text style={styles.ghostText}>Rechazar</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={onAccept} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Aceptar</Text>}
              </Pressable>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  body: { padding: spacing.lg, gap: spacing.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.card,
  },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.border, marginBottom: spacing.md },
  petName: { fontSize: 22, fontWeight: '800', color: colors.text },
  handle: { fontSize: 14, fontWeight: '800', color: colors.primary, marginTop: 4 },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },
  status: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  warn: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  ghostBtn: {
    flex: 1,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: colors.card,
  },
  ghostText: { fontWeight: '700', color: colors.text },
  primaryBtn: {
    flex: 1,
    borderRadius: radius.full,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: colors.primary,
  },
  primaryText: { fontWeight: '800', color: '#fff' },
  error: { fontWeight: '700', color: colors.heart, textAlign: 'center' },
});
