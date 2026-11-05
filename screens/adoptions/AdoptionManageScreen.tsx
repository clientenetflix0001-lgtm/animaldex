// ============================================================
// Animaldex Adopciones — gestión privada de una publicación sin cuenta.
// /adopciones/:city/gestionar#<alertId>.<token> (solo web).
// El token vive en el fragmento: no viaja en la ruta ni queda en logs.
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '../../components/AppIcon';
import { db, type ApiAlert } from '../../lib/db';
import { useAppTheme, type ThemeColors, spacing } from '../../lib/theme';
import { RootStackParamList } from '../../lib/types';
import { adoptionLocalityBySlug, DEFAULT_ADOPTION_SLUG } from '../../lib/adoptionLocalities';
import { currentManageFragment, removeGuestLink, saveGuestLink } from '../../lib/adoptionGuestLinks';
import { AdoptionPostRow } from '../../components/adoptions/AdoptionPostRow';
import { ADOPTIONS_MAX_WIDTH } from './AdoptionsWallScreen';
import { confirmAction, notify } from './AdoptionMineScreen';

type Rt = RouteProp<RootStackParamList, 'AdoptionManage'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function AdoptionManageScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const route = useRoute<Rt>();
  const navigation = useNavigation<Nav>();
  const place = adoptionLocalityBySlug(route.params?.city) || adoptionLocalityBySlug(DEFAULT_ADOPTION_SLUG)!;
  const city = place.slug;
  const [fragment] = useState(() => currentManageFragment());
  const [alert, setAlert] = useState<ApiAlert | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'invalid' | 'deleted'>('loading');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!fragment) {
      setState('invalid');
      return;
    }
    try {
      const res = await db.guestAdoptionStatus(fragment.alertId, fragment.token);
      setAlert(res.alert);
      setState('ok');
      saveGuestLink({ alertId: fragment.alertId, token: fragment.token, city, expiresAt: res.alert.expiresAt || 0 });
    } catch {
      removeGuestLink(fragment.alertId);
      setState('invalid');
    }
  }, [fragment, city]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = useCallback(async () => {
    if (!fragment || busy) return;
    if (!(await confirmAction('Eliminar publicación', 'Se borra la publicación. No se puede deshacer.'))) return;
    setBusy(true);
    try {
      await db.guestAdoptionDelete(fragment.alertId, fragment.token);
      removeGuestLink(fragment.alertId);
      setState('deleted');
    } catch (e: any) {
      notify(e?.message || 'No se pudo eliminar.');
    } finally {
      setBusy(false);
    }
  }, [fragment, busy]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Pressable onPress={() => navigation.navigate('AdoptionsWall', { city })} hitSlop={10} accessibilityLabel="Ir al muro">
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.topTitle}>Tu publicación</Text>
            <Text style={styles.topSub}>Adopciones · {place.locality}</Text>
          </View>
        </View>

        {state === 'loading' ? <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} /> : null}

        {state === 'ok' && alert ? (
          <>
            <AdoptionPostRow
              alert={alert}
              now={Date.now()}
              busy={busy}
              note="Se elimina automáticamente al vencer."
              actions={[
                { key: 'view', label: 'Ver', onPress: () => navigation.navigate('AdoptionPost', { city, alertId: alert.id }) },
                { key: 'delete', label: 'Eliminar', danger: true, onPress: remove },
              ]}
            />
            <Text style={styles.hint}>
              Este enlace es privado. No lo compartas: quien lo tenga puede eliminar la publicación.
            </Text>
          </>
        ) : null}

        {state === 'invalid' ? (
          <Text style={styles.message}>El enlace no es válido o la publicación ya no existe.</Text>
        ) : null}
        {state === 'deleted' ? <Text style={styles.message}>Listo. La publicación fue eliminada.</Text> : null}
      </ScrollView>
    </SafeAreaView>
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
      gap: spacing.md,
    },
    topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
    topTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
    topSub: { fontSize: 12, color: colors.textMuted },
    hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
    message: { fontSize: 14, color: colors.text, textAlign: 'center', marginTop: spacing.xl },
  });
}
