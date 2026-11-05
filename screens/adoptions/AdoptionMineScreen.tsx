// ============================================================
// Animaldex Adopciones — Mis publicaciones (solo web).
// Con cuenta: Ver, Renovar, Pausar/Reanudar, Eliminar.
// Sin cuenta: enlaces privados guardados en este navegador.
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '../../components/AppIcon';
import { db, type ApiAlert } from '../../lib/db';
import { useStore } from '../../lib/store';
import { useAppTheme, type ThemeColors, radius, spacing } from '../../lib/theme';
import { RootStackParamList } from '../../lib/types';
import { adoptionLocalityBySlug, DEFAULT_ADOPTION_SLUG } from '../../lib/adoptionLocalities';
import {
  ADOPTION_CYCLE_MS,
  canPauseAdoptionPost,
  canRenewAdoptionPost,
  canResumeAdoptionPost,
} from '../../lib/adoptionLifecycle';
import { listGuestLinks, removeGuestLink, type GuestManageLink } from '../../lib/adoptionGuestLinks';
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

type GuestEntry = { link: GuestManageLink; alert: ApiAlert | null };

export default function AdoptionMineScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const route = useRoute<Rt>();
  const navigation = useNavigation<Nav>();
  const { user } = useStore();
  const place = adoptionLocalityBySlug(route.params?.city) || adoptionLocalityBySlug(DEFAULT_ADOPTION_SLUG)!;
  const city = place.slug;

  const [mine, setMine] = useState<ApiAlert[]>([]);
  const [guestEntries, setGuestEntries] = useState<GuestEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = Date.now();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (user) {
        const res = await db.myAdoptionPosts();
        setMine(res.alerts);
      } else {
        setMine([]);
      }
      const links = listGuestLinks();
      const entries = await Promise.all(
        links.map(async (link) => {
          try {
            const res = await db.guestAdoptionStatus(link.alertId, link.token);
            return { link, alert: res.alert };
          } catch (e: any) {
            if (e?.status === 404) removeGuestLink(link.alertId);
            return { link, alert: null };
          }
        })
      );
      setGuestEntries(entries.filter((e) => e.alert));
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

  const guestActions = (entry: GuestEntry): RowAction[] => [
    { key: 'view', label: 'Ver', onPress: () => view(entry.link.alertId) },
    {
      key: 'delete',
      label: 'Eliminar',
      danger: true,
      onPress: async () => {
        if (!(await confirmAction('Eliminar publicación', 'Se borra la publicación. No se puede deshacer.'))) return;
        run(entry.link.alertId, async () => {
          await db.guestAdoptionDelete(entry.link.alertId, entry.link.token);
          removeGuestLink(entry.link.alertId);
        });
      },
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('AdoptionsWall', { city }))}
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

        {!loading && guestEntries.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Publicadas sin cuenta en este dispositivo</Text>
            {guestEntries.map((e) =>
              e.alert ? (
                <AdoptionPostRow
                  key={e.link.alertId}
                  alert={e.alert}
                  now={now}
                  actions={guestActions(e)}
                  busy={busyId === e.link.alertId}
                  note="Se elimina automáticamente al vencer."
                />
              ) : null
            )}
          </View>
        ) : null}

        {!loading && !user ? (
          <View style={styles.guestBox}>
            <Text style={styles.guestText}>
              {guestEntries.length === 0
                ? 'Si publicaste sin cuenta, abrí el enlace privado que recibiste al publicar.'
                : 'Para renovar o pausar publicaciones, publicá con una cuenta.'}
            </Text>
            <Pressable onPress={() => navigation.navigate('Auth', { mode: 'login' })} hitSlop={6}>
              <Text style={styles.link}>Iniciar sesión</Text>
            </Pressable>
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
    sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.textMuted, marginTop: spacing.md },
    empty: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: spacing.xl },
    error: { color: '#E0483E', fontSize: 13, textAlign: 'center', marginTop: spacing.md },
    guestBox: {
      marginTop: spacing.lg,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      gap: spacing.sm,
    },
    guestText: { color: colors.text, fontSize: 13, lineHeight: 18 },
    link: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  });
}
