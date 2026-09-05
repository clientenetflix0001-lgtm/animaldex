import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
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
  Post,
} from '../lib/data';
import { db, ApiPet } from '../lib/db';
import { uploadImage } from '../lib/api';
import { useStore, apiPostToPost } from '../lib/store';
import { postNavParams, sharePetProfile } from '../lib/share';
import { thumb, petFallbackAvatar, userFallbackAvatar } from '../lib/images';
import { FollowButton } from '../components/FollowButton';
import PetStatusAvatar from '../components/PetStatusAvatar';
import QrLostPetModal from '../components/QrLostPetModal';
import { shouldShowQrLostPrompt } from '../lib/qrLostPet';
import { StatBlock } from '../components/StatBlock';
import { PostGridMedia } from '../components/PostBackgroundCard';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';
import { useBreakpoint, CONTENT } from '../lib/responsive';
import { ageLabelFromBirthDate } from '../lib/birthDate';
import { careStatusLabel, waitingLabel, sizeLabel, speciesLabel as speciesLabelFn } from '../lib/petFields';
import type { PublicProfile } from '../features/profiles/profileTypes';
import { useGuestAccess, ExternalNavButton } from '../lib/guestAccess';
import { openHumanProfile } from '../lib/publicHandles';
import { ReelGridTile, openReelFromGrid, useReelGrid } from '../components/ReelGrid';
import type { ApiReel } from '../lib/db';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'PetProfile'>;

