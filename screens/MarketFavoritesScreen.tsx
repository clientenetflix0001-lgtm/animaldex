// ============================================================
// Animaldex — Favoritos del Mercado
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { db, ApiListing } from '../lib/db';
import { ListingCard } from '../components/ListingCard';
import { colors, spacing } from '../lib/theme';
import { RootStackParamList } from '../lib/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function MarketFavoritesScreen() {
  const navigation = useNavigation<Nav>();
  const [listings, setListings] = useState<ApiListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { listings: l } = await db.myFavoriteListings();
      setListings(l);
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const openListing = useCallback(
    (listing: ApiListing) => navigation.navigate('ListingDetail', { listingId: listing.id }),
    [navigation]
  );

  const toggleFavorite = useCallback((listingId: string) => {
    setListings((prev) => prev.filter((l) => l.id !== listingId));
    db.listingFavorite(listingId, false).catch(() => {});
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(l) => l.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{ gap: spacing.sm, paddingTop: spacing.lg, paddingBottom: spacing.xl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🤍</Text>
              <Text style={styles.emptyTitle}>Sin favoritos todavía</Text>
              <Text style={styles.emptyText}>Toca el corazón en cualquier publicación para guardarla aquí.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <ListingCard listing={item} onPress={openListing} onToggleFavorite={toggleFavorite} style={{ flex: 1 }} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: spacing.xl, gap: 4 },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 4 },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});
