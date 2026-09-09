import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Post, generateExplorePage, getPet, PETS, petAvatar, SPECIES_LABEL, Species, formatCount } from '../lib/data';
import { db, ApiPet } from '../lib/db';
import { postNavParams } from '../lib/share';
import { thumb, petFallbackAvatar, userFallbackAvatar } from '../lib/images';
import { LoadingFooter } from '../components/LoadingFooter';
import { PostGridMedia } from '../components/PostBackgroundCard';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';
import { useBreakpoint, CONTENT } from '../lib/responsive';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function openPetInTabs(navigation: Nav, petId: string) {
  navigation.navigate('Tabs', { screen: 'Inicio', params: { screen: 'PetProfile', params: { petId } } });
}

function openProfileInTabs(navigation: Nav, username?: string | null, userId?: string | null) {
  const handle = String(username || '').replace(/^@/, '').toLowerCase();
  if (handle) {
    navigation.navigate('Tabs', {
      screen: 'Inicio',
      params: { screen: 'PublicProfile', params: { username: handle } },
    });
    return;
  }
  if (userId) {
    navigation.navigate('Tabs', { screen: 'Inicio', params: { screen: 'UserProfile', params: { userId } } });
  }
}

const FILTERS: Array<'todos' | Species> = ['todos', 'perro', 'gato', 'conejo', 'loro', 'hámster'];
const FILTER_EMOJI: Record<string, string> = {
  todos: '🐾',
  perro: '🐶',
  gato: '🐱',
  conejo: '🐰',
  loro: '🦜',
  hámster: '🐹',
};

