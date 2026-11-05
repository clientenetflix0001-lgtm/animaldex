// ============================================================
// Animaldex Adopciones — Mis publicaciones (solo web, con cuenta).
// Ver, Renovar, Pausar/Reanudar, Eliminar. Sin sesión, invita a entrar.
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '../../components/AppIcon';
import { db, type ApiAlert } from '../../lib/db';
import { useStore } from '../../lib/store';
import { useAppTheme, type ThemeColors, spacing } from '../../lib/theme';
import { RootStackParamList } from '../../lib/types';
import { adoptionLocalityBySlug, DEFAULT_ADOPTION_SLUG } from '../../lib/adoptionLocalities';
import {
  ADOPTION_CYCLE_MS,
  canPauseAdoptionPost,
  canRenewAdoptionPost,
  canResumeAdoptionPost,
} from '../../lib/adoptionLifecycle';
import { AdoptionAccountPrompt } from '../../components/adoptions/AdoptionAccountPrompt';
import { AdoptionPostRow, type RowAction } from '../../components/adoptions/AdoptionPostRow';
import { ADOPTIONS_MAX_WIDTH } from './AdoptionsWallScreen';

type Rt = RouteProp<RootStackParamList, 'AdoptionMine'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export function confirmAction(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Aceptar', style: 'destructive', onPress: () => resolve(true) },
    ])
  );
}

export function notify(message: string): void {
  if (Platform.OS === 'web') window.alert(message);
  else Alert.alert('Animaldex', message);
}

function legacyRenewable(a: ApiAlert, now: number): boolean {
  if (a.expiresAt != null || a.status !== 'active' || a.resolvedAt) return false;
  const last = a.renewedAt || a.createdAt;
  return now - last >= ADOPTION_CYCLE_MS;
}

export default function AdoptionMineScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const route = useRoute<Rt>();
  const navigation = useNavigation<Nav>();
  const { user } = useStore();
  const place = adoptionLocalityBySlug(route.params?.city) || adoptionLocalityBySlug(DEFAULT_ADOPTION_SLUG)!;
  const city = place.slug;

  const [mine, setMine] = useState<ApiAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = Date.now();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!user) {
        setMine([]);
        return;
      }
      const res = await db.myAdoptionPosts();
      setMine(res.alerts);
    } catch (e: any) {
      setError(e?.message || 'No pudimos cargar tus publicaciones.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const run = useCallback(
    async (alertId: string, fn: () => Promise<unknown>) => {
      setBusyId(alertId);
      try {
        await fn();
        await load();
      } catch (e: any) {
        notify(e?.message || 'No se pudo completar la acción.');
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  const view = useCallback(
    (alertId: string) => navigation.navigate('AdoptionPost', { city, alertId }),
    [navigation, city]
  );

  const accountActions = (a: ApiAlert): RowAction[] => {
    const list: RowAction[] = [{ key: 'view', label: 'Ver', onPress: () => view(a.id) }];
    if (canRenewAdoptionPost(a, now) || legacyRenewable(a, now)) {
      list.push({ key: 'renew', label: 'Renovar', onPress: () => run(a.id, () => db.renewAdoptionPost(a.id)) });
    }
    if (canPauseAdoptionPost(a, now) && a.expiresAt != null) {
      list.push({ key: 'pause', label: 'Pausar', onPress: () => run(a.id, () => db.pauseAdoptionPost(a.id)) });
    }
    if (canResumeAdoptionPost(a, now)) {
      list.push({ key: 'resume', label: 'Reanudar', onPress: () => run(a.id, () => db.resumeAdoptionPost(a.id)) });
    }
    list.push({
      key: 'delete',
      label: 'Eliminar',
      danger: true,
      onPress: async () => {
        if (!(await confirmAction('Eliminar publicación', 'Se borra la publicación con sus comentarios. No se puede deshacer.'))) return;
        run(a.id, () => db.deleteAdoptionPost(a.id));
      },
    });
    return list;
  };

  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('AdoptionsWall', { city }));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Pressable
            onPress={goBack}
            hitSlop={10}
            accessibilityLabel="Volver"
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.topTitle}>Mis publicaciones</Text>
            <Text style={styles.topSub}>Adopciones · {place.locality}</Text>
          </View>
        </View>

        {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && !user ? (
          <AdoptionAccountPrompt
            title="Tus publicaciones"
            message="Para ver y administrar tus publicaciones, iniciá sesión o creá una cuenta."
            onLogin={() => navigation.navigate('Auth', { mode: 'login' })}
            onRegister={() => navigation.navigate('Auth', { mode: 'register' })}
            onCancel={goBack}
          />
        ) : null}

        {!loading && user ? (
          <View style={styles.section}>
            {mine.length === 0 ? (
              <Text style={styles.empty}>Todavía no publicaste mascotas en adopción.</Text>
            ) : (
              mine.map((a) => (
                <AdoptionPostRow key={a.id} alert={a} now={now} actions={accountActions(a)} busy={busyId === a.id} />
              ))
            )}
          </View>
        ) : null}
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
    },
    topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
    topTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
    topSub: { fontSize: 12, color: colors.textMuted },
    section: { gap: spacing.sm, marginTop: spacing.sm },
    empty: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: spacing.xl },
    error: { color: '#E0483E', fontSize: 13, textAlign: 'center', marginTop: spacing.md },
  });
}
