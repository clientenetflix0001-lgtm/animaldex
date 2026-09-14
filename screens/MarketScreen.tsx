// ============================================================
// Animaldex — Sección MERCADO (productos y servicios)
// ============================================================
// Home: header con ubicación editable (misma lógica que Alertas),
// buscador, categorías horizontales, selector Productos/Servicios,
// y un listado vertical de 2 productos por fila (no carrusel).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { db, ApiListing } from '../lib/db';
import { ListingCard } from '../components/ListingCard';
import { PlacePicker, placeSelection, type PlaceSelection } from '../components/PlacePicker';
import { CategoryPickerSheet } from '../components/CategoryPickerSheet';
import { locateCurrentPlace, unambiguousPlace } from '../lib/placeLocate';
import {
  territoryFromPlace,
  territoryFromPlaceId,
  territoryQuery,
  type Territory,
} from '../lib/geoplace/territory.ts';
import {
  saveMarketLocality,
  loadSavedMarketLocality,
  categoriesFor,
  categoryLabel,
  categoryEmoji,
  ListingKind,
  MARKET_LIST_COLUMNS,
  MARKET_GRID_GAP,
} from '../lib/market';
import { listingBumpedAt } from '../lib/listingLifecycle';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';
import { useBreakpoint, CONTENT } from '../lib/responsive';
import { useStore } from '../lib/store';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const PAGE_SIZE = 10;

