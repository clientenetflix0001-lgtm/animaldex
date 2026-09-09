import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AlertFlyerCanvas } from '../components/AlertFlyerCanvas';
import { flyerFromApiAlert, type AlertFlyerSession } from '../lib/alertFlyer';
import {
  canvaAutofillStatus,
  canvaSetupHint,
  canvaTemplateSearchUrl,
  createCanvaAutofillJob,
} from '../lib/canvaConnect';
import { db } from '../lib/db';
import { shareAlertFlyer } from '../lib/share';
import { colors, radius, shadow, spacing } from '../lib/theme';
import { RootStackParamList } from '../lib/types';

type Rt = RouteProp<RootStackParamList, 'AlertFlyerPreview'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function AlertFlyerPreviewScreen() {
  const navigation = useNavigation<Nav>();
  const { alertId, session: incoming } = useRoute<Rt>().params || {};
  const [session, setSession] = useState<AlertFlyerSession | null>(incoming || null);
  const [loading, setLoading] = useState(!incoming);
  const [busy, setBusy] = useState(false);
  const [canvaNote, setCanvaNote] = useState('');

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
    await shareAlertFlyer(session.flyer, session.alertId);
  }, [session]);

  const editInCanva = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    setCanvaNote('');
    try {
      const status = canvaAutofillStatus();
      if (status === 'ready') {
        const result = await createCanvaAutofillJob(session.flyer);
        if (result.ok) {
          await Linking.openURL(result.editUrl);
          return;
        }
        setCanvaNote(result.error);
      } else {
        setCanvaNote(canvaSetupHint(status));
      }
      await Linking.openURL(canvaTemplateSearchUrl(session.flyer.type));
    } catch {
      setCanvaNote('No se pudo abrir Canva. El resto de Animaldex sigue funcionando.');
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
        <AlertFlyerCanvas flyer={session.flyer} />
        {canvaNote ? <Text style={styles.note}>{canvaNote}</Text> : null}
        <Pressable style={styles.primary} onPress={share} disabled={busy}>
          <Ionicons name="share-outline" size={18} color="#fff" />
          <Text style={styles.primaryText}>Compartir</Text>
        </Pressable>
        <Pressable style={styles.outline} onPress={editInCanva} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.text} /> : <Text style={styles.outlineText}>Editar en Canva</Text>}
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
  note: { fontSize: 12, lineHeight: 17, color: colors.textMuted, fontWeight: '600' },
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
  outline: {
    borderWidth: 1,
    borderColor: colors.secondary,
    borderRadius: radius.full,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  outlineText: { color: colors.secondary, fontWeight: '800', fontSize: 15 },
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
