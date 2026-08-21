import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { db, ApiPet } from '../lib/db';
import { apiPostToPost } from '../lib/store';
import { Post, formatCount } from '../lib/data';
import { postNavParams, sharePublicProfile } from '../lib/share';
import { thumb, petFallbackAvatar, userFallbackAvatar } from '../lib/images';
import { FollowButton } from '../components/FollowButton';
import { StatBlock } from '../components/StatBlock';
import { PostGridMedia } from '../components/PostBackgroundCard';
import { colors, spacing, radius } from '../lib/theme';
import { RootStackParamList } from '../lib/types';
import ProfileBadge from '../features/profiles/ProfileBadge';
import type { PublicProfile } from '../features/profiles/profileTypes';
import { ageLabelFromBirthDate } from '../lib/birthDate';
import {
  filterProtectorPets,
  careStatusLabel,
  waitingLabel,
  type StatusFilter,
  type SpeciesFilter,
} from '../lib/petFields';
import { useGuestAccess, ExternalNavButton } from '../lib/guestAccess';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type TabKey = 'mascotas' | 'posts';

const TABS: { id: TabKey; label: string }[] = [
  { id: 'mascotas', label: 'Mascotas' },
  { id: 'posts', label: 'Publicaciones' },
];

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'en_adopcion', label: 'En adopción' },
  { id: 'en_recuperacion', label: 'En recuperación' },
];

const SPECIES_FILTERS: { id: SpeciesFilter; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'perro', label: '🐶 Perros' },
  { id: 'gato', label: '🐱 Gatos' },
  { id: 'otro', label: 'Otros' },
];

