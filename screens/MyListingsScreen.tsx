import React, { useCallback, useState } from 'react';
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { db, ApiListing } from '../lib/db';
import { listingPriceLabel } from '../lib/listingContact';
import {
  isListingSold,
  listingRenewalUi,
  listingStatusLabel,
} from '../lib/listingLifecycle';
import { alertListTime } from '../lib/alerts';
import { thumb } from '../lib/images';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function MyListingsScreen() {
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<ApiListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (silent?: boolean) => {
    if (!silent) setLoading(true);
    try {
      const res = await db.myListings();
      setItems(res.listings || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const renew = async (listing: ApiListing) => {
    const ui = listingRenewalUi(listing);
    if (!ui.canRenew) return;
    setBusyId(listing.id);
    try {
      await db.renewListing(listing.id);
      load(true);
    } catch (e: any) {
      Alert.alert('No se pudo renovar', e?.message || 'Inténtalo de nuevo');
    } finally {
      setBusyId(null);
    }
  };

  const confirmSold = (listing: ApiListing) => {
    Alert.alert('Marcar como vendido', 'Dejará de verse en el Mercado. No se borra el historial.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Marcar como vendido',
        onPress: async () => {
          setBusyId(listing.id);
          try {
            await db.markListingSold(listing.id);
            load(true);
          } catch (e: any) {
            Alert.alert('No se pudo marcar', e?.message || 'Inténtalo de nuevo');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: ApiListing }) => {
    const sold = isListingSold(item.status);
    const busy = busyId === item.id;
    const renewUi = listingRenewalUi(item);
    const photo = item.images?.[0];
    const price = listingPriceLabel(item.priceArs);
    return (
      <View style={styles.card}>
        <Pressable style={styles.row} onPress={() => navigation.navigate('ListingDetail', { listingId: item.id })}>
          {photo ? (
            <Image source={{ uri: thumb(photo, 200) }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]} />
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.price} numberOfLines={1}>
              {price || 'Consultar'}
            </Text>
            <Text style={[styles.status, sold && styles.statusSold]}>{listingStatusLabel(item.status)}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {alertListTime(item.renewedAt || item.createdAt)}
            </Text>
          </View>
        </Pressable>
        {sold ? (
          <Text style={styles.soldTag}>Vendido</Text>
        ) : (
          <View style={styles.actions}>
            <Pressable
              style={[styles.renewBtn, !renewUi.canRenew && styles.renewBtnOff]}
              onPress={() => renew(item)}
              disabled={busy || !renewUi.canRenew}
            >
              <Text style={[styles.renewText, !renewUi.canRenew && styles.renewTextOff]}>{renewUi.label}</Text>
            </Pressable>
            <Pressable style={styles.soldBtn} onPress={() => confirmSold(item)} disabled={busy}>
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.soldBtnText}>Marcar como vendido</Text>
              )}
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(l) => l.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load(true);
              }}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={styles.empty}>Todavía no publicaste productos.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  thumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.border },
  thumbEmpty: {},
  title: { fontWeight: '800', fontSize: 14, color: colors.text },
  price: { fontSize: 13, fontWeight: '800', color: colors.text, marginTop: 4 },
  status: { fontSize: 12, fontWeight: '700', color: colors.secondary, marginTop: 4 },
  statusSold: { color: colors.textMuted },
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
  soldBtn: {
    backgroundColor: colors.secondary,
    borderRadius: radius.full,
    paddingVertical: 11,
    alignItems: 'center',
  },
  soldBtnText: { fontWeight: '800', fontSize: 13, color: '#fff' },
  soldTag: { marginTop: 10, fontWeight: '800', fontSize: 12, color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
});
