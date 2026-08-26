import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AdoptionDiscoveryCard from '../components/AdoptionDiscoveryCard';
import { LocalityPicker } from '../components/LocalityPicker';
import {
  ADOPTION_PAGE_SIZE,
  ADOPTION_SEX_FILTERS,
  ADOPTION_SIZE_FILTERS,
  ADOPTION_SPECIES_FILTERS,
  adoptionImmersiveInsets,
  adoptionTabBarVisible,
  type AdoptionCard,
  type AdoptionSexFilter,
  type AdoptionSizeFilter,
  type AdoptionSpeciesFilter,
} from '../lib/adoptionDiscovery';
import { fetchAdoptionPage, loadSavedAdoptionLocality, saveAdoptionLocality } from '../lib/adoptionFeed';
import { detectCurrentLocality, loadSavedAlertsLocality, withProvinceFallback } from '../lib/geo';
import { radius, spacing } from '../lib/theme';
import { RootStackParamList } from '../lib/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function AdoptionDiscoveryScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const tabBarVisible = adoptionTabBarVisible(() => navigation.getParent());
  const androidTop = Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 0 : 0;
  const pads = adoptionImmersiveInsets(
    { top: Math.max(insets.top, androidTop), bottom: insets.bottom },
    tabBarVisible
  );
  const cardBottomPad = pads.systemBottomPad + spacing.lg;
  const [locality, setLocality] = useState<string | null>(null);
  const [province, setProvince] = useState<string | null>(null);
  const [locating, setLocating] = useState(true);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [species, setSpecies] = useState<AdoptionSpeciesFilter>('todos');
  const [size, setSize] = useState<AdoptionSizeFilter>('todos');
  const [sex, setSex] = useState<AdoptionSexFilter>('todos');
  const [items, setItems] = useState<AdoptionCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [listH, setListH] = useState(0);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const oldestRef = useRef<number | undefined>(undefined);
  const loadingMoreRef = useRef(false);

  const filters = useMemo(() => ({ species, size, sex }), [species, size, sex]);

  const loadPage = useCallback(
    async (targetLocality: string | null, reset: boolean) => {
      if (reset) {
        setLoading(true);
        oldestRef.current = undefined;
      } else {
        if (loadingMoreRef.current) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);
      }
      try {
        const page = await fetchAdoptionPage({
          ...filters,
          locality: targetLocality,
          before: reset ? undefined : oldestRef.current,
          limit: ADOPTION_PAGE_SIZE,
        });
        setItems((prev) => {
          if (reset) return page.items;
          const seen = new Set(prev.map((c) => c.id));
          return [...prev, ...page.items.filter((c) => !seen.has(c.id))];
        });
        if (page.items.length > 0) {
          oldestRef.current = page.cursor ?? page.items[page.items.length - 1].createdAt;
        }
        setHasMore(page.hasMore);
      } catch {
        if (reset) setItems([]);
        setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        loadingMoreRef.current = false;
      }
    },
    [filters]
  );

  useEffect(() => {
    (async () => {
      setLocating(true);
      const saved = (await loadSavedAdoptionLocality()) || (await loadSavedAlertsLocality());
      if (saved) {
        setLocality(saved.locality);
        setProvince(saved.province);
        setLocating(false);
        return;
      }
      const detected = await detectCurrentLocality();
      if (detected?.locality) {
        const entry = {
          locality: detected.locality,
          province: withProvinceFallback(detected.locality, detected.province),
        };
        setLocality(entry.locality);
        setProvince(entry.province);
        saveAdoptionLocality(entry);
      }
      setLocating(false);
    })();
  }, []);

  useEffect(() => {
    if (locating) return;
    loadPage(locality, true);
  }, [locating, locality, loadPage]);

  const openPet = useCallback(
    (card: AdoptionCard) => {
      const petId = card.petUsername || card.petId;
      if (petId) navigation.navigate('PetProfile', { petId });
    },
    [navigation]
  );

  const openShelter = useCallback(
    (card: AdoptionCard) => {
      if (card.shelterUsername) {
        navigation.navigate('PublicProfile', { username: card.shelterUsername });
        return;
      }
      if (card.shelterProfileId) {
        navigation.navigate('PublicProfile', { profileId: card.shelterProfileId });
      }
    },
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }: { item: AdoptionCard }) => (
      <AdoptionDiscoveryCard
        card={item}
        height={listH}
        bottomPad={cardBottomPad}
        liked={!!liked[item.id]}
        onToggleLike={() => setLiked((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
        onOpenPet={() => openPet(item)}
        onOpenShelter={() => openShelter(item)}
        onComments={() => openPet(item)}
      />
    ),
    [liked, listH, cardBottomPad, openPet, openShelter]
  );

  const onRootLayout = useCallback((e: { nativeEvent: { layout: { height: number } } }) => {
    const next = Math.floor(e.nativeEvent.layout.height);
    setListH((prev) => (prev === next ? prev : next));
  }, []);

  return (
    <View style={styles.root} onLayout={onRootLayout}>
      <StatusBar style="light" />
      {loading || listH < 8 ? (
        <ActivityIndicator color="#FFFFFF" style={{ marginTop: pads.headerPadTop + 160 }} />
      ) : items.length === 0 ? (
        <Text style={[styles.empty, { paddingTop: pads.headerPadTop + 160 }]}>
          No hay mascotas en adopción con esos filtros. Probá otra combinación o localidad.
        </Text>
      ) : (
        <FlatList
          data={items}
          extraData={liked}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          pagingEnabled
          snapToInterval={listH}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: listH, offset: listH * index, index })}
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          removeClippedSubviews
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (hasMore && !loadingMore) loadPage(locality, false);
          }}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#FFFFFF" /> : null}
        />
      )}

      <View style={styles.chrome} pointerEvents="box-none">
        <LinearGradient
          colors={['rgba(0,0,0,0.46)', 'rgba(0,0,0,0.16)', 'transparent']}
          locations={[0, 0.62, 1]}
          style={[styles.topFade, { height: pads.headerPadTop + 148 }]}
          pointerEvents="none"
        />
        <View style={[styles.topBar, { paddingTop: pads.headerPadTop + spacing.sm }]}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel="Volver">
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </Pressable>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Adoptar</Text>
            <Pressable style={styles.locBtn} onPress={() => setPickerVisible(true)}>
              <Ionicons name="location-outline" size={14} color="#FFFFFF" />
              <Text style={styles.locText} numberOfLines={1}>
                {locating ? 'Ubicación…' : locality || 'Elegir localidad'}
              </Text>
              <Ionicons name="chevron-down" size={14} color="#FFFFFF" />
            </Pressable>
          </View>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.filters}>
          <FilterRow items={ADOPTION_SPECIES_FILTERS} value={species} onChange={setSpecies} />
          <FilterRow items={ADOPTION_SIZE_FILTERS} value={size} onChange={setSize} />
          <FilterRow items={ADOPTION_SEX_FILTERS} value={sex} onChange={setSex} />
        </View>
      </View>

      <LocalityPicker
        visible={pickerVisible}
        currentProvince={province}
        title="Localidad para adoptar"
        onClose={() => setPickerVisible(false)}
        onSelect={(entry) => {
          setLocality(entry.locality);
          setProvince(entry.province);
          saveAdoptionLocality({ locality: entry.locality, province: entry.province });
          setPickerVisible(false);
        }}
      />
    </View>
  );
}

function FilterRow<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {items.map((item) => (
        <Pressable
          key={item.id}
          style={[styles.chip, value === item.id && styles.chipOn]}
          onPress={() => onChange(item.id)}
        >
          <Text style={[styles.chipText, value === item.id && styles.chipTextOn]}>{item.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  chrome: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  titleBlock: { flex: 1, alignItems: 'center' },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  locBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, maxWidth: '90%' },
  locText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  filters: { paddingHorizontal: spacing.sm, paddingBottom: spacing.xs, gap: 6 },
  chipRow: { flexDirection: 'row', gap: 6, paddingRight: spacing.sm },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  chipOn: { backgroundColor: 'rgba(255,255,255,0.30)', borderColor: '#FFFFFF' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  chipTextOn: { color: '#FFFFFF', fontWeight: '800' },
  empty: { textAlign: 'center', color: 'rgba(255,255,255,0.86)', paddingHorizontal: 28, lineHeight: 20 },
});