export default function PetProfileScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { width } = useWindowDimensions();
  const { desktopWeb } = useBreakpoint();
  const { followedPets, toggleFollowPet, user, refreshMyPets, deletedPostIds, editedCaptions } = useStore();
  const { guest, cameFromLink, requireLogin, inviteBar, closeExternal, goBackOrClose } = useGuestAccess();

  const petId = route.params.petId;
  const fromQr = !!route.params.fromQr;
  const demoPet = useMemo(() => PETS.find((p) => p.id === petId), [petId]);

  const [realPet, setRealPet] = useState<ApiPet | null>(null);
  const [realOwner, setRealOwner] = useState<{ id: string; username: string; name: string; avatarUrl: string | null } | null>(null);
  const [shelter, setShelter] = useState<PublicProfile | null>(null);
  const [realStats, setRealStats] = useState<{ posts: number; followers: number } | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [locationDone, setLocationDone] = useState(false);
  const [galleryTab, setGalleryTab] = useState<'posts' | 'reels'>('posts');
  const [qrLostOpen, setQrLostOpen] = useState(false);
  const qrLostArmed = useRef(false);

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
        setShelter(prof.shelter || null);
        setRealStats(prof.stats);
        setPosts(petPosts.posts.map(apiPostToPost));
      } catch {}
      setLoading(false);
    })();
  }, [petId, demoPet]);

  const following = followedPets.includes(petId);
  const isMyPet = !demoPet && !!realPet && realPet.userId === user?.id;

  useEffect(() => {
    if (qrLostArmed.current) return;
    if (
      shouldShowQrLostPrompt({
        fromQr,
        careStatus: realPet?.careStatus,
        isOwner: isMyPet,
        loading,
      })
    ) {
      qrLostArmed.current = true;
      setQrLostOpen(true);
    }
  }, [fromQr, realPet?.careStatus, isMyPet, loading]);
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
        await db.updatePet(realPet?.id || petId, { avatarUrl: up.url });
        db.registerImage(up.url, undefined, 'pet-avatar').catch(() => {});
        setRealPet((p) => (p ? { ...p, avatarUrl: up.url } : p));
        refreshMyPets();
      }
    } catch (e: any) {
      Alert.alert('Error al subir', e?.message || 'Inténtalo de nuevo');
    } finally {
      setUploadingPhoto(false);
    }
  }, [isMyPet, petId, realPet?.id, refreshMyPets]);

  // Compartir mi ubicación con el dueño (con permiso GPS visible del navegador/SO).
  // Solo se llama tras un toque explícito del visitante — nunca automático.
  // Público: el Worker no exige sesión. Se envía realPet.id (nunca el handle de la ruta).
  const shareMyLocation = useCallback(async () => {
    if (demoPet) {
      Alert.alert('No disponible', 'Esta mascota es una demostración y no tiene dueño real.');
      return false;
    }
    const internalId = realPet?.id;
    if (!internalId) {
      if (loading) return false;
      Alert.alert('Espera un momento', 'Todavía estamos cargando el perfil de la mascota.');
      return false;
    }
    setSharingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permiso no otorgado',
          'No compartimos tu ubicación porque no diste permiso. Puedes intentarlo de nuevo cuando quieras.'
        );
        return false;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const result = await db.shareLocation(
        internalId,
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
      return true;
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo obtener tu ubicación');
      return false;
    } finally {
      setSharingLocation(false);
    }
  }, [demoPet, realPet?.id, loading]);

  // ---------- Presentación ----------
  const name = demoPet?.name ?? realPet?.name ?? '...';
  const petHandle = realPet?.username ?? (demoPet ? demoPet.name.toLowerCase() : '');
  const emoji = demoPet?.emoji ?? realPet?.emoji ?? '🐾';
  const speciesLabel = demoPet
    ? SPECIES_LABEL[demoPet.species]
    : realPet
    ? speciesLabelFn(realPet.species)
    : '';
  const breed = demoPet?.breed ?? realPet?.breed ?? '';
  const age = demoPet?.age ?? (realPet ? ageLabelFromBirthDate(realPet.birthDate) || realPet.age : '') ?? '';
  const bio = demoPet?.bio ?? realPet?.bio ?? '';
  const statusText = realPet ? careStatusLabel(realPet.careStatus) : '';
  const waitText =
    realPet?.careStatus === 'en_adopcion' ? waitingLabel(realPet.adoptionStartedAt) : '';
  const sizeText = realPet ? sizeLabel(realPet.size) : '';
  const neuteredText =
    realPet?.neutered == null ? '' : realPet.neutered ? 'Castrado' : 'Sin castrar';
  const isProtectorPet = !!realPet?.profileId;
  const avatarUri = demoPet ? petAvatar(demoPet) : realPet?.avatarUrl ?? petFallbackAvatar(petId);
  const followerBase = demoPet ? demoPet.followers : realStats?.followers ?? 0;
  const followerTotal = followerBase + (following && !demoPet ? 0 : following ? 1 : 0);
  const ownerName = demoPet ? getOwner(demoPet).name : realOwner?.name ?? '';
  const ownerUsername = demoPet ? getOwner(demoPet).username : realOwner?.username ?? '';
  const ownerAvatar = demoPet
    ? getOwner(demoPet).avatar
    : realOwner?.avatarUrl ?? userFallbackAvatar(ownerUsername || 'dueño');
  const ownerId = demoPet ? getOwner(demoPet).id : realOwner?.id;

  // Borrados/ediciones propias aplicadas de forma incremental
  const deletedSet = new Set(deletedPostIds);
  const shownPosts = posts
    .filter((p) => !deletedSet.has(p.id))
    .map((p) => (editedCaptions[p.id] != null ? { ...p, caption: editedCaptions[p.id] } : p));
  const reelScope = !demoPet && (realPet?.id || petId) ? { type: 'pet' as const, id: realPet?.id || petId } : null;
  const reelsGrid = useReelGrid(reelScope, galleryTab === 'reels' && !!reelScope);

  const header = (
    <View>
      {/* Barra superior (sin portada) */}
      <SafeAreaView edges={['top']}>
        <View style={styles.topBar}>
          <ExternalNavButton
            guest={guest}
            cameFromLink={cameFromLink}
            showBack
            onBack={goBackOrClose}
            onClose={closeExternal}
          />
          <Text style={styles.topTitle} numberOfLines={1}>
            {name}
          </Text>
          <Pressable style={styles.topBtn} hitSlop={8} onPress={() => sharePetProfile(petId, petHandle)}>
            <Ionicons name="share-outline" size={20} color={colors.text} />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Identidad: información + avatar compacto */}
      <View style={styles.identityRow}>
        <View style={styles.identityCopy}>
          <Text style={styles.petName} numberOfLines={2}>
            {name}
          </Text>
          {!!petHandle && (
            <Text style={styles.petHandle} numberOfLines={1} ellipsizeMode="tail">
              @{petHandle}
            </Text>
          )}
          <View style={styles.chipsRow}>
            {!!statusText && (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{statusText}</Text>
              </View>
            )}
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
            {sizeText !== '' && (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{sizeText}</Text>
              </View>
            )}
            {neuteredText !== '' && (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{neuteredText}</Text>
              </View>
            )}
          </View>
          {!!waitText && <Text style={styles.waitText}>{waitText}</Text>}
        </View>
        <Pressable
          onPress={isMyPet ? changePetPhoto : undefined}
          disabled={!isMyPet || uploadingPhoto}
          style={styles.avatarPress}
          accessibilityLabel={isMyPet ? 'Cambiar foto de perfil' : undefined}
        >
          <PetStatusAvatar
            uri={thumb(avatarUri, 200)}
            size={98}
            status={realPet?.careStatus}
          >
            {uploadingPhoto && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#fff" size="small" />
              </View>
            )}
            <View style={styles.speciesBadge}>
              <Text style={styles.speciesEmoji}>{emoji}</Text>
            </View>
            {isMyPet && !uploadingPhoto && (
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={12} color="#fff" />
              </View>
            )}
          </PetStatusAvatar>
        </Pressable>
      </View>
      {bio !== '' && <Text style={styles.bio}>{bio}</Text>}

      {/* Stats */}
      <View style={styles.statsCard}>
        <StatBlock value={String(posts.filter((p) => !deletedSet.has(p.id)).length)} label="Posts" />
        <View style={styles.statDivider} />
        <StatBlock value={formatCount(followerTotal)} label="Seguidores" />
        <View style={styles.statDivider} />
        <StatBlock value={demoPet ? formatCount(demoPet.following) : '—'} label="Siguiendo" />
      </View>

      <View style={styles.followRow}>
        <FollowButton
          following={following}
          onPress={() => {
            if (guest) { requireLogin(); return; }
            toggleFollowPet(petId);
          }}
          style={{ flex: 1 }}
        />
      </View>

      {isMyPet && (
        <View style={styles.adminRow}>
          <Pressable
            style={styles.adminBtn}
            onPress={() => navigation.navigate('AddPet', { petId: realPet?.id || petId, profileId: realPet?.profileId || undefined })}
          >
            <Text style={styles.adminText}>Editar</Text>
          </Pressable>
          {isProtectorPet && (
            <Pressable
              style={styles.adminBtn}
              onPress={() => {
                Alert.alert(
                  'Archivar',
                  `¿Archivar a ${name}? El perfil se conserva, pero deja de verse en la página de Bienestar Animal.`,
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                      text: 'Archivar',
                      onPress: async () => {
                        try {
                          await db.archivePet(realPet?.id || petId);
                          await refreshMyPets();
                          navigation.goBack();
                        } catch (e: any) {
                          Alert.alert('Error', e?.message || 'No se pudo archivar');
                        }
                      },
                    },
                  ]
                );
              }}
            >
              <Text style={styles.adminText}>Archivar</Text>
            </Pressable>
          )}
          <Pressable
            style={styles.adminBtn}
            onPress={() => {
              Alert.alert(
                'Eliminar mascota',
                `¿Eliminar a ${name}? Esta acción no se puede deshacer.`,
                [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await db.deletePet(realPet?.id || petId);
                        await refreshMyPets();
                        navigation.goBack();
                      } catch (e: any) {
                        Alert.alert('Error', e?.message || 'No se pudo eliminar');
                      }
                    },
                  },
                ]
              );
            }}
          >
            <Text style={[styles.adminText, { color: colors.heart }]}>Eliminar</Text>
          </Pressable>
        </View>
      )}

      {/* Owner / refugio */}
      {shelter ? (
        <Pressable
          style={styles.ownerCard}
          onPress={() => navigation.navigate('PublicProfile', { username: shelter.username, profileId: shelter.id })}
        >
          <Image
            source={{ uri: thumb(shelter.avatar || userFallbackAvatar(shelter.username), 100) }}
            style={styles.ownerAvatar}
            transition={200}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.ownerLabel}>Bienestar Animal de {name}</Text>
            <Text style={styles.ownerName}>
              {shelter.name} · {shelter.username}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ) : ownerId ? (
        <Pressable
          style={styles.ownerCard}
          onPress={() =>
            demoPet
              ? navigation.navigate('UserProfile', { userId: ownerId })
              : openHumanProfile(navigation, { username: ownerUsername, userId: ownerId })
          }
        >
          <Image source={{ uri: thumb(ownerAvatar, 100) }} style={styles.ownerAvatar} transition={200} />
          <View style={{ flex: 1 }}>
            <Text style={styles.ownerLabel}>Humano de {name}</Text>
            <Text style={styles.ownerName}>
              {ownerName} · {ownerUsername}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}

      {!isMyPet && (
        <Pressable
          style={[styles.locationBtn, locationDone && styles.locationBtnDone]}
          onPress={shareMyLocation}
          disabled={sharingLocation || locationDone || (!demoPet && !realPet?.id)}
        >
          {sharingLocation || (!demoPet && !realPet?.id && loading) ? (
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
              : !demoPet && !realPet?.id
              ? 'Cargando perfil...'
              : `Compartir mi ubicación con el dueño de ${name}`}
          </Text>
        </Pressable>
      )}

      <View style={styles.galleryTabs}>
        <Pressable
          style={[styles.galleryTab, galleryTab === 'posts' && styles.galleryTabOn]}
          onPress={() => setGalleryTab('posts')}
          accessibilityLabel="Publicaciones"
        >
          <Text style={[styles.galleryTabT, galleryTab === 'posts' && styles.galleryTabTOn]}>Publicaciones</Text>
        </Pressable>
        <Pressable
          style={[styles.galleryTab, galleryTab === 'reels' && styles.galleryTabOn]}
          onPress={() => setGalleryTab('reels')}
          accessibilityLabel="Reels"
        >
          <Text style={[styles.galleryTabT, galleryTab === 'reels' && styles.galleryTabTOn]}>Reels</Text>
        </Pressable>
      </View>
      {loading && galleryTab === 'posts' && <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />}
      {galleryTab === 'reels' && reelsGrid.loading && (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
      )}
      {!loading && galleryTab === 'posts' && posts.length === 0 && (
        <View style={styles.emptyGallery}>
          <Text style={styles.emptyText}>Aún no hay publicaciones de {name} 🐾</Text>
        </View>
      )}
      {galleryTab === 'reels' && !reelsGrid.loading && reelsGrid.items.length === 0 && (
        <View style={styles.emptyGallery}>
          <Text style={styles.emptyText}>Aún no hay Reels de {name} 🐾</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.safe}>
      <FlatList
        style={desktopWeb ? styles.desktopList : undefined}
        data={galleryTab === 'reels' ? reelsGrid.items : shownPosts}
        key={galleryTab === 'reels' ? 'pet-reels' : 'pet-grid'}
        numColumns={3}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        columnWrapperStyle={{ gap: 2, paddingHorizontal: spacing.lg }}
        contentContainerStyle={{ gap: 2, paddingBottom: guest ? 260 : spacing.xxl }}
        onEndReached={galleryTab === 'reels' ? reelsGrid.loadMore : undefined}
        onEndReachedThreshold={0.4}
        renderItem={({ item, index }) =>
          galleryTab === 'reels' ? (
            <ReelGridTile
              reel={item as ApiReel}
              size={tile}
              onPress={() =>
                reelScope &&
                openReelFromGrid(navigation, {
                  reel: item as ApiReel,
                  items: reelsGrid.items,
                  index,
                  scope: reelScope,
                })
              }
            />
          ) : (
            <Pressable onPress={() => openPost(item as Post)}>
              <PostGridMedia post={item as Post} size={tile} />
            </Pressable>
          )
        }
        showsVerticalScrollIndicator={false}
      />
      {inviteBar}
      <QrLostPetModal
        visible={qrLostOpen}
        petName={realPet?.name}
        sending={sharingLocation}
        onClose={() => setQrLostOpen(false)}
        onSendLocation={async () => {
          const ok = await shareMyLocation();
          if (ok) setQrLostOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
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
  identityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  identityCopy: { flex: 1, minWidth: 0, flexShrink: 1 },
  avatarPress: { flexShrink: 0 },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 49,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speciesBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  speciesEmoji: { fontSize: 13 },
  cameraBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  petName: { fontSize: 22, fontWeight: '900', color: colors.text },
  petHandle: { fontSize: 14, fontWeight: '800', color: colors.primary, marginTop: 2 },
  chipsRow: { flexDirection: 'row', gap: 6, marginTop: spacing.sm, flexWrap: 'wrap', justifyContent: 'flex-start' },
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
    textAlign: 'left',
    marginTop: spacing.sm,
    marginHorizontal: spacing.lg,
    lineHeight: 20,
  },
  waitText: {
    marginTop: spacing.sm,
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  adminRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  adminBtn: {
    flex: 1,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  adminText: { fontWeight: '700', fontSize: 12, color: colors.text },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    ...shadow.card,
  },
  statDivider: { width: 1, height: 28, backgroundColor: colors.border },
  followRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, marginTop: spacing.md },
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
  galleryTabs: {
    flexDirection: 'row',
    marginHorizontal: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  galleryTab: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  galleryTabOn: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  galleryTabT: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  galleryTabTOn: { color: colors.primary },
  emptyGallery: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
});
