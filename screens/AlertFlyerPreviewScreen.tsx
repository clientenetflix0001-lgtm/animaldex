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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AlertFlyerCanvas, FlyerCanvasFallback, FlyerRenderGuard } from '../components/AlertFlyerCanvas';
import { FLYER_ASPECT, flyerFromApiAlert, type AlertFlyerSession } from '../lib/alertFlyer';
import { ensureAlertImageUploaded } from '../lib/alertPhotoUpload';
import { clearFlyerDraft, getFlyerDraft, isFlyerDraftReady, resolveFlyerPreviewOrigin } from '../lib/alertFlyerSession';
import { flyerPreviewFooterPadding, flyerPreviewFrameSize, flyerPreviewNeedsScroll } from '../lib/flyerPreviewLayout';
import { shareFlyerCanvas } from '../lib/alertFlyerShare';
import { pushRootScreen } from '../lib/pushRootScreen';
import { CREAR_FLYER_PREVIEW_ROUTE } from '../lib/crearFlyerRoutes';
import { db } from '../lib/db';
import { colors, radius, shadow } from '../lib/theme';

type PreviewParams = { alertId?: string; from?: 'draft' | 'existing' };

export default function AlertFlyerPreviewScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const params = (route.params || {}) as PreviewParams;
  const insets = useSafeAreaInsets();
  const footerPad = flyerPreviewFooterPadding(insets.bottom);
  const flyerRef = useRef<View>(null);
  const [session, setSession] = useState<AlertFlyerSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [area, setArea] = useState({ width: 0, height: 0 });

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
    if (session.publish.description.trim().length < 3) {
      Alert.alert(
        'Falta la descripción',
        'Para publicar en Alertas agregá una descripción breve. El flyer ya se puede compartir.'
      );
      return;
    }
    setBusy(true);
    try {
      const image = await ensureAlertImageUploaded(session.publish.image);
      const { alert } = await db.createAlert({ ...session.publish, image });
      clearFlyerDraft();
      setSession({ ...session, source: 'existing', alertId: alert.id, publish: undefined });
      Alert.alert('Alerta publicada', 'El flyer no reemplaza la alerta: ya está en Alertas.', [
        {
          text: 'Ver alerta',
          onPress: () => {
            if (route.name === CREAR_FLYER_PREVIEW_ROUTE) {
              pushRootScreen('AlertDetail', { alertId: alert.id });
              return;
            }
            navigation.replace('AlertDetail', { alertId: alert.id });
          },
        },
        { text: 'Seguir aquí', style: 'cancel' },
      ]);
    } catch (e: any) {
      Alert.alert('No se pudo publicar', e?.message || 'Inténtalo de nuevo');
    } finally {
      setBusy(false);
    }
  }, [navigation, route.name, session]);

  if (loading) {
    return (
      <View style={styles.safe}>
        <View style={styles.preparing}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.preparingText}>Preparando flyer…</Text>
        </View>
      </View>
    );
  }

  if (failed || !session?.flyer) {
    return (
      <View style={styles.safe}>
        <View style={styles.missing}>
          <FlyerCanvasFallback />
        </View>
      </View>
    );
  }

  const canPublish = session.source === 'draft' && !!session.publish && !session.alertId;
  const frame = flyerPreviewFrameSize(area.width, area.height);
  const needsScroll = flyerPreviewNeedsScroll(frame.height, area.height);

  return (
    <View style={styles.safe}>
      <View
        style={styles.previewArea}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setArea((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
        }}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, needsScroll && styles.scrollOverflow]}
          bounces={false}
        >
          <View
            ref={flyerRef}
            collapsable={false}
            style={[
              styles.flyerFrame,
              frame.width > 0 ? { width: frame.width, height: frame.height } : { width: '100%', aspectRatio: FLYER_ASPECT },
            ]}
          >
            <FlyerRenderGuard>
              <AlertFlyerCanvas flyer={session.flyer} />
            </FlyerRenderGuard>
          </View>
        </ScrollView>
      </View>
      <View style={[styles.footer, { paddingBottom: footerPad }]}>
        {canPublish ? (
          <Pressable style={styles.secondary} onPress={publishAlert} disabled={busy}>
            <Text style={styles.secondaryText}>Publicar en Alertas</Text>
          </Pressable>
        ) : null}
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  previewArea: { flex: 1, minHeight: 0 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollOverflow: {
    flexGrow: 0,
    justifyContent: 'flex-start',
  },
  flyerFrame: {
    aspectRatio: FLYER_ASPECT,
    alignSelf: 'center',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F0E6DA',
    backgroundColor: '#FFFFFF',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  preparing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.bg },
  preparingText: { fontWeight: '800', fontSize: 15, color: colors.text },
  missing: { flex: 1, padding: 24, backgroundColor: colors.bg },
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
