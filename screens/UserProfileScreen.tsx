import React, { useMemo, useCallback, useState, useEffect } from 'react';
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
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { USERS, getPet as getDemoPet, petAvatar, generateUserPosts, formatCount, Post } from '../lib/data';
import { db, ApiUser, ApiPet } from '../lib/db';
import { useStore, apiPostToPost } from '../lib/store';
import { postNavParams, sharePublicProfile } from '../lib/share';
import { thumb, petFallbackAvatar, userFallbackAvatar } from '../lib/images';
import { FollowButton } from '../components/FollowButton';
import WantToAdoptButton from '../components/WantToAdoptButton';
import { StatBlock } from '../components/StatBlock';
import { PostGridMedia } from '../components/PostBackgroundCard';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';
import { useBreakpoint, CONTENT } from '../lib/responsive';
import { useProfiles, CreateProfileSheet } from '../features/profiles';
import { PROFILE_TYPE_LABEL, type PublicProfile } from '../features/profiles/profileTypes';
import { filterPersonalPets } from '../lib/petOwnership';
import { useGuestAccess, ExternalNavButton } from '../lib/guestAccess';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Props {
  userId?: string; // undefined = mi perfil
  showBack?: boolean;
}

interface DisplayPet {
  id: string;
  name: string;
  emoji: string;
  breed: string;
  avatarUri: string;
  username?: string;
}

