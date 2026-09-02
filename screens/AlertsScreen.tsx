// ============================================================
// Animaldex — Sección ALERTAS (animales perdidos/encontrados)
// ============================================================
// Feed independiente del feed social general. Se filtra automática-
// mente por localidad (detectada por GPS, sin mostrar mapas) y el
// usuario puede cambiarla manualmente en cualquier momento. Carga
// progresiva con paginación (10 alertas por página).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { db, ApiAlert } from '../lib/db';
import { useStore } from '../lib/store';
import { AlertCard } from '../components/AlertCard';
import { LocalityPicker } from '../components/LocalityPicker';
import { detectCurrentLocality, loadSavedAlertsLocality, saveAlertsLocality, withProvinceFallback } from '../lib/geo';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';
import { useBreakpoint, CONTENT } from '../lib/responsive';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const PAGE_SIZE = 10;

export default function AlertsScreen() {
  const navigation = useNavigation<Nav>();
  const { desktopWeb } = useBreakpoint();
  const { user } = useStore();

  const [locality, setLocality] = useState<string | null>(null);
  const [province, setProvince] = useState<string | null>(null);
  const [locating, setLocating] = useState(true);
  const [alerts, setAlerts] = useState<ApiAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  const oldestRef = useRef<number | undefined>(undefined);
  const localityRef = useRef<string | null>(null);
  const didInitialFocusRef = useRef(false);

  const fetchPage = useCallback(
    async (targetLocality: string, reset: boolean) => {
      if (reset) {
        setLoading(true);
        oldestRef.current = undefined;
      } else {
        setLoadingMore(true);
      }
      try {
        const res = await db.alertsFeed(targetLocality, reset ? undefined : oldestRef.current, PAGE_SIZE);
        setAlerts((prev) => (reset ? res.alerts : [...prev, ...res.alerts]));
        if (res.alerts.length > 0) {
          const last = res.alerts[res.alerts.length - 1];
          oldestRef.current = last.bumpedAt ?? last.createdAt;
        }
        setHasMore(res.hasMore);
      } catch {
        if (reset) setAlerts([]);
        setHasMore(false);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    []
  );

  const applyLocality = useCallback(
    (entry: { locality: string; province: string | null }) => {
      localityRef.current = entry.locality;
      setLocality(entry.locality);
      setProvince(entry.province);
      saveAlertsLocality(entry);
      fetchPage(entry.locality, true);
    },
    [fetchPage]
  );

  // ---------- Resolución inicial de localidad ----------
  useEffect(() => {
    (async () => {
      setLocating(true);
      const saved = await loadSavedAlertsLocality();
      if (saved) {
        localityRef.current = saved.locality;
        setLocality(saved.locality);
        setProvince(saved.province);
        setLocating(false);
        fetchPage(saved.locality, true);
        return;
      }
      const detected = await detectCurrentLocality();
      if (detected && detected.locality) {
        const prov = withProvinceFallback(detected.locality, detected.province);
        const entry = { locality: detected.locality, province: prov };
        localityRef.current = entry.locality;
        setLocality(entry.locality);
        setProvince(entry.province);
        saveAlertsLocality(entry);
        fetchPage(entry.locality, true);
      }
      setLocating(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al volver de "Crear alerta" (u otra pantalla), refrescar en silencio
  // para que la alerta recién publicada aparezca arriba.
  useFocusEffect(
    useCallback(() => {
      if (!didInitialFocusRef.current) {
        didInitialFocusRef.current = true;
        return;
      }
      if (localityRef.current) fetchPage(localityRef.current, true);
    }, [fetchPage])
  );

  const onRefresh = useCallback(() => {
    if (!locality) return;
    setRefreshing(true);
    fetchPage(locality, true);
  }, [locality, fetchPage]);

  const loadMore = useCallback(() => {
    if (!locality || loadingMore || !hasMore) return;
    fetchPage(locality, false);
  }, [locality, loadingMore, hasMore, fetchPage]);

  const handleToggleLike = useCallback((alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId
          ? { ...a, isLiked: !a.isLiked, likeCount: a.likeCount + (a.isLiked ? -1 : 1) }
          : a
      )
    );
    const target = alerts.find((a) => a.id === alertId);
    const nextValue = !(target?.isLiked ?? false);
    db.alertLike(alertId, nextValue).catch(() => {});
  }, [alerts]);

  const openComments = useCallback(
    (alert: ApiAlert) => navigation.navigate('AlertDetail', { alertId: alert.id }),
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }: { item: ApiAlert }) => (
      <AlertCard alert={item} onToggleLike={handleToggleLike} onOpenComments={openComments} />
    ),
    [handleToggleLike, openComments]
  );

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>🚨 ALERTAS</Text>
        <View style={styles.titleActions}>
          {user ? (
            <Pressable style={styles.mineBtn} onPress={() => navigation.navigate('MyAlerts')}>
              <Text style={styles.mineBtnText}>Mis alertas</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.createBtn} onPress={() => navigation.navigate('CreateAlert')}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.createBtnText}>Crear alerta</Text>
          </Pressable>
        </View>
      </View>

      <Pressable style={styles.localityPill} onPress={() => setPickerVisible(true)}>
        <Ionicons name="location" size={15} color={colors.primary} />
        <Text style={styles.localityText} numberOfLines={1}>
          {locality ?? 'Elegir localidad'}
        </Text>
        <Ionicons name="chevron-down" size={15} color={colors.textMuted} />
      </Pressable>
    </View>
  );

  const wrapStyle = desktopWeb ? styles.desktopWrap : styles.mobileWrap;

  let body: React.ReactNode;

  if (locating) {
    body = (
      <View style={styles.centerState}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.centerText}>Detectando tu ubicación…</Text>
      </View>
    );
  } else if (!locality) {
    body = (
      <View style={styles.centerState}>
        <Ionicons name="location-outline" size={44} color={colors.textMuted} />
        <Text style={styles.centerTitle}>No pudimos detectar tu ubicación</Text>
        <Text style={styles.centerText}>
          Elige manualmente una localidad para ver sus alertas de mascotas.
        </Text>
        <Pressable style={styles.primaryBtn} onPress={() => setPickerVisible(true)}>
          <Text style={styles.primaryBtnText}>Elegir localidad</Text>
        </Pressable>
      </View>
    );
  } else if (loading) {
    body = (
      <View style={styles.centerState}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  } else {
    body = (
      <FlatList
        data={alerts}
        keyExtractor={(a) => a.id}
        renderItem={renderItem}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
        contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.centerState}>
            <Text style={styles.emptyEmoji}>🐾</Text>
            <Text style={styles.centerTitle}>Sin alertas en {locality}</Text>
            <Text style={styles.centerText}>
              Sé el primero en avisar sobre un animal perdido o encontrado en tu zona.
            </Text>
            <Pressable style={styles.primaryBtn} onPress={() => navigation.navigate('CreateAlert')}>
              <Text style={styles.primaryBtnText}>Crear la primera alerta</Text>
            </Pressable>
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
          ) : null
        }
      />
    );
  }

  const content = (
    <View style={[{ flex: 1 }, wrapStyle]}>
      {header}
      <View style={{ flex: 1 }}>{body}</View>
    </View>
  );

  return (
    <>
      {desktopWeb ? (
        <View style={styles.desktopRoot}>{content}</View>
      ) : (
        <SafeAreaView style={styles.safe} edges={['top']}>
          {content}
        </SafeAreaView>
      )}
      <LocalityPicker
        visible={pickerVisible}
        currentProvince={province}
        onClose={() => setPickerVisible(false)}
        onSelect={applyLocality}
      />
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  desktopRoot: { flex: 1, backgroundColor: colors.bg, alignItems: 'center' },
  desktopWrap: { width: '100%', maxWidth: CONTENT.feed, paddingTop: spacing.xl },
  mobileWrap: { width: '100%' },
  headerBlock: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '900', color: colors.text, letterSpacing: -0.3 },
  titleActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mineBtn: {
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  mineBtnText: { color: colors.text, fontWeight: '800', fontSize: 12.5 },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 9,
    ...shadow.card,
  },
  createBtnText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  localityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primarysoft,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  localityText: { fontWeight: '800', fontSize: 14, color: colors.text, flexShrink: 1 },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: 60,
    gap: spacing.sm,
  },
  centerTitle: { fontSize: 16, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: 4 },
  centerText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
  emptyEmoji: { fontSize: 40 },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 22,
    paddingVertical: 13,
    marginTop: spacing.md,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