export default function ExploreScreen() {
  const navigation = useNavigation<Nav>();
  const { width } = useWindowDimensions();
  const { desktopWeb, sidebarWidth, bp } = useBreakpoint();
  const [posts, setPosts] = useState<Post[]>(() => [...generateExplorePage(0), ...generateExplorePage(1)]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<'todos' | Species>('todos');
  const [query, setQuery] = useState('');
  const [realPets, setRealPets] = useState<ApiPet[]>([]);
  const [realUsers, setRealUsers] = useState<Array<{ id: string; username: string; name: string; avatarUrl: string | null }>>([]);
  const pageRef = useRef(2);

  const loadMore = useCallback(() => {
    if (loadingMore) return;
    setLoadingMore(true);
    setTimeout(() => {
      const next = generateExplorePage(pageRef.current);
      pageRef.current += 1;
      setPosts((p) => [...p, ...next]);
      setLoadingMore(false);
    }, 600);
  }, [loadingMore]);

  const filtered = useMemo(
    () => (filter === 'todos' ? posts : posts.filter((p) => getPet(p.petId).species === filter)),
    [posts, filter]
  );

  const q = query.trim().toLowerCase();
  const matchedPets = useMemo(
    () =>
      q.length === 0
        ? []
        : PETS.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              p.breed.toLowerCase().includes(q) ||
              SPECIES_LABEL[p.species].toLowerCase().includes(q)
          ),
    [q]
  );

  // Búsqueda en la base de datos (mascotas y usuarios reales)
  React.useEffect(() => {
    if (q.length < 2) {
      setRealPets([]);
      setRealUsers([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await db.search(q);
        if (!cancelled) {
          setRealPets(res.pets);
          setRealUsers(res.users);
        }
      } catch {}
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  type SearchItem =
    | { kind: 'realPet'; pet: ApiPet }
    | { kind: 'realUser'; user: { id: string; username: string; name: string; avatarUrl: string | null } }
    | { kind: 'demoPet'; pet: (typeof PETS)[number] };

  const searchResults: SearchItem[] = useMemo(
    () => [
      ...realUsers.map((user) => ({ kind: 'realUser' as const, user })),
      ...realPets.map((pet) => ({ kind: 'realPet' as const, pet })),
      ...matchedPets.map((pet) => ({ kind: 'demoPet' as const, pet })),
    ],
    [realUsers, realPets, matchedPets]
  );

  // Grilla responsive: 3 col (móvil/tablet), 4 (laptop/desktop), 5 (wide)
  const cols = bp === 'wide' ? 5 : desktopWeb ? 4 : 3;
  const availableW = desktopWeb
    ? Math.min(width - sidebarWidth, CONTENT.page + spacing.lg * 2)
    : width;
  const tile = (availableW - spacing.lg * 2 - 2 * (cols - 1)) / cols;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={desktopWeb ? styles.desktopWrap : styles.mobileWrap}>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar mascotas, razas..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {q.length > 0 ? (
        <FlatList
          style={{ flex: 1 }}
          data={searchResults}
          keyExtractor={(item) =>
            item.kind === 'realUser' ? `u-${item.user.id}` : `p-${item.pet.id}`
          }
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🔍</Text>
              <Text style={styles.emptyTitle}>Sin resultados</Text>
              <Text style={styles.emptyText}>No encontramos nada para “{query}”</Text>
            </View>
          }
          renderItem={({ item }) => {
            if (item.kind === 'realUser') {
              return (
                <Pressable
                  style={styles.petRow}
                  onPress={() => openProfileInTabs(navigation, item.user.username, item.user.id)}
                >
                  <Image
                    source={{ uri: thumb(item.user.avatarUrl ?? userFallbackAvatar(item.user.username), 120) }}
                    style={styles.petRowImg}
                    transition={200}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.petRowName}>{item.user.name}</Text>
                    <Text style={styles.petRowSub}>@{item.user.username} · Usuario</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              );
            }
            if (item.kind === 'realPet') {
              return (
                <Pressable
                  style={styles.petRow}
                  onPress={() => openPetInTabs(navigation, item.pet.username || item.pet.id)}
                >
                  <Image
                    source={{ uri: thumb(item.pet.avatarUrl ?? petFallbackAvatar(item.pet.id), 120) }}
                    style={styles.petRowImg}
                    transition={200}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.petRowName}>
                      {item.pet.name} {item.pet.emoji}
                    </Text>
                    <Text style={styles.petRowSub}>{item.pet.breed || item.pet.species} · Comunidad</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              );
            }
            const p = item.pet;
            return (
              <Pressable
                style={styles.petRow}
                onPress={() => openPetInTabs(navigation, p.id)}
              >
                <Image source={{ uri: thumb(petAvatar(p), 120) }} style={styles.petRowImg} transition={200} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.petRowName}>
                    {p.name} {p.emoji}
                  </Text>
                  <Text style={styles.petRowSub}>
                    {p.breed} · {formatCount(p.followers)} seguidores
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            );
          }}
        />
      ) : (
        <FlatList
          data={filtered}
          key={`grid-${cols}`}
          numColumns={cols}
          keyExtractor={(item) => item.id}
          columnWrapperStyle={{ gap: 2, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{ gap: 2, paddingBottom: spacing.xl }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={FILTERS}
              keyExtractor={(f) => f}
              contentContainerStyle={styles.filters}
              renderItem={({ item }) => {
                const active = filter === item;
                return (
                  <Pressable
                    onPress={() => setFilter(item)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={styles.chipEmoji}>{FILTER_EMOJI[item]}</Text>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {item === 'todos' ? 'Todos' : SPECIES_LABEL[item as Species]}
                    </Text>
                  </Pressable>
                );
              }}
            />
          }
          ListFooterComponent={<LoadingFooter />}
          renderItem={({ item }) => (
            <Pressable onPress={() => navigation.navigate('PostDetail', postNavParams(item))}>
              <PostGridMedia post={item} size={tile} />
            </Pressable>
          )}
          showsVerticalScrollIndicator={false}
        />
      )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  mobileWrap: { flex: 1 },
  desktopWrap: {
    flex: 1,
    width: '100%',
    maxWidth: CONTENT.page + spacing.lg * 2,
    alignSelf: 'center',
    paddingTop: spacing.lg,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, padding: 0 },
  filters: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipEmoji: { fontSize: 14 },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.text },
  chipTextActive: { color: '#fff' },
  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadow.card,
  },
  petRowImg: { width: 52, height: 52, borderRadius: 26 },
  petRowName: { fontWeight: '700', fontSize: 15, color: colors.text },
  petRowSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 6 },
  emptyEmoji: { fontSize: 42 },
  emptyTitle: { fontWeight: '800', fontSize: 17, color: colors.text },
  emptyText: { color: colors.textMuted, fontSize: 14 },
});
