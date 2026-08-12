// ============================================================
// Animaldex — Sección MERCADO (productos y servicios)
// ============================================================
// Home: header con ubicación editable (misma lógica que Alertas),
// buscador, categorías horizontales, selector Productos/Servicios,
// y secciones (Destacados, Cerca de vos, Mejor valorados, Recién
// publicados) mientras no hay búsqueda/categoría activa. Al buscar
// o filtrar por categoría, cambia a una grilla paginada de 2 columnas
// con scroll infinito.
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
import { LocalityPicker } from '../components/LocalityPicker';
import { CategoryPickerSheet } from '../components/CategoryPickerSheet';
import { detectCurrentLocality, withProvinceFallback } from '../lib/geo';
import {
  saveMarketLocality,
  loadSavedMarketLocality,
  MARKET_SECTIONS,
  categoriesFor,
  categoryLabel,
  categoryEmoji,
  ListingKind,
} from '../lib/market';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';
import { useBreakpoint, CONTENT } from '../lib/responsive';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const PAGE_SIZE = 10;
const SECTION_SIZE = 8;

// ---------- Fila horizontal de una sección del home (Destacados, etc.) ----------
function HomeSectionRow({
  sectionId,
  label,
  emoji,
  kind,
  locality,
  viewerLat,
  viewerLon,
  onOpen,
  refreshKey,
}: {
  sectionId: 'featured' | 'nearby' | 'top_rated' | 'recent';
  label: string;
  emoji: string;
  kind: ListingKind;
  locality: string | null;
  viewerLat: number | null;
  viewerLon: number | null;
  onOpen: (listing: ApiListing) => void;
  refreshKey: number;
}) {
  const [items, setItems] = useState<ApiListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (sectionId === 'nearby' && !locality) {
        setItems([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await db.listingsFeed({
          kind,
          locality: locality ?? undefined,
          section: sectionId,
          limit: SECTION_SIZE,
        });
        if (alive) setItems(res.listings);
      } catch {
        if (alive) setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [sectionId, kind, locality, refreshKey]);

  // El toggle se resuelve con el estado real que YA tenemos en esta fila
  // (no depende del padre), así el valor enviado al servidor siempre es
  // el correcto sin importar en qué sección/orden aparezca la tarjeta.
  const toggleFav = useCallback((listingId: string) => {
    setItems((prev) =>
      prev.map((l) => {
        if (l.id !== listingId) return l;
        const nextValue = !l.isFavorited;
        db.listingFavorite(listingId, nextValue).catch(() => {});
        return { ...l, isFavorited: nextValue, favoriteCount: l.favoriteCount + (nextValue ? 1 : -1) };
      })
    );
  }, []);

  if (!loading && items.length === 0) return null;

  return (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionTitle}>
        {emoji} {label}
      </Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(l) => l.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
          renderItem={({ item }) => (
            <ListingCard
              listing={item}
              onPress={onOpen}
              onToggleFavorite={toggleFav}
              viewerLat={viewerLat}
              viewerLon={viewerLon}
              style={styles.sectionCard}
            />
          )}
        />
      )}
    </View>
  );
}

