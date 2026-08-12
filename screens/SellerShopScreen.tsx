// ============================================================
// Animaldex — Mini-tienda del vendedor
// ============================================================
// Cada usuario que publica en Mercado obtiene automáticamente este
// perfil comercial: no existe una tabla de "tiendas" separada, se
// construye a partir de su perfil de usuario + sus publicaciones +
// las reseñas que recibió como vendedor.
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { db, ApiListing, ApiSeller, ApiSellerStats, ApiSellerReview, timeAgoMinutes } from '../lib/db';
import { useStore } from '../lib/store';
import { ListingCard } from '../components/ListingCard';
import { thumb, userFallbackAvatar } from '../lib/images';
import { formatTime } from '../lib/data';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'SellerShop'>;

type ShopTab = 'products' | 'services' | 'reviews';

export default function SellerShopScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { userId: targetUserId } = route.params;
  const { user, followedUsers, toggleFollowUser } = useStore();

  const [seller, setSeller] = useState<ApiSeller | null>(null);
  const [stats, setStats] = useState<ApiSellerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ShopTab>('products');

  const [products, setProducts] = useState<ApiListing[]>([]);
  const [services, setServices] = useState<ApiListing[]>([]);
  const [reviews, setReviews] = useState<ApiSellerReview[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  const [myRating, setMyRating] = useState(0);
  const [myReviewText, setMyReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const isMe = user?.id === targetUserId;
  const following = followedUsers.includes(targetUserId);

  const loadProfile = useCallback(async () => {
    try {
      const res = await db.sellerProfile(targetUserId);
      setSeller(res.seller);
      setStats(res.stats);
    } catch {
      setSeller(null);
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const loadTab = useCallback(async () => {
    setTabLoading(true);
    try {
      if (tab === 'products') {
        const { listings } = await db.sellerListings(targetUserId, 'product');
        setProducts(listings);
      } else if (tab === 'services') {
        const { listings } = await db.sellerListings(targetUserId, 'service');
        setServices(listings);
      } else {
        const { reviews: r } = await db.sellerReviews(targetUserId);
        setReviews(r);
      }
    } catch {}
    setTabLoading(false);
  }, [tab, targetUserId]);

  useEffect(() => {
    loadTab();
  }, [loadTab]);

  const openListing = useCallback(
    (listing: ApiListing) => navigation.navigate('ListingDetail', { listingId: listing.id }),
    [navigation]
  );

  const toggleFavorite = useCallback(
    (listingId: string) => {
      const setter = tab === 'products' ? setProducts : setServices;
      setter((prev) =>
        prev.map((l) => (l.id === listingId ? { ...l, isFavorited: !l.isFavorited, favoriteCount: l.favoriteCount + (l.isFavorited ? -1 : 1) } : l))
      );
      const list = tab === 'products' ? products : services;
      const target = list.find((l) => l.id === listingId);
      db.listingFavorite(listingId, !(target?.isFavorited ?? false)).catch(() => {});
    },
    [tab, products, services]
  );

  const handleContact = useCallback(() => {
    const msg = 'Muy pronto vas a poder enviar mensajes directos a los vendedores. ¡Gracias por tu paciencia!';
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(msg);
    else Alert.alert('Próximamente', msg);
  }, []);

  const submitReview = useCallback(async () => {
    if (myRating < 1) {
      Alert.alert('Elige una calificación', 'Toca las estrellas para calificar.');
      return;
    }
    setSubmittingReview(true);
    try {
      await db.sellerReview(targetUserId, myRating, myReviewText.trim() || undefined);
      setMyRating(0);
      setMyReviewText('');
      await Promise.all([loadProfile(), loadTab()]);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo enviar la reseña');
    } finally {
      setSubmittingReview(false);
    }
  }, [myRating, myReviewText, targetUserId, loadProfile, loadTab]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!seller) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={styles.notFoundEmoji}>🏪</Text>
          <Text style={styles.notFoundTitle}>Tienda no encontrada</Text>
        </View>
      </SafeAreaView>
    );
  }

  const avatar = seller.avatarUrl ?? userFallbackAvatar(seller.username);

  const header = (
    <View>
      <View style={styles.profileHeader}>
        <Image source={{ uri: thumb(avatar, 200) }} style={styles.avatar} />
        <Text style={styles.shopName}>🏪 {seller.name}</Text>
        <Text style={styles.username}>@{seller.username}</Text>

        <View style={styles.statsRow}>
          {stats?.rating != null ? (
            <View style={styles.statChip}>
              <Ionicons name="star" size={14} color={colors.gold} />
              <Text style={styles.statChipText}>
                {stats.rating.toFixed(1)} ({stats.reviewCount})
              </Text>
            </View>
          ) : null}
          {seller.location ? (
            <View style={styles.statChip}>
              <Ionicons name="location-outline" size={14} color={colors.textMuted} />
              <Text style={styles.statChipText}>{seller.location}</Text>
            </View>
          ) : null}
          <View style={styles.statChip}>
            <Ionicons name="people-outline" size={14} color={colors.textMuted} />
            <Text style={styles.statChipText}>{stats?.followers ?? 0} seguidores</Text>
          </View>
        </View>

        {seller.bio ? <Text style={styles.bio}>{seller.bio}</Text> : null}

        {!isMe && (
          <View style={styles.actionsRow}>
            <Pressable
              style={[styles.followBtn, following && styles.followBtnActive]}
              onPress={() => toggleFollowUser(targetUserId)}
            >
              <Text style={[styles.followBtnText, following && styles.followBtnTextActive]}>
                {following ? 'Siguiendo' : 'Seguir'}
              </Text>
            </Pressable>
            <Pressable style={styles.contactBtn} onPress={handleContact}>
              <Ionicons name="chatbubble-outline" size={16} color={colors.text} />
              <Text style={styles.contactBtnText}>Contactar</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.tabsRow}>
        <Pressable style={[styles.tabBtn, tab === 'products' && styles.tabBtnActive]} onPress={() => setTab('products')}>
          <Text style={[styles.tabText, tab === 'products' && styles.tabTextActive]}>
            Productos {stats ? `(${stats.products})` : ''}
          </Text>
        </Pressable>
        <Pressable style={[styles.tabBtn, tab === 'services' && styles.tabBtnActive]} onPress={() => setTab('services')}>
          <Text style={[styles.tabText, tab === 'services' && styles.tabTextActive]}>
            Servicios {stats ? `(${stats.services})` : ''}
          </Text>
        </Pressable>
        <Pressable style={[styles.tabBtn, tab === 'reviews' && styles.tabBtnActive]} onPress={() => setTab('reviews')}>
          <Text style={[styles.tabText, tab === 'reviews' && styles.tabTextActive]}>Reseñas</Text>
        </Pressable>
      </View>

      {tab === 'reviews' && !isMe && (
        <View style={styles.reviewForm}>
          <Text style={styles.reviewFormTitle}>Deja tu calificación</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setMyRating(n)} hitSlop={6}>
                <Ionicons name={n <= myRating ? 'star' : 'star-outline'} size={26} color={colors.gold} />
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.reviewInput}
            placeholder="Comenta tu experiencia (opcional)"
            placeholderTextColor={colors.textMuted}
            value={myReviewText}
            onChangeText={setMyReviewText}
            multiline
            maxLength={500}
          />
          <Pressable style={styles.reviewSubmitBtn} onPress={submitReview} disabled={submittingReview}>
            {submittingReview ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.reviewSubmitText}>Enviar reseña</Text>}
          </Pressable>
        </View>
      )}

      {tabLoading && <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />}
    </View>
  );

  if (tab === 'reviews') {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <FlatList
          // Key distinto al de la grilla de productos/servicios: evita que
          // React reutilice la misma instancia al cambiar numColumns entre
          // pestañas (reseñas = 1 columna, productos/servicios = 2), que
          // congela la app (mismo bug que en MarketScreen).
          key="shop-reviews"
          data={reviews}
          keyExtractor={(r) => r.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          ListEmptyComponent={
            !tabLoading ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>⭐</Text>
                <Text style={styles.emptyText}>Sin reseñas todavía</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const revAvatar = item.avatarUrl ?? userFallbackAvatar(item.username);
            return (
              <View style={styles.reviewRow}>
                <Image source={{ uri: thumb(revAvatar, 80) }} style={styles.reviewAvatar} />
                <View style={{ flex: 1 }}>
                  <View style={styles.reviewTop}>
                    <Text style={styles.reviewUser}>{item.userName}</Text>
                    <Text style={styles.reviewTime}>{formatTime(timeAgoMinutes(item.createdAt))}</Text>
                  </View>
                  <View style={styles.reviewStars}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Ionicons key={n} name={n <= item.rating ? 'star' : 'star-outline'} size={13} color={colors.gold} />
                    ))}
                  </View>
                  {item.text ? <Text style={styles.reviewText}>{item.text}</Text> : null}
                </View>
              </View>
            );
          }}
        />
      </SafeAreaView>
    );
  }

  const listData = tab === 'products' ? products : services;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        key="shop-grid"
        data={listData}
        keyExtractor={(l) => l.id}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
        contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          !tabLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🐾</Text>
              <Text style={styles.emptyText}>Sin publicaciones en esta categoría</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <ListingCard listing={item} onPress={openListing} onToggleFavorite={toggleFavorite} style={{ flex: 1 }} />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  notFoundEmoji: { fontSize: 48 },
  notFoundTitle: { fontWeight: '800', fontSize: 18, color: colors.text },
  profileHeader: { alignItems: 'center', padding: spacing.xl, gap: 4 },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.border, marginBottom: spacing.sm },
  shopName: { fontSize: 19, fontWeight: '900', color: colors.text },
  username: { fontSize: 13, color: colors.textMuted },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statChipText: { fontSize: 12.5, fontWeight: '600', color: colors.text },
  bio: { fontSize: 13, color: colors.text, textAlign: 'center', marginTop: spacing.sm, lineHeight: 18, paddingHorizontal: spacing.lg },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  followBtn: { backgroundColor: colors.primary, borderRadius: radius.full, paddingHorizontal: 26, paddingVertical: 11 },
  followBtnActive: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  followBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  followBtnTextActive: { color: colors.text },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: colors.border,
  },
  contactBtnText: { fontWeight: '700', fontSize: 14, color: colors.text },
  tabsRow: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: colors.border },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: colors.primary },
  tabText: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  tabTextActive: { color: colors.primary },
  reviewForm: { padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.card, margin: spacing.lg, borderRadius: radius.md, ...shadow.card },
  reviewFormTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  starsRow: { flexDirection: 'row', gap: spacing.sm },
  reviewInput: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: 13,
    color: colors.text,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  reviewSubmitBtn: { backgroundColor: colors.primary, borderRadius: radius.full, alignItems: 'center', paddingVertical: 11 },
  reviewSubmitText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  reviewRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  reviewAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.border },
  reviewTop: { flexDirection: 'row', justifyContent: 'space-between' },
  reviewUser: { fontSize: 13, fontWeight: '700', color: colors.text },
  reviewTime: { fontSize: 11, color: colors.textMuted },
  reviewStars: { flexDirection: 'row', gap: 2, marginTop: 2 },
  reviewText: { fontSize: 13, color: colors.text, marginTop: 4, lineHeight: 18 },
  emptyState: { alignItems: 'center', paddingTop: 40, paddingHorizontal: spacing.xl, gap: 4 },
  emptyEmoji: { fontSize: 36 },
  emptyText: { fontSize: 13, color: colors.textMuted },
});