export default function PublicProfileScreen() {
  const navigation = useNavigation<Nav>();
  const params = useRoute<RouteProp<RootStackParamList, 'PublicProfile'>>().params || {};
  const routeProfileId = params.profileId;
  const routeUsername = params.username;
  const { width } = useWindowDimensions();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [pets, setPets] = useState<ApiPet[]>([]);
  const [stats, setStats] = useState({ pets: 0, adoption: 0, adopted: 0, recovering: 0, followers: 0 });
  const [isOwner, setIsOwner] = useState(false);
  const [following, setFollowing] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [tab, setTab] = useState<TabKey>('mascotas');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todas');
  const [speciesFilter, setSpeciesFilter] = useState<SpeciesFilter>('todos');
  const [loading, setLoading] = useState(true);
  const { guest, cameFromLink, requireLogin, inviteBar, closeExternal, goBackOrClose } = useGuestAccess();

  const load = useCallback(async () => {
    try {
      const pub = await db.publicProfile({
        profileId: routeProfileId,
        username: routeUsername,
      });
      const feed = await db.profilePosts(pub.profile.id);
      setProfile(pub.profile);
      setPets(pub.pets);
      setStats({
        pets: pub.stats.pets ?? (pub.pets?.length || 0),
        adoption: pub.stats.adoption || 0,
        adopted: pub.stats.adopted || 0,
        recovering: pub.stats.recovering || 0,
        followers: pub.stats.followers || 0,
      });
      setIsOwner(pub.isOwner);
      setFollowing(pub.isFollowing);
      setPosts(feed.posts.map(apiPostToPost));
      const handle = pub.profile.username;
      if (handle && routeUsername !== handle) {
        navigation.replace('PublicProfile', { username: handle });
        return;
      }
    } catch (e: any) {
      Alert.alert('Perfil', e?.message || 'No se pudo abrir el perfil');
    } finally {
      setLoading(false);
    }
  }, [routeProfileId, routeUsername, navigation]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (!loading) load();
    }, [load, loading])
  );

  const toggleFollow = useCallback(async () => {
    if (guest) { requireLogin(); return; }
    const next = !following;
    setFollowing(next);
    setStats((s) => ({ ...s, followers: Math.max(0, s.followers + (next ? 1 : -1)) }));
    try {
      await db.follow('profile', profile?.id || routeProfileId || '', next);
    } catch {
      setFollowing(!next);
      setStats((s) => ({ ...s, followers: Math.max(0, s.followers + (next ? -1 : 1)) }));
    }
  }, [following, profile?.id, routeProfileId, guest, requireLogin]);

  const filteredPets = useMemo(
    () => filterProtectorPets(pets, statusFilter, speciesFilter),
    [pets, statusFilter, speciesFilter]
  );

  const tile = (width - spacing.lg * 2 - 12) / 2;
  const postTile = (width - spacing.lg * 2 - 4) / 3;

  if (loading || !profile) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topBar}>
          <Pressable onPress={goBackOrClose} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
        </View>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        {inviteBar}
      </SafeAreaView>
    );
  }

  const avatar = profile.avatar || userFallbackAvatar(profile.username);
  const isProtector = profile.type === 'protector';

  const header = (
    <View>
      <View style={styles.topBar}>
        <ExternalNavButton
          guest={guest}
          cameFromLink={cameFromLink}
          showBack
          onBack={goBackOrClose}
          onClose={closeExternal}
        />
        <Text style={styles.topUser}>@{profile.username}</Text>
        <Pressable
          style={styles.topBtn}
          hitSlop={8}
          onPress={() => sharePublicProfile(profile.name, profile.username, profile.bio)}
        >
          <Ionicons name="share-outline" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.head}>
        <Image source={{ uri: thumb(avatar, 200) }} style={styles.avatar} />
        <View style={styles.nameRow}>
          <Text style={styles.name}>{profile.name}</Text>
          {isProtector && <Ionicons name="checkmark-circle" size={18} color={colors.secondary} />}
        </View>
        <Text style={styles.handle}>@{profile.username}</Text>
        <ProfileBadge type={profile.type} />
        {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
        {!!profile.phone && (
          <View style={styles.loc}>
            <Ionicons name="call-outline" size={13} color={colors.textMuted} />
            <Text style={styles.locText}>{profile.phone}</Text>
          </View>
        )}
        {!!profile.location && (
          <View style={styles.loc}>
            <Ionicons name="location-outline" size={13} color={colors.textMuted} />
            <Text style={styles.locText}>{profile.location}</Text>
          </View>
        )}
      </View>

      {isProtector && (
        <View style={styles.stats}>
          <StatBlock value={String(stats.pets)} label="Mascotas" />
          <StatBlock value={formatCount(stats.followers)} label="Seguidores" />
          <StatBlock value={String(stats.adopted)} label="Adoptados" />
        </View>
      )}

      <View style={styles.actionRow}>
        {isOwner ? (
          <>
            <Pressable
              style={styles.editBtn}
              onPress={() => navigation.navigate('EditPublicProfile', { profileId: profile.id })}
            >
              <Text style={styles.editText}>Editar perfil</Text>
            </Pressable>
            {isProtector && (
              <Pressable
                style={styles.editBtn}
                onPress={() => navigation.navigate('AddPet', { profileId: profile.id })}
              >
                <Text style={styles.editText}>+ Mascota</Text>
              </Pressable>
            )}
          </>
        ) : (
          <>
            <FollowButton following={following} onPress={toggleFollow} style={{ flex: 1 }} />
            <Pressable style={styles.editBtn} onPress={() => { if (guest) requireLogin(); }}>
              <Text style={styles.editText}>Mensaje</Text>
            </Pressable>
          </>
        )}
      </View>

      {isProtector && (
        <>
          <View style={styles.tabRow}>
            {TABS.map((t) => (
              <Pressable
                key={t.id}
                style={[styles.tabBtn, tab === t.id && styles.tabActive]}
                onPress={() => setTab(t.id)}
              >
                <Text style={[styles.tabLabel, tab === t.id && styles.tabLabelOn]} numberOfLines={1}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {tab === 'mascotas' && (
            <View style={styles.filters}>
              <ScrollChips
                items={STATUS_FILTERS}
                value={statusFilter}
                onChange={setStatusFilter}
              />
              <ScrollChips
                items={SPECIES_FILTERS}
                value={speciesFilter}
                onChange={setSpeciesFilter}
              />
            </View>
          )}
        </>
      )}
    </View>
  );

  if (!isProtector) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          ListHeaderComponent={header}
          numColumns={3}
          columnWrapperStyle={{ gap: 2, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{ paddingBottom: guest ? 260 : 40 }}
          renderItem={({ item }) => (
            <Pressable onPress={() => navigation.navigate('PostDetail', postNavParams(item))}>
              <PostGridMedia post={item} size={postTile} />
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>Todavía no hay publicaciones de este perfil.</Text>
          }
        />
        {inviteBar}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {tab === 'posts' ? (
        <FlatList
          data={posts}
          key="posts"
          keyExtractor={(p) => p.id}
          ListHeaderComponent={header}
          numColumns={3}
          columnWrapperStyle={posts.length ? { gap: 2, paddingHorizontal: spacing.lg } : undefined}
          contentContainerStyle={{ paddingBottom: guest ? 260 : 40 }}
          renderItem={({ item }) => (
            <Pressable onPress={() => navigation.navigate('PostDetail', postNavParams(item))}>
              <PostGridMedia post={item} size={postTile} />
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Este perfil todavía no publicó.</Text>}
        />
      ) : (
        <FlatList
          data={filteredPets}
          key="mascotas"
          keyExtractor={(p) => p.id}
          ListHeaderComponent={header}
          numColumns={2}
          columnWrapperStyle={filteredPets.length ? { gap: 12, paddingHorizontal: spacing.lg } : undefined}
          contentContainerStyle={{ paddingBottom: guest ? 260 : 40, gap: 12 }}
          renderItem={({ item }) => {
            const age = ageLabelFromBirthDate(item.birthDate) || item.age;
            const wait =
              item.careStatus === 'en_adopcion' ? waitingLabel(item.adoptionStartedAt) : '';
            return (
              <Pressable
                style={[styles.petTile, { width: tile }]}
                onPress={() => navigation.navigate('PetProfile', { petId: item.username || item.id })}
              >
                <Image
                  source={{ uri: thumb(item.avatarUrl || petFallbackAvatar(item.id), 400) }}
                  style={[styles.petImg, { width: tile - 16, height: tile - 16 }]}
                />
                <Text style={styles.petName}>{item.name}</Text>
                <Text style={styles.petMeta}>
                  {[careStatusLabel(item.careStatus), age].filter(Boolean).join(' · ')}
                </Text>
                {!!wait && <Text style={styles.petWait}>{wait}</Text>}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {pets.length === 0
                ? 'Este refugio todavía no cargó mascotas.'
                : 'No hay mascotas con esos filtros.'}
            </Text>
          }
        />
      )}
      {inviteBar}
    </SafeAreaView>
  );
}

function ScrollChips<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {items.map((item) => (
        <Pressable
          key={item.id}
          style={[styles.filterChip, value === item.id && styles.filterChipOn]}
          onPress={() => onChange(item.id)}
        >
          <Text style={[styles.filterText, value === item.id && styles.filterTextOn]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  topUser: { fontWeight: '800', fontSize: 16, color: colors.text },
  topBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  head: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: colors.primarysoft,
    backgroundColor: colors.border,
    marginBottom: 10,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { fontWeight: '800', fontSize: 22, color: colors.text },
  handle: { color: colors.primary, fontWeight: '700', marginTop: 2 },
  bio: { textAlign: 'center', color: colors.text, marginTop: 10, lineHeight: 20, fontSize: 14 },
  loc: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6 },
  locText: { color: colors.textMuted, fontSize: 12 },
  stats: { flexDirection: 'row', paddingHorizontal: spacing.lg, marginTop: spacing.md },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  editBtn: {
    flex: 1,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    backgroundColor: colors.card,
  },
  editText: { fontWeight: '700', fontSize: 13, color: colors.text },
  tabRow: {
    flexDirection: 'row',
    marginTop: spacing.xl,
    marginHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 2 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textAlign: 'center' },
  tabLabelOn: { color: colors.primary },
  filters: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipOn: { backgroundColor: colors.primarysoft, borderColor: colors.primary },
  filterText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  filterTextOn: { color: colors.primary },
  petTile: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 8,
  },
  petImg: { borderRadius: radius.sm, backgroundColor: colors.border, marginBottom: 8 },
  petName: { fontWeight: '800', color: colors.text, fontSize: 14 },
  petMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  petWait: { color: colors.primary, fontSize: 11, fontWeight: '700', marginTop: 4 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 24, paddingHorizontal: 28 },
});