export default function MarketScreen() {
  const navigation = useNavigation<Nav>();
  const { desktopWeb } = useBreakpoint();
  const { user } = useStore();

  const [locality, setLocality] = useState<string | null>(null);
  const [province, setProvince] = useState<string | null>(null);
  /** Identidad del lugar elegido. Es lo que filtra la sección "cerca". */
  const [territory, setTerritory] = useState<Territory | null>(null);
  const [viewerLat, setViewerLat] = useState<number | null>(null);
  const [viewerLon, setViewerLon] = useState<number | null>(null);
  const [locating, setLocating] = useState(true);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);

  const [kind, setKind] = useState<ListingKind>('product');
  const [category, setCategory] = useState<string | null>(null);
  const [queryText, setQueryText] = useState('');
  const [searchActive, setSearchActive] = useState('');

  const [listings, setListings] = useState<ApiListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const oldestRef = useRef<number | undefined>(undefined);
  const didInitialFocusRef = useRef(false);


  const applyLocality = useCallback(
    (entry: PlaceSelection) => {
      setLocality(entry.locality);
      setProvince(entry.province);
      setTerritory(territoryFromPlace(entry.place));
      if (entry.lat != null) setViewerLat(entry.lat);
      if (entry.lon != null) setViewerLon(entry.lon);
      saveMarketLocality({
        locality: entry.locality,
        province: entry.province,
        lat: entry.lat ?? null,
        lon: entry.lon ?? null,
        placeId: entry.place.placeId,
      });
    },
    []
  );

  // ---------- Ubicación inicial (misma lógica que Alertas) ----------
  useEffect(() => {
    (async () => {
      setLocating(true);
      const saved = await loadSavedMarketLocality();
      if (saved) {
        setLocality(saved.locality);
        setProvince(saved.province);
        setTerritory(territoryFromPlaceId(saved.placeId));
        setViewerLat(saved.lat ?? null);
        setViewerLon(saved.lon ?? null);
        setLocating(false);
        return;
      }
      // Solo se aplica el GPS cuando no hay ambigüedad territorial. Las
      // coordenadas guardadas son el centroide público del lugar, no la
      // posición del dispositivo.
      const res = await locateCurrentPlace();
      const only = res.ok ? unambiguousPlace(res) : null;
      if (only) applyLocality(placeSelection(only));
      setLocating(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Grilla paginada (modo búsqueda/categoría) ----------
  const fetchPage = useCallback(
    async (reset: boolean) => {
      if (reset) {
        setLoading(true);
        oldestRef.current = undefined;
      } else {
        setLoadingMore(true);
      }
      try {
        const section = !searchActive.trim() && !category && locality ? 'nearby' : 'recent';
        const res = await db.listingsFeed({
          kind,
          locality: locality ?? undefined,
          province,
          ...territoryQuery(territory),
          category: category ?? undefined,
          q: searchActive.trim() || undefined,
          section,
          before: reset ? undefined : oldestRef.current,
          limit: PAGE_SIZE,
        });
        const page =
          reset && section === 'nearby' && res.listings.length === 0
            ? await db.listingsFeed({
                kind,
                category: category ?? undefined,
                q: searchActive.trim() || undefined,
                section: 'recent',
                limit: PAGE_SIZE,
              })
            : res;
        setListings((prev) => (reset ? page.listings : [...prev, ...page.listings]));
        if (page.listings.length > 0) {
          oldestRef.current = listingBumpedAt(page.listings[page.listings.length - 1]);
        }
        setHasMore(page.hasMore);
      } catch {
        if (reset) setListings([]);
        setHasMore(false);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [kind, category, searchActive, locality, province, territory]
  );

  useEffect(() => {
    if (!locating) fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, category, searchActive, locality, territory, locating]);

  useFocusEffect(
    useCallback(() => {
      if (!didInitialFocusRef.current) {
        didInitialFocusRef.current = true;
        return;
      }
      fetchPage(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const submitSearch = useCallback(() => setSearchActive(queryText), [queryText]);

  const clearSearch = useCallback(() => {
    setQueryText('');
    setSearchActive('');
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPage(true);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    fetchPage(false);
  }, [loadingMore, hasMore, fetchPage]);

  const openListing = useCallback(
    (listing: ApiListing) => navigation.navigate('ListingDetail', { listingId: listing.id }),
    [navigation]
  );

  const toggleFavoriteGrid = useCallback((listingId: string) => {
    setListings((prev) =>
      prev.map((l) => (l.id === listingId ? { ...l, isFavorited: !l.isFavorited, favoriteCount: l.favoriteCount + (l.isFavorited ? -1 : 1) } : l))
    );
  }, []);

  const toggleFavoriteRemote = useCallback(
    (listingId: string) => {
      const target = listings.find((l) => l.id === listingId);
      const nextValue = !(target?.isFavorited ?? false);
      db.listingFavorite(listingId, nextValue).catch(() => {});
    },
    [listings]
  );

  const handleToggleFavorite = useCallback(
    (listingId: string) => {
      toggleFavoriteGrid(listingId);
      toggleFavoriteRemote(listingId);
    },
    [toggleFavoriteGrid, toggleFavoriteRemote]
  );

  const categories = categoriesFor(kind);

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.titleRow}>
        <View style={styles.logoRow}>
          <Text style={styles.pawEmoji}>🐾</Text>
          <Text style={styles.title}>Mercado</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.iconBtn} onPress={() => navigation.navigate('MarketFavorites')}>
            <Ionicons name="heart-outline" size={22} color={colors.text} />
          </Pressable>
          <View style={styles.headerActionCol}>
            <Pressable style={styles.sellBtn} onPress={() => navigation.navigate('CreateListing')}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.sellBtnText}>Vender</Text>
            </Pressable>
            <Pressable
              style={styles.mineProductsBtn}
              onPress={() => navigation.navigate(user ? 'MyListings' : 'Auth')}
            >
              <Text style={styles.mineProductsBtnText}>Mis productos</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <Pressable style={styles.localityPill} onPress={() => setPickerVisible(true)}>
        <Ionicons name="location" size={15} color={colors.primary} />
        <Text style={styles.localityText} numberOfLines={1}>
          {locating ? 'Detectando ubicación…' : locality ?? 'Elegir localidad'}
        </Text>
        <Ionicons name="chevron-down" size={15} color={colors.textMuted} />
      </Pressable>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="¿Qué estás buscando?"
          placeholderTextColor={colors.textMuted}
          value={queryText}
          onChangeText={setQueryText}
          returnKeyType="search"
          onSubmitEditing={submitSearch}
        />
        {queryText.length > 0 && (
          <Pressable onPress={clearSearch} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      <FlatList
        data={categories}
        keyExtractor={(c) => c.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesRow}
        renderItem={({ item }) => {
          const active = category === item.id;
          return (
            <Pressable
              style={[styles.categoryChip, active && styles.categoryChipActive]}
              onPress={() => setCategory(active ? null : item.id)}
            >
              <Text style={styles.categoryEmoji}>{item.emoji}</Text>
              <Text style={[styles.categoryLabel, active && styles.categoryLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        }}
        ListFooterComponent={
          <Pressable style={styles.categoryChip} onPress={() => setCategoryPickerVisible(true)}>
            <Ionicons name="grid-outline" size={16} color={colors.primary} />
            <Text style={[styles.categoryLabel, { color: colors.primary }]}>Ver todas</Text>
          </Pressable>
        }
      />

      <View style={styles.kindToggle}>
        <Pressable
          style={[styles.kindBtn, kind === 'product' && styles.kindBtnActive]}
          onPress={() => setKind('product')}
        >
          <Text style={[styles.kindBtnText, kind === 'product' && styles.kindBtnTextActive]}>🛍️ Productos</Text>
        </Pressable>
        <Pressable
          style={[styles.kindBtn, kind === 'service' && styles.kindBtnActive]}
          onPress={() => setKind('service')}
        >
          <Text style={[styles.kindBtnText, kind === 'service' && styles.kindBtnTextActive]}>🛠️ Servicios</Text>
        </Pressable>
      </View>

      {category && (
        <View style={styles.activeCategoryRow}>
          <Text style={styles.activeCategoryText}>
            {categoryEmoji(category)} {categoryLabel(category)}
          </Text>
          <Pressable onPress={() => setCategory(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      )}
    </View>
  );

  const body = loading ? (
    <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
  ) : (
    <FlatList
      key="market-grid-2"
      numColumns={MARKET_LIST_COLUMNS}
      data={listings}
      keyExtractor={(l) => l.id}
      columnWrapperStyle={styles.gridRow}
      contentContainerStyle={styles.gridContent}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🐾</Text>
          <Text style={styles.emptyTitle}>Sin resultados</Text>
          <Text style={styles.emptyText}>Prueba con otra búsqueda o categoría.</Text>
        </View>
      }
      renderItem={({ item, index }) => (
        <View style={[styles.gridCell, index % 2 === 1 && styles.gridCellDivider]}>
          <ListingCard
            listing={item}
            onPress={openListing}
            onToggleFavorite={handleToggleFavorite}
            viewerLat={viewerLat}
            viewerLon={viewerLon}
            style={styles.gridCard}
          />
        </View>
      )}
      ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} /> : null}
    />
  );

  const content = (
    <View style={{ flex: 1 }}>
      {header}
      <View style={{ flex: 1 }}>{body}</View>
    </View>
  );

  return (
    <>
      {desktopWeb ? (
        <View style={styles.desktopRoot}>
          <View style={[styles.desktopWrap]}>{content}</View>
        </View>
      ) : (
        <SafeAreaView style={styles.safe} edges={['top']}>
          {content}
        </SafeAreaView>
      )}

      <PlacePicker
        visible={pickerVisible}
        currentProvince={province}
        title="Ubicación del Mercado"
        onClose={() => setPickerVisible(false)}
        onSelect={applyLocality}
      />
      <CategoryPickerSheet
        visible={categoryPickerVisible}
        kind={kind}
        selected={category}
        onClose={() => setCategoryPickerVisible(false)}
        onSelect={setCategory}
      />
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  desktopRoot: { flex: 1, backgroundColor: colors.bg, alignItems: 'center' },
  desktopWrap: { width: '100%', maxWidth: CONTENT.feed + 200 },
  mobileWrap: { width: '100%' },
  headerBlock: { paddingTop: spacing.sm, gap: spacing.sm },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pawEmoji: { fontSize: 20 },
  title: { fontSize: 22, fontWeight: '900', color: colors.text, letterSpacing: -0.3 },
  headerActions: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headerActionCol: { alignItems: 'stretch', gap: 6 },
  iconBtn: { padding: 4 },
  sellBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 9,
    ...shadow.card,
  },
  sellBtnText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  mineProductsBtn: {
    alignItems: 'center',
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.secondary,
  },
  mineProductsBtnText: { color: colors.secondary, fontWeight: '800', fontSize: 12 },
  localityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primarysoft,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    alignSelf: 'flex-start',
    maxWidth: '90%',
    marginHorizontal: spacing.lg,
  },
  localityText: { fontWeight: '800', fontSize: 13, color: colors.text, flexShrink: 1 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.lg,
    ...shadow.card,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 11 },
  categoriesRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  categoryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryEmoji: { fontSize: 15 },
  categoryLabel: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  categoryLabelActive: { color: '#fff' },
  kindToggle: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.full,
    padding: 4,
    marginHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  kindBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.full },
  kindBtnActive: { backgroundColor: colors.primary },
  kindBtnText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  kindBtnTextActive: { color: '#fff' },
  activeCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.secondarySoft,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginHorizontal: spacing.lg,
  },
  activeCategoryText: { fontSize: 12, fontWeight: '700', color: colors.text },
  sectionBlock: { marginTop: spacing.lg },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  sectionCard: { width: 160 },
  gridContent: { paddingBottom: spacing.xl, paddingTop: MARKET_GRID_GAP },
  gridRow: { alignItems: 'stretch' },
  gridCell: { flex: 1, maxWidth: '50%', minWidth: 0, paddingBottom: MARKET_GRID_GAP },
  gridCellDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(45, 32, 22, 0.12)',
  },
  gridCard: { flex: 1 },
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: spacing.xl, gap: 4 },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 4 },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});
