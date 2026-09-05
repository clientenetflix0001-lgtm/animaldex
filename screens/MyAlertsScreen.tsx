import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { db, ApiAlert } from '../lib/db';
import {
  alertBadgeColor,
  alertListTime,
  alertRenewalUi,
  alertResolveActionLabel,
  alertResolveConfirm,
  allowedResolutionForType,
  isAlertResolved,
  myAlertPrimaryLabel,
  myAlertSecondaryLine,
  timestampToDateString,
} from '../lib/alerts';
import { thumb } from '../lib/images';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Tab = 'active' | 'resolved';

export default function MyAlertsScreen() {
  const navigation = useNavigation<Nav>();
  const [tab, setTab] = useState<Tab>('active');
  const [items, setItems] = useState<ApiAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const tabRef = useRef<Tab>('active');

  const load = useCallback(async (target: Tab, silent?: boolean) => {
    if (!silent) setLoading(true);
    try {
      const res = await db.myAlerts(target);
      setItems(res.alerts);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(tabRef.current);
    }, [load])
  );

  const switchTab = (next: Tab) => {
    setTab(next);
    tabRef.current = next;
    load(next);
  };

  const confirmResolve = (alert: ApiAlert) => {
    const copy = alertResolveConfirm(alert);
    const resolutionType = allowedResolutionForType(alert.type);
    Alert.alert(copy.title, copy.message, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: copy.confirmLabel,
        onPress: async () => {
          setBusyId(alert.id);
          try {
            await db.resolveAlert(alert.id, resolutionType || undefined);
            load(tabRef.current, true);
          } catch (e: any) {
            Alert.alert('No se pudo resolver', e?.message || 'Inténtalo de nuevo');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const renew = async (alert: ApiAlert) => {
    setBusyId(alert.id);
    try {
      await db.renewAlert(alert.id);
      load(tabRef.current, true);
    } catch (e: any) {
      Alert.alert('No se pudo renovar', e?.message || 'Inténtalo de nuevo');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = (alert: ApiAlert) => {
    Alert.alert('Eliminar publicación', 'Se borrará de forma definitiva. Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          setBusyId(alert.id);
          try {
            await db.deleteAlert(alert.id);
            load(tabRef.current, true);
          } catch (e: any) {
            Alert.alert('No se pudo eliminar', e?.message || 'Inténtalo de nuevo');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: ApiAlert }) => {
    const resolved = isAlertResolved(item);
    const badgeColor = alertBadgeColor(item);
    const busy = busyId === item.id;
    const renewUi = alertRenewalUi(item);
    return (
      <View style={styles.card}>
        <Pressable style={styles.row} onPress={() => navigation.navigate('AlertDetail', { alertId: item.id })}>
          <Image source={{ uri: thumb(item.image, 200) }} style={styles.thumb} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.badge, { color: badgeColor }]}>{myAlertPrimaryLabel(item)}</Text>
            <Text style={styles.context} numberOfLines={1}>{myAlertSecondaryLine(item)}</Text>
            <Text style={styles.meta} numberOfLines={1}>{item.locality}</Text>
            {resolved && item.resolvedAt ? (
              <Text style={styles.meta}>Resuelta · {timestampToDateString(item.resolvedAt)}</Text>
            ) : (
              <Text style={styles.meta}>{alertListTime(item.createdAt)}</Text>
            )}
          </View>
          <Pressable
            hitSlop={10}
            onPress={() => confirmDelete(item)}
            accessibilityLabel="Eliminar publicación"
          >
            <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
          </Pressable>
        </Pressable>
        {!resolved ? (
          <View style={styles.actions}>
            <Pressable
              style={[styles.renewBtn, !renewUi.canRenew && styles.renewBtnOff]}
              onPress={() => { if (renewUi.canRenew) renew(item); }}
              disabled={busy || !renewUi.canRenew}
            >
              <Text style={[styles.renewText, !renewUi.canRenew && styles.renewTextOff]}>{renewUi.label}</Text>
            </Pressable>
            <Pressable style={styles.resolveBtn} onPress={() => confirmResolve(item)} disabled={busy}>
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.resolveText}>{alertResolveActionLabel(item.type, item.sex)}</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <Text style={styles.resolvedTag}>Resuelta</Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.tabs}>
        <Pressable style={[styles.tab, tab === 'active' && styles.tabOn]} onPress={() => switchTab('active')}>
          <Text style={[styles.tabText, tab === 'active' && styles.tabTextOn]}>Activas</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'resolved' && styles.tabOn]} onPress={() => switchTab('resolved')}>
          <Text style={[styles.tabText, tab === 'resolved' && styles.tabTextOn]}>Resueltas</Text>
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(tab, true); }} tintColor={colors.primary} />
          }
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {tab === 'active' ? 'No tenés alertas activas.' : 'Todavía no hay alertas resueltas.'}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    padding: 4,
    ...shadow.card,
  },
  tab: { flex: 1, paddingVertical: 9, borderRadius: radius.full, alignItems: 'center' },
  tabOn: { backgroundColor: colors.primary },
  tabText: { fontWeight: '800', fontSize: 13, color: colors.textMuted },
  tabTextOn: { color: '#fff' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  thumb: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.border },
  badge: { fontWeight: '800', fontSize: 12, letterSpacing: 0.2 },
  context: { fontSize: 13, color: colors.text, marginTop: 4, fontWeight: '600' },
  meta: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  actions: { marginTop: 12, gap: 8 },
  renewBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: 10,
    alignItems: 'center',
  },
  renewText: { fontWeight: '800', fontSize: 13, color: colors.text },
  renewBtnOff: { backgroundColor: colors.bg },
  renewTextOff: { color: colors.textMuted, fontWeight: '700' },
  resolveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 11,
    alignItems: 'center',
  },
  resolveText: { fontWeight: '800', fontSize: 13, color: '#fff' },
  resolvedTag: { marginTop: 10, fontWeight: '800', fontSize: 12, color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
});