export default function MarketScreen() {
  const navigation = useNavigation<Nav>();
  const { desktopWeb } = useBreakpoint();

  const [locality, setLocality] = useState<string | null>(null);
  const [province, setProvince] = useState<string | null>(null);
  const [viewerLat, setViewerLat] = useState<number | null>(null);
  const [viewerLon, setViewerLon] = useState<number | null>(null);
  const [locating, setLocating] = useState(true);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);

  const [kind, setKind] = useState<ListingKind>('product');
  const [category, setCategory] = useState<string | null>(null);
  const [queryText, setQueryText] = useState('');
  const [searchActive, setSearchActive] = useState('');
  const [sectionsRefreshKey, setSectionsRefreshKey] = useState(0);

  const [listings, setListings] = useState<ApiListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const oldestRef = useRef<number | undefined>(undefined);
  const didInitialFocusRef = useRef(false);

  const browsing = category !== null || searchActive.trim() !== '';

  // ---------- Ubicación inicial (misma lógica que Alertas) ----------
  useEffect(() => {
    (async () => {
      setLocating(true);
      const saved = await loadSavedMarketLocality();
      if (saved) {
        setLocality(saved.locality);
        setProvince(saved.province);
        setViewerLat(saved.lat ?? null);
        setViewerLon(saved.lon ?? null);
        setLocating(false);
        return;
      }
      const detected = await detectCurrentLocality();
      if (detected && detected.locality) {
        const prov = withProvinceFallback(detected.locality, detected.province);
        setLocality(detected.locality);
        setProvince(prov);
        setViewerLat(detected.lat);
        setViewerLon(detected.lon);
        saveMarketLocality({ locality: detected.locality, province: prov, lat: detected.lat, lon: detected.lon });
      }
      setLocating(false);
    })();
  }, []);

  const applyLocality = useCallback(
    (entry: { locality: string; province: string | null; lat?: number | null; lon?: number | null }) => {
      setLocality(entry.locality);
      setProvince(entry.province);
      if (entry.lat != null) setViewerLat(entry.lat);
      if (entry.lon != null) setViewerLon(entry.lon);
      saveMarketLocality({ locality: entry.locality, province: entry.province, lat: entry.lat ?? null, lon: entry.lon ?? null });
      setSectionsRefreshKey((k) => k + 1);
    },
    []
  );

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
        const res = await db.listingsFeed({
          kind,
          category: category ?? undefined,
          q: searchActive.trim() || undefined,
          section: 'recent',
          before: reset ? undefined : oldestRef.current,
          limit: PAGE_SIZE,
        });
        setListings((prev) => (reset ? res.listings : [...prev, ...res.listings]));
        if (res.listings.length > 0) oldestRef.current = res.listings[res.listings.length - 1].createdAt;
        setHasMore(res.hasMore);
      } catch {
        if (reset) setListings([]);
        setHasMore(false);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [kind, category, searchActive]
  );

  useEffect(() => {
    if (browsing) fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browsing, kind, category, searchActive]);

  useFocusEffect(
    useCallback(() => {
      if (!didInitialFocusRef.current) {
        didInitialFocusRef.current = true;
        return;
      }
      setSectionsRefreshKey((k) => k + 1);
      if (browsing) fetchPage(true);
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
    if (browsing) fetchPage(true);
    else {
      setSectionsRefreshKey((k) => k + 1);
      setRefreshing(false);
    }
  }, [browsing, fetchPage]);

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

  const wrapStyle = desktopWeb ? styles.desktopWrap : styles.mobileWrap;
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
          <Pressable style={styles.sellBtn} onPress={() => navigation.navigate('CreateListing')}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.sellBtnText}>Vender</Text>
          </Pressable>
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

  let body: React.ReactNode;

  if (browsing) {
    body = loading ? (
      <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
    ) : (
      <FlatList
        // "key" fijo distinto al de la lista de secciones: evita que React
        // reutilice la misma instancia de FlatList al cambiar numColumns
        // (1 columna en secciones → 2 columnas en resultados), que es lo que
        // causaba el congelamiento/pantalla negra al buscar.
        key="market-grid"
        data={listings}
        keyExtractor={(l) => l.id}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
        contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl, paddingTop: spacing.sm }}
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
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            onPress={openListing}
            onToggleFavorite={handleToggleFavorite}
            viewerLat={viewerLat}
            viewerLon={viewerLon}
            style={{ flex: 1 }}
          />
        )}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} /> : null}
      />
    );
  } else {
    body = (
      <FlatList
        key="market-sections"
        data={MARKET_SECTIONS}
        keyExtractor={(s) => s.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingBottom: spacing.xl, paddingTop: spacing.sm }}
        renderItem={({ item }) => (
          <HomeSectionRow
            sectionId={item.id}
            label={item.label}
            emoji={item.emoji}
            kind={kind}
            locality={locality}
            viewerLat={viewerLat}
            viewerLon={viewerLon}
            onOpen={openListing}
            refreshKey={sectionsRefreshKey}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🐾</Text>
            <Text style={styles.emptyTitle}>Aún no hay publicaciones</Text>
            <Text style={styles.emptyText}>Sé el primero en vender un producto o servicio.</Text>
          </View>
        }
      />
    );
  }

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

      <LocalityPicker
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: spacing.xl, gap: 4 },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 4 },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});
