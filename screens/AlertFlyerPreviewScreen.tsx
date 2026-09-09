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
import { AlertFlyerCanvas } from '../components/AlertFlyerCanvas';
import { FLYER_ASPECT, flyerFromApiAlert, type AlertFlyerSession } from '../lib/alertFlyer';
import { shareFlyerCanvas } from '../lib/alertFlyerShare';
import { db } from '../lib/db';
import { colors, radius, shadow, spacing } from '../lib/theme';
import { RootStackParamList } from '../lib/types';

type Rt = RouteProp<RootStackParamList, 'AlertFlyerPreview'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function AlertFlyerPreviewScreen() {
  const navigation = useNavigation<Nav>();
  const { alertId, session: incoming } = useRoute<Rt>().params || {};
  const flyerRef = useRef<View>(null);
  const [session, setSession] = useState<AlertFlyerSession | null>(incoming || null);
  const [loading, setLoading] = useState(!incoming);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (incoming || !alertId) {
      if (incoming) setSession(incoming);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await db.alertDetail(alertId);
        if (cancelled) return;
        setSession({ source: 'existing', alertId, flyer: flyerFromApiAlert(res.alert) });
      } catch (e: any) {
        if (!cancelled) Alert.alert('No se pudo armar el flyer', e?.message || 'Inténtalo de nuevo');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [alertId, incoming]);

  const share = useCallback(async () => {
    if (!session) return;
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
      setSession({ ...session, source: 'existing', alertId: alert.id });
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

  if (loading || !session) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const canPublish = session.source === 'draft' && !!session.publish && !session.alertId;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View ref={flyerRef} collapsable={false} style={styles.flyerFrame}>
          <AlertFlyerCanvas flyer={session.flyer} />
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