export default function UserProfileScreen({ userId, showBack = false }: Props) {
  const navigation = useNavigation<Nav>();
  const { width } = useWindowDimensions();
  const { desktopWeb, sidebarWidth } = useBreakpoint();
  const {
    user: me,
    followedUsers,
    toggleFollowUser,
    savedPosts,
    myPets,
    refreshMyPets,
    verifiedPhone,
    logout,
    deletedPostIds,
    editedCaptions,
  } = useStore();
  const { profiles: myProfiles } = useProfiles();
  const { guest, cameFromLink, requireLogin, inviteBar, closeExternal, goBackOrClose } = useGuestAccess({
    treatAsExternal: showBack,
  });
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [accountProfiles, setAccountProfiles] = useState<PublicProfile[]>([]);

  const isMe = !userId || userId === me?.id;
  const targetId = isMe ? me?.id : userId;
  const demoUser = useMemo(() => USERS.find((u) => u.id === userId), [userId]);

  const [profile, setProfile] = useState<ApiUser | null>(null);
  const [profilePets, setProfilePets] = useState<ApiPet[]>([]);
  const [stats, setStats] = useState<{ posts: number; followers: number } | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [savedList, setSavedList] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'posts' | 'saved'>('posts');

  const load = useCallback(async () => {
    // Usuario demo: datos generados
    if (demoUser) {
      setProfile(null);
      setPosts(generateUserPosts(demoUser.id));
      setLoading(false);
      return;
    }
    if (!targetId) {
      setLoading(false);
      return;
    }
    try {
      const [prof, userPosts] = await Promise.all([
        db.userProfile(targetId),
        db.userPosts(targetId),
      ]);
      setProfile(prof.user);
      setProfilePets(prof.pets);
      setAccountProfiles((prof.profiles || []).filter((x) => x.type !== 'personal'));
      setStats(prof.stats);
      setPosts(userPosts.posts.map(apiPostToPost));
      if (isMe) {
        const saved = await db.savedPosts();
        setSavedList(saved.posts.map(apiPostToPost));
        refreshMyPets();
      }
    } catch {}
    setLoading(false);
  }, [demoUser, targetId, isMe, refreshMyPets]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (isMe) load();
    }, [isMe, load])
  );

  const confirmLogout = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).confirm) {
      if ((window as any).confirm('¿Cerrar sesión?')) logout();
    } else {
      Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Salir', style: 'destructive', onPress: () => logout() },
      ]);
    }
  }, [logout]);

  // ---------- Datos de presentación ----------
  const displayName = demoUser?.name ?? profile?.name ?? me?.name ?? '';
  const displayUsername = demoUser?.username ?? profile?.username ?? me?.username ?? '';
  const displayBio = demoUser?.bio ?? profile?.bio ?? '';
  const displayLocation = demoUser?.location ?? profile?.location ?? '';
  const displayAvatar =
    demoUser?.avatar ??
    profile?.avatarUrl ??
    me?.avatarUrl ??
    userFallbackAvatar(displayUsername || 'yo');
  const isVerified = isMe ? !!verifiedPhone : !!profile?.verifiedPhone;

  const ownedPets = isMe ? myPets : profilePets;
  const personalPets = filterPersonalPets(ownedPets, isMe ? myProfiles : accountProfiles);
  const displayPets: DisplayPet[] = demoUser
    ? demoUser.petIds.map((pid) => {
        const p = getDemoPet(pid);
        return { id: p.id, name: p.name, emoji: p.emoji, breed: p.breed, avatarUri: petAvatar(p) };
      })
    : personalPets.map((p) => ({
        id: p.id,
        name: p.name,
        emoji: p.emoji,
        breed: p.breed || p.species,
        avatarUri: p.avatarUrl ?? petFallbackAvatar(p.id),
        username: p.username ?? undefined,
      }));

  const deletedSet = new Set(deletedPostIds);
  const patchPosts = (list: Post[]) =>
    list
      .filter((p) => !deletedSet.has(p.id))
      .map((p) => (editedCaptions[p.id] != null ? { ...p, caption: editedCaptions[p.id] } : p));
  const shown = patchPosts(tab === 'saved' && isMe ? savedList : posts);
  const availW = desktopWeb ? Math.min(width - (showBack ? 0 : sidebarWidth), CONTENT.page) : width;
  const tile = (availW - spacing.lg * 2 - 4) / 3;

  const followerCount = demoUser
    ? 3200 + demoUser.petIds.length * 1800
    : stats?.followers ?? 0;
  const following = userId ? followedUsers.includes(userId) : false;

  const openPost = useCallback(
    (post: Post) => navigation.navigate('PostDetail', postNavParams(post)),
    [navigation]
  );

  const header = (
    <View>
      {/* Top bar */}
      <View style={styles.topBar}>
        {showBack || cameFromLink ? (
          <ExternalNavButton
            guest={guest}
            cameFromLink={cameFromLink}
            showBack={showBack}
            onBack={goBackOrClose}
            onClose={closeExternal}
          />
        ) : (
          <View style={{ width: 24 }} />
        )}
        <Text style={styles.username}>@{displayUsername}</Text>
        <View style={styles.topBarActions}>
          {!!displayUsername && (
            <Pressable
              onPress={() => sharePublicProfile(displayName, displayUsername, displayBio)}
              hitSlop={8}
            >
              <Ionicons name="share-outline" size={22} color={colors.text} />
            </Pressable>
          )}
          {isMe && me?.username === 'lucasfuentes' && (
            <Pressable onPress={() => navigation.navigate('AdminTags')} hitSlop={8}>
              <Ionicons name="qr-code-outline" size={22} color={colors.text} />
            </Pressable>
          )}
          {isMe && (
            <Pressable onPress={confirmLogout} hitSlop={8}>
              <Ionicons name="log-out-outline" size={22} color={colors.text} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Info */}
      <View style={styles.infoRow}>
        <Image source={{ uri: thumb(displayAvatar, 200) }} style={styles.avatar} transition={250} />
        <View style={styles.stats}>
          <StatBlock value={String(patchPosts(posts).length)} label="Posts" />
          <StatBlock value={formatCount(followerCount)} label="Seguidores" />
          <StatBlock value={String(displayPets.length)} label="Mascotas" />
        </View>
      </View>

      <View style={styles.bioBlock}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{displayName}</Text>
          {isVerified && <Ionicons name="checkmark-circle" size={18} color={colors.secondary} />}
        </View>
        {displayLocation !== '' && (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={13} color={colors.textMuted} />
            <Text style={styles.location}>{displayLocation}</Text>
          </View>
        )}
        {displayBio !== '' && <Text style={styles.bio}>{displayBio}</Text>}
      </View>

      {/* Acciones */}
      {isMe ? (
        <View>
          <View style={styles.actionRow}>
            <Pressable style={styles.editBtn} onPress={() => navigation.navigate('EditProfile')}>
              <Text style={styles.editText}>Editar perfil</Text>
            </Pressable>
            <Pressable style={styles.editBtn} onPress={() => navigation.navigate('AddPet')}>
              <Text style={styles.editText}>+ Mascota</Text>
            </Pressable>
          </View>
          <View style={styles.adoptRow}>
            <WantToAdoptButton
              size="block"
              onPress={() => navigation.navigate('AdoptionDiscovery')}
            />
          </View>
        </View>
      ) : (
        <View style={styles.actionRow}>
          <FollowButton
            following={following}
            onPress={() => {
              if (guest) { requireLogin(); return; }
              if (userId) toggleFollowUser(userId);
            }}
            style={{ flex: 1 }}
          />
          <Pressable style={styles.editBtn} onPress={() => { if (guest) requireLogin(); }}>
            <Text style={styles.editText}>Mensaje</Text>
          </Pressable>
        </View>
      )}

      {isMe && !verifiedPhone && (
        <Pressable style={styles.verifyBanner} onPress={() => navigation.navigate('VerifyPhone')}>
          <View style={styles.verifyIcon}>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.verifyTitle}>Verifica tu cuenta por SMS</Text>
            <Text style={styles.verifySub}>Consigue tu insignia de verificación ✓</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      )}

      {/* Mascotas */}
      <Text style={styles.sectionTitle}>
        {isMe ? 'Mis mascotas' : `Mascotas de ${displayName.split(' ')[0]}`} 🐾
      </Text>
      {displayPets.length === 0 ? (
        <View style={styles.noPets}>
          <Text style={styles.noPetsText}>
            {isMe ? 'Registra a tu primera mascota con el botón "+ Mascota"' : 'Aún no tiene mascotas registradas'}
          </Text>
        </View>
      ) : (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={displayPets}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => (
            <Pressable
              style={styles.petCard}
              onPress={() => navigation.navigate('PetProfile', { petId: item.username || item.id })}
            >
              <Image source={{ uri: thumb(item.avatarUri, 150) }} style={styles.petImg} transition={250} />
              <Text style={styles.petName}>
                {item.username ? `@${item.username}` : item.name} {item.emoji}
              </Text>
              <Text style={styles.petBreed} numberOfLines={1}>
                {item.breed}
              </Text>
            </Pressable>
          )}
        />
      )}

      <Text style={styles.sectionTitle}>
        {isMe ? 'Mis páginas' : 'Páginas'}
      </Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={isMe ? myProfiles.filter((p) => p.type !== 'personal') : accountProfiles}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
        ListFooterComponent={
          isMe ? (
            <Pressable style={styles.petCard} onPress={() => setCreatingProfile(true)}>
              <View style={styles.addCircle}>
                <Ionicons name="add" size={28} color={colors.primary} />
              </View>
              <Text style={styles.petName}>Crear página</Text>
              <Text style={styles.petBreed}>Tienda o refugio</Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.petCard}
            onPress={() => navigation.navigate('PublicProfile', { username: item.username })}
          >
            <Image
              source={{ uri: thumb(item.avatar || userFallbackAvatar(item.username), 150) }}
              style={styles.petImg}
              transition={250}
            />
            <Text style={styles.petName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.petBreed} numberOfLines={1}>
              {PROFILE_TYPE_LABEL[item.type]}
            </Text>
          </Pressable>
        )}
      />
      {isMe && <CreateProfileSheet visible={creatingProfile} onClose={() => setCreatingProfile(false)} />}

      {/* Tabs */}
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tabBtn, tab === 'posts' && styles.tabActive]}
          onPress={() => setTab('posts')}
        >
          <Ionicons name="grid-outline" size={20} color={tab === 'posts' ? colors.primary : colors.textMuted} />
        </Pressable>
        {isMe && (
          <Pressable
            style={[styles.tabBtn, tab === 'saved' && styles.tabActive]}
            onPress={() => setTab('saved')}
          >
            <Ionicons name="bookmark-outline" size={20} color={tab === 'saved' ? colors.primary : colors.textMuted} />
          </Pressable>
        )}
      </View>
      {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}
      {!loading && shown.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>{tab === 'saved' ? '🔖' : '📷'}</Text>
          <Text style={styles.emptyTitle}>
            {tab === 'saved' ? 'Nada guardado aún' : 'Sin publicaciones'}
          </Text>
          <Text style={styles.emptyText}>
            {tab === 'saved'
              ? 'Toca el marcador en cualquier publicación para guardarla aquí.'
              : isMe
              ? 'Comparte el primer momento de tu mascota desde la pestaña Crear.'
              : 'Este usuario aún no ha publicado.'}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        style={desktopWeb ? styles.desktopList : undefined}
        data={shown}
        key="user-grid"
        numColumns={3}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        columnWrapperStyle={{ gap: 2, paddingHorizontal: spacing.lg }}
        contentContainerStyle={{ gap: 2, paddingBottom: guest ? 260 : spacing.xxl }}
        renderItem={({ item }) => (
          <Pressable onPress={() => openPost(item)}>
            <PostGridMedia post={item} size={tile} />
          </Pressable>
        )}
        showsVerticalScrollIndicator={false}
      />
      {inviteBar}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  desktopList: {
    width: '100%',
    maxWidth: CONTENT.page,
    alignSelf: 'center',
    paddingTop: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  username: { fontWeight: '800', fontSize: 17, color: colors.text },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.xl,
  },
  avatar: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: colors.primarysoft, backgroundColor: colors.border },
  stats: { flex: 1, flexDirection: 'row' },
  bioBlock: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { fontWeight: '800', fontSize: 17, color: colors.text },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  location: { fontSize: 12, color: colors.textMuted },
  bio: { fontSize: 14, color: colors.text, marginTop: 6, lineHeight: 20 },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  adoptRow: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
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
  verifyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.primarysoft,
    ...shadow.card,
  },
  verifyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarysoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyTitle: { fontWeight: '700', fontSize: 14, color: colors.text },
  verifySub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  sectionTitle: {
    fontWeight: '800',
    fontSize: 16,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  noPets: { paddingHorizontal: spacing.lg },
  noPetsText: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  petCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    width: 120,
    ...shadow.card,
  },
  petImg: { width: 60, height: 60, borderRadius: 30, marginBottom: spacing.sm, backgroundColor: colors.border },
  petName: { fontWeight: '700', fontSize: 13, color: colors.text },
  petBreed: { fontSize: 11, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  addCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarysoft,
  },
  tabRow: {
    flexDirection: 'row',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    marginHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 40, gap: 6 },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontWeight: '800', fontSize: 16, color: colors.text },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
