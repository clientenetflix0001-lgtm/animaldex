import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AlertFlyerCanvas, FlyerCanvasFallback, FlyerRenderGuard } from '../components/AlertFlyerCanvas';
import { FLYER_ASPECT, flyerFromApiAlert, type AlertFlyerSession } from '../lib/alertFlyer';
import { clearFlyerDraft, getFlyerDraft, isFlyerDraftReady, resolveFlyerPreviewOrigin } from '../lib/alertFlyerSession';
import { shareFlyerCanvas } from '../lib/alertFlyerShare';
import { db } from '../lib/db';
import { colors, radius, shadow, spacing } from '../lib/theme';
import { RootStackParamList } from '../lib/types';

type Rt = RouteProp<RootStackParamList, 'AlertFlyerPreview'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function AlertFlyerPreviewScreen() {
  const navigation = useNavigation<Nav>();
  const params = useRoute<Rt>().params || {};
  const flyerRef = useRef<View>(null);
  const [session, setSession] = useState<AlertFlyerSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const origin = resolveFlyerPreviewOrigin(params);
    if (origin.mode === 'draft') {
      const draft = getFlyerDraft();
      if (isFlyerDraftReady(draft) && draft) {
        setSession(draft);
        setFailed(false);
      } else {
        setSession(null);
        setFailed(true);
      }
      setLoading(false);
      return;
    }
    if (origin.mode === 'invalid') {
      setSession(null);
      setFailed(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await db.alertDetail(origin.alertId);
        if (cancelled) return;
        setSession({ source: 'existing', alertId: origin.alertId, flyer: flyerFromApiAlert(res.alert) });
        setFailed(false);
      } catch (e: any) {
        if (!cancelled) {
          setSession(null);
          setFailed(true);
          Alert.alert('No pudimos preparar el flyer', e?.message || 'Revisá los datos e intentá nuevamente.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.alertId, params.from]);

  const share = useCallback(async () => {
    if (!session?.flyer) return;
    setBusy(true);
    try {
      await shareFlyerCanvas(flyerRef.current, session.flyer, session.alertId);
    } finally {
      setBusy(false);
    }
  }, [session]);

  const publishAlert = useCallback(async () => {
    if (!session?.publish) return;
    setBusy(true);
    try {
      const { alert } = await db.createAlert(session.publish);
      clearFlyerDraft();
      setSession({ ...session, source: 'existing', alertId: alert.id, publish: undefined });
      Alert.alert('Alerta publicada', 'El flyer no reemplaza la alerta: ya está en Alertas.', [
        { text: 'Ver alerta', onPress: () => navigation.replace('AlertDetail', { alertId: alert.id }) },
        { text: 'Seguir aquí', style: 'cancel' },
      ]);
    } catch (e: any) {
      Alert.alert('No se pudo publicar', e?.message || 'Inténtalo de nuevo');
    } finally {
      setBusy(false);
    }
  }, [navigation, session]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.preparing}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.preparingText}>Preparando flyer…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (failed || !session?.flyer) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.missing}>
          <FlyerCanvasFallback />
        </View>
      </SafeAreaView>
    );
  }

  const canPublish = session.source === 'draft' && !!session.publish && !session.alertId;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View ref={flyerRef} collapsable={false} style={styles.flyerFrame}>
          <FlyerRenderGuard>
            <AlertFlyerCanvas flyer={session.flyer} />
          </FlyerRenderGuard>
        </View>
        <Pressable style={styles.primary} onPress={share} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="share-outline" size={18} color="#fff" />
              <Text style={styles.primaryText}>Compartir</Text>
            </>
          )}
        </Pressable>
        {canPublish ? (
          <Pressable style={styles.secondary} onPress={publishAlert} disabled={busy}>
            <Text style={styles.secondaryText}>Publicar en Alertas</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: 48, gap: spacing.md, maxWidth: 520, width: '100%', alignSelf: 'center' },
  flyerFrame: {
    width: '100%',
    aspectRatio: FLYER_ASPECT,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F0E6DA',
    backgroundColor: '#FFF9F2',
  },
  preparing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.bg },
  preparingText: { fontWeight: '800', fontSize: 15, color: colors.text },
  missing: { flex: 1, padding: spacing.xl, backgroundColor: colors.bg },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    ...shadow.card,
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  secondaryText: { color: colors.text, fontWeight: '800', fontSize: 15 },
});
