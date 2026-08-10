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
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import {
  PETS,
  getOwner,
  petAvatar,
  generatePetPosts,
  formatCount,
  SPECIES_LABEL,
  Species,
  Post,
} from '../lib/data';
import { db, ApiPet } from '../lib/db';
import { uploadImage } from '../lib/api';
import { useStore, apiPostToPost } from '../lib/store';
import { postNavParams, sharePetProfile } from '../lib/share';
import { thumb, petFallbackAvatar, userFallbackAvatar } from '../lib/images';
import { FollowButton } from '../components/FollowButton';
import { StatBlock } from '../components/StatBlock';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';
import { useBreakpoint, CONTENT } from '../lib/responsive';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'PetProfile'>;

export default function PetProfileScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { width } = useWindowDimensions();
  const { desktopWeb } = useBreakpoint();
  const { followedPets, toggleFollowPet, user, refreshMyPets, deletedPostIds, editedCaptions } = useStore();

  const petId = route.params.petId;
  const demoPet = useMemo(() => PETS.find((p) => p.id === petId), [petId]);

  const [realPet, setRealPet] = useState<ApiPet | null>(null);
  const [realOwner, setRealOwner] = useState<{ id: string; username: string; name: string; avatarUrl: string | null } | null>(null);
  const [realStats, setRealStats] = useState<{ posts: number; followers: number } | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [locationDone, setLocationDone] = useState(false);

  useEffect(() => {
    (async () => {
      if (demoPet) {
        setPosts(generatePetPosts(demoPet.id));
        setLoading(false);
        return;
      }
      try {
        const [prof, petPosts] = await Promise.all([db.petProfile(petId), db.petPosts(petId)]);
        setRealPet(prof.pet);
        setRealOwner(prof.owner);
        setRealStats(prof.stats);
        setPosts(petPosts.posts.map(apiPostToPost));
      } catch {}
      setLoading(false);
    })();
  }, [petId, demoPet]);

  const following = followedPets.includes(petId);
  const isMyPet = !demoPet && !!realPet && realPet.userId === user?.id;
  const availW = desktopWeb ? Math.min(width, CONTENT.page) : width;
  const tile = (availW - spacing.lg * 2 - 4) / 3;
  const openPost = useCallback(
    (post: Post) => navigation.navigate('PostDetail', postNavParams(post)),
    [navigation]
  );

  // Subir/cambiar la foto de mi mascota (Cloudflare Images + URL en la BD)
  const changePetPhoto = useCallback(async () => {
    if (!isMyPet) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const mime = asset.mimeType || 'image/jpeg';
    const dataUrl = asset.base64 ? `data:${mime};base64,${asset.base64}` : asset.uri;
    if (!dataUrl.startsWith('data:')) return;
    setUploadingPhoto(true);
    try {
      const up = await uploadImage(dataUrl);
      if (up.url.startsWith('data:')) {
        Alert.alert('Error', 'No se pudo subir la foto a Cloudflare');
      } else {
        await db.updatePet(petId, { avatarUrl: up.url });
        db.registerImage(up.url, undefined, 'pet-avatar').catch(() => {});
        setRealPet((p) => (p ? { ...p, avatarUrl: up.url } : p));
        refreshMyPets();
      }
    } catch (e: any) {
      Alert.alert('Error al subir', e?.message || 'Inténtalo de nuevo');
    } finally {
      setUploadingPhoto(false);
    }
  }, [isMyPet, petId, refreshMyPets]);

  // Compartir mi ubicación con el dueño (con permiso GPS visible del navegador/SO).
  // Solo se llama tras un toque explícito del visitante — nunca automático.
  const shareMyLocation = useCallback(async () => {
    if (demoPet) {
      Alert.alert('No disponible', 'Esta mascota es una demostración y no tiene dueño real.');
      return;
    }
    setSharingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permiso no otorgado',
          'No compartimos tu ubicación porque no diste permiso. Puedes intentarlo de nuevo cuando quieras.'
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const result = await db.shareLocation(
        petId,
        pos.coords.latitude,
        pos.coords.longitude,
        pos.coords.accuracy ?? undefined
      );
      setLocationDone(true);
      if (result.notified) {
        Alert.alert('¡Listo! 📍', 'Tu ubicación se compartió con el dueño de la mascota.');
      } else {
        Alert.alert(
          'Ubicación registrada',
          'El dueño aún no tiene un teléfono verificado, así que no se envió el SMS, pero tu ubicación quedó guardada.'
        );
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo obtener tu ubicación');
    } finally {
      setSharingLocation(false);
    }
  }, [demoPet, petId]);

  // ---------- Presentación ----------
  const name = demoPet?.name ?? realPet?.name ?? '...';
  const emoji = demoPet?.emoji ?? realPet?.emoji ?? '🐾';
  const speciesLabel = demoPet
    ? SPECIES_LABEL[demoPet.species]
    : realPet
    ? SPECIES_LABEL[realPet.species as Species] ?? realPet.species
    : '';
  const breed = demoPet?.breed ?? realPet?.breed ?? '';
  const age = demoPet?.age ?? realPet?.age ?? '';
  const bio = demoPet?.bio ?? realPet?.bio ?? '';
  const avatarUri = demoPet ? petAvatar(demoPet) : realPet?.avatarUrl ?? petFallbackAvatar(petId);
  const followerBase = demoPet ? demoPet.followers : realStats?.followers ?? 0;
  const followerTotal = followerBase + (following && !demoPet ? 0 : following ? 1 : 0);
  const ownerName = demoPet ? getOwner(demoPet).name : realOwner?.name ?? '';
  const ownerUsername = demoPet ? getOwner(demoPet).username : realOwner?.username ?? '';
  const ownerAvatar = demoPet
    ? getOwner(demoPet).avatar
    : realOwner?.avatarUrl ?? userFallbackAvatar(ownerUsername || 'dueño');
  const ownerId = demoPet ? getOwner(demoPet).id : realOwner?.id;

  // Avatar 3x: antes 96px → ahora ~288px (limitado por el ancho en móviles chicos)
  const AVATAR = Math.min(288, availW * 0.62);

  // Borrados/ediciones propias aplicadas de forma incremental
  const deletedSet = new Set(deletedPostIds);
  const shownPosts = posts
    .filter((p) => !deletedSet.has(p.id))
    .map((p) => (editedCaptions[p.id] != null ? { ...p, caption: editedCaptions[p.id] } : p));

  const header = (
    <View>
      {/* Barra superior (sin portada) */}
      <SafeAreaView edges={['top']}>
        <View style={styles.topBar}>
          <Pressable onPress={() => navigation.goBack()} style={styles.topBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.topTitle} numberOfLines={1}>
            {name}
          </Text>
          <Pressable style={styles.topBtn} hitSlop={8} onPress={() => sharePetProfile(petId)}>
            <Ionicons name="share-outline" size={20} color={colors.text} />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Avatar gigante */}
      <View style={styles.avatarSection}>
        <Pressable
          onPress={isMyPet ? changePetPhoto : undefined}
          disabled={!isMyPet || uploadingPhoto}
          style={{ alignSelf: 'center' }}
        >
          <Image
            source={{ uri: thumb(avatarUri, 600) }}
            style={[
              styles.avatar,
              { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
            ]}
            contentFit="cover"
            transition={300}
          />
          {uploadingPhoto && (
            <View style={[styles.avatarOverlay, { borderRadius: AVATAR / 2 }]}>
              <ActivityIndicator color="#fff" size="large" />
              <Text style={styles.avatarOverlayText}>Subiendo...</Text>
            </View>
          )}
          <View style={styles.speciesBadge}>
            <Text style={styles.speciesEmoji}>{emoji}</Text>
          </View>
          {isMyPet && !uploadingPhoto && (
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={18} color="#fff" />
            </View>
          )}
        </Pressable>
        {isMyPet && (
          <Pressable onPress={changePetPhoto} disabled={uploadingPhoto}>
            <Text style={styles.changePhotoLink}>
              {uploadingPhoto ? 'Subiendo foto...' : 'Cambiar foto de perfil'}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Identity */}
      <View style={styles.identity}>
        <Text style={styles.petName}>{name}</Text>
        <View style={styles.chipsRow}>
          {speciesLabel !== '' && (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{speciesLabel}</Text>
            </View>
          )}
          {breed !== '' && (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{breed}</Text>
            </View>
          )}
          {age !== '' && (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{age}</Text>
            </View>
          )}
        </View>
        {bio !== '' && <Text style={styles.bio}>{bio}</Text>}
      </View>

      {/* Stats */}
      <View style={styles.statsCard}>
        <StatBlock value={String(posts.filter((p) => !deletedSet.has(p.id)).length)} label="Posts" />
        <View style={styles.statDivider} />
        <StatBlock value={formatCount(followerTotal)} label="Seguidores" />
        <View style={styles.statDivider} />
        <StatBlock value={demoPet ? formatCount(demoPet.following) : '—'} label="Siguiendo" />
      </View>

      <View style={styles.followRow}>
        <FollowButton following={following} onPress={() => toggleFollowPet(petId)} style={{ flex: 1 }} />
      </View>

      {/* Owner */}
      {ownerId && (
        <Pressable
          style={styles.ownerCard}
          onPress={() => navigation.navigate('UserProfile', { userId: ownerId })}
        >
          <Image source={{ uri: thumb(ownerAvatar, 100) }} style={styles.ownerAvatar} transition={200} />
          <View style={{ flex: 1 }}>
            <Text style={styles.ownerLabel}>Humano de {name}</Text>
            <Text style={styles.ownerName}>
              {ownerName} · @{ownerUsername}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      )}

      {!isMyPet && (
        <Pressable
          style={[styles.locationBtn, locationDone && styles.locationBtnDone]}
          onPress={shareMyLocation}
          disabled={sharingLocation || locationDone}
        >
          {sharingLocation ? (
            <ActivityIndicator color={colors.secondary} size="small" />
          ) : (
            <Ionicons
              name={locationDone ? 'checkmark-circle' : 'location-outline'}
              size={18}
              color={locationDone ? colors.secondary : colors.text}
            />
          )}
          <Text style={styles.locationBtnText}>
            {locationDone
              ? 'Ubicación compartida ✓'
              : sharingLocation
              ? 'Obteniendo ubicación...'
              : `Compartir mi ubicación con el dueño de ${name}`}
          </Text>
        </Pressable>
      )}

      <Text style={styles.galleryTitle}>Galería 📸</Text>
      {loading && <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />}
      {!loading && posts.length === 0 && (
        <View style={styles.emptyGallery}>
          <Text style={styles.emptyText}>Aún no hay publicaciones de {name} 🐾</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.safe}>
      <FlatList
        style={desktopWeb ? styles.desktopList : undefined}
        data={shownPosts}
        key="pet-grid"
        numColumns={3}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        columnWrapperStyle={{ gap: 2, paddingHorizontal: spacing.lg }}
        contentContainerStyle={{ gap: 2, paddingBottom: spacing.xxl }}
        renderItem={({ item }) => (
          <Pressable onPress={() => openPost(item)}>
            <Image
              source={{ uri: thumb(item.image, 300) }}
              style={{ width: tile, height: tile, borderRadius: radius.sm, backgroundColor: colors.border }}
              contentFit="cover"
              transition={250}
            />
          </Pressable>
        )}
        showsVerticalScrollIndicator={false}
      />
    </View>
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
    gap: spacing.md,
  },
  topBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { flex: 1, textAlign: 'center', fontWeight: '800', fontSize: 17, color: colors.text },
  avatarSection: { alignItems: 'center', marginTop: spacing.md, gap: spacing.md },
  avatar: {
    borderWidth: 5,
    borderColor: colors.primarysoft,
    backgroundColor: colors.border,
  },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  avatarOverlayText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  speciesBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  speciesEmoji: { fontSize: 22 },
  cameraBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  changePhotoLink: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  identity: { alignItems: 'center', marginTop: spacing.lg, paddingHorizontal: spacing.xl },
  petName: { fontSize: 28, fontWeight: '900', color: colors.text },
  chipsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  chip: {
    backgroundColor: colors.secondarySoft,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.secondary },
  bio: {
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 20,
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    ...shadow.card,
  },
  statDivider: { width: 1, height: 28, backgroundColor: colors.border },
  followRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  ownerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ownerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.border },
  ownerLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  ownerName: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 2 },
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locationBtnDone: {
    backgroundColor: colors.secondarySoft,
    borderColor: colors.secondary,
  },
  locationBtnText: { fontSize: 13, fontWeight: '700', color: colors.text },
  galleryTitle: {
    fontWeight: '800',
    fontSize: 16,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  emptyGallery: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
});
