// ============================================================
// Animaldex — Detalle de publicación (producto/servicio) + consultas
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { db, ApiListing, ApiComment, timeAgoMinutes } from '../lib/db';
import { useStore } from '../lib/store';
import { shareListing } from '../lib/share';
import {
  categoryLabel,
  categoryEmoji,
  formatPatitas,
  formatArs,
  deliveryLabel,
  modalityLabel,
} from '../lib/market';
import { thumb, large, userFallbackAvatar } from '../lib/images';
import { formatTime } from '../lib/data';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'ListingDetail'>;

export default function ListingDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { user } = useStore();
  const { width } = useWindowDimensions();
  const { listingId } = route.params;

  const [listing, setListing] = useState<ApiListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const load = useCallback(async () => {
    try {
      const [{ listing: l }, { comments: c }] = await Promise.all([
        db.listingDetail(listingId),
        db.listingComments(listingId),
      ]);
      setListing(l);
      setComments(c);
    } catch {
      setListing(null);
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    load();
    db.listingView(listingId).catch(() => {});
  }, [load, listingId]);

  const handleToggleFavorite = useCallback(() => {
    setListing((prev) =>
      prev ? { ...prev, isFavorited: !prev.isFavorited, favoriteCount: prev.favoriteCount + (prev.isFavorited ? -1 : 1) } : prev
    );
    if (listing) db.listingFavorite(listingId, !listing.isFavorited).catch(() => {});
  }, [listing, listingId]);

  const handleShare = useCallback(async () => {
    if (!listing || sharing) return;
    setSharing(true);
    try {
      await shareListing(listing);
    } finally {
      setSharing(false);
    }
  }, [listing, sharing]);

  const handleBuy = useCallback(() => {
    const msg = '🐾 La compra con Patitas estará disponible muy pronto. ¡Gracias por tu interés!';
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(msg);
    else Alert.alert('Próximamente', msg);
  }, []);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !listing || sending) return;
    setSending(true);
    setDraft('');
    try {
      await db.listingComment(listingId, text);
      const { comments: c } = await db.listingComments(listingId);
      setComments(c);
      setListing((prev) => (prev ? { ...prev, commentCount: prev.commentCount + 1 } : prev));
    } catch {}
    setSending(false);
  }, [draft, listing, listingId, sending]);

  const displayComments = useMemo(
    () =>
      comments.map((c) => ({
        id: c.id,
        name: c.username,
        avatarUri: c.avatarUrl ?? userFallbackAvatar(c.username),
        text: c.text,
        minutesAgo: timeAgoMinutes(c.createdAt),
        mine: user?.id === c.userId,
      })),
    [comments, user]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={styles.notFoundEmoji}>🐾</Text>
          <Text style={styles.notFoundTitle}>Publicación no encontrada</Text>
          <Text style={styles.notFoundText}>Este enlace ya no está disponible.</Text>
          <Pressable
            style={styles.notFoundBtn}
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Tabs'))}
          >
            <Text style={styles.notFoundBtnText}>Volver</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const avatar = listing.userAvatar ?? userFallbackAvatar(listing.username ?? 'usuario');

  const header = (
    <View>
      {/* Galería */}
      <View>
        <FlatList
          data={listing.images}
          keyExtractor={(uri, i) => `${uri}-${i}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setGalleryIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <Image
              source={{ uri: large(item) }}
              style={{ width, height: width }}
              contentFit="cover"
              transition={300}
              placeholder={{ blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj' }}
            />
          )}
        />
        {listing.images.length > 1 && (
          <View style={styles.dotsRow}>
            {listing.images.map((_, i) => (
              <View key={i} style={[styles.dot, i === galleryIndex && styles.dotActive]} />
            ))}
          </View>
        )}
        <Pressable
          style={styles.backBtn}
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Tabs'))}
        >
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.contentBlock}>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryBadgeText}>
            {categoryEmoji(listing.category)} {categoryLabel(listing.category)} · {listing.kind === 'service' ? 'Servicio' : 'Producto'}
          </Text>
        </View>

        <Text style={styles.titleText}>{listing.title}</Text>

        <View style={styles.ratingRow}>
          {listing.sellerRating != null ? (
            <View style={styles.ratingChip}>
              <Ionicons name="star" size={13} color={colors.gold} />
              <Text style={styles.ratingChipText}>
                {listing.sellerRating.toFixed(1)} ({listing.sellerReviewCount})
              </Text>
            </View>
          ) : null}
          <View style={styles.locChip}>
            <Ionicons name="location-outline" size={13} color={colors.textMuted} />
            <Text style={styles.locChipText}>{listing.locality}</Text>
          </View>
        </View>

        <View style={styles.priceBlock}>
          <Text style={styles.pricePatitas}>{formatPatitas(listing.pricePatitas)}</Text>
          {listing.priceArs != null && <Text style={styles.priceArs}>{formatArs(listing.priceArs)}</Text>}
        </View>

        {listing.kind === 'product' && listing.stock != null && (
          <View style={styles.stockRow}>
            <Ionicons name={listing.stock > 0 ? 'checkmark-circle' : 'close-circle'} size={15} color={listing.stock > 0 ? colors.secondary : colors.heart} />
            <Text style={styles.stockText}>{listing.stock > 0 ? `${listing.stock} disponibles` : 'Sin stock'}</Text>
          </View>
        )}

        {listing.kind === 'product' && listing.deliveryMethod && (
          <View style={styles.infoRow}>
            <Ionicons name="bicycle-outline" size={15} color={colors.textMuted} />
            <Text style={styles.infoText}>{deliveryLabel(listing.deliveryMethod)}</Text>
          </View>
        )}

        {listing.kind === 'service' && listing.modality && (
          <View style={styles.infoRow}>
            <Ionicons name="storefront-outline" size={15} color={colors.textMuted} />
            <Text style={styles.infoText}>{modalityLabel(listing.modality)}</Text>
          </View>
        )}

        {listing.kind === 'service' && listing.availability && (
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={15} color={colors.textMuted} />
            <Text style={styles.infoText}>{listing.availability}</Text>
          </View>
        )}

        <Text style={styles.description}>{listing.description}</Text>

        {/* Vendedor */}
        <Pressable
          style={styles.sellerCard}
          onPress={() => listing && navigation.navigate('SellerShop', { userId: listing.userId })}
        >
          <Image source={{ uri: thumb(avatar, 100) }} style={styles.sellerAvatar} />
          <View style={{ flex: 1 }}>
            <Text style={styles.sellerName}>{listing.username ?? 'usuario'}</Text>
            <Text style={styles.sellerSub}>Ver mini-tienda</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        {/* Acciones */}
        <View style={styles.actionsRow}>
          <Pressable onPress={handleToggleFavorite} style={styles.favActionBtn}>
            <Ionicons
              name={listing.isFavorited ? 'heart' : 'heart-outline'}
              size={22}
              color={listing.isFavorited ? colors.heart : colors.text}
            />
          </Pressable>
          <Pressable style={styles.buyBtn} onPress={handleBuy}>
            <Ionicons name="bag-check-outline" size={17} color="#fff" />
            <Text style={styles.buyBtnText}>{listing.kind === 'service' ? 'Solicitar servicio' : 'Comprar'}</Text>
          </Pressable>
          <Pressable style={styles.shareBtn} onPress={handleShare} disabled={sharing}>
            <Ionicons name="paper-plane-outline" size={18} color={colors.text} />
          </Pressable>
        </View>

        <Text style={styles.commentsTitle}>
          Consultas {displayComments.length > 0 ? `(${displayComments.length})` : ''}
        </Text>
        {displayComments.length === 0 && (
          <View style={styles.emptyComments}>
            <Text style={styles.emptyEmoji}>💬</Text>
            <Text style={styles.emptyText}>Sé el primero en consultar</Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <FlatList
          data={displayComments}
          keyExtractor={(c) => c.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.commentRow}>
              <Image source={{ uri: thumb(item.avatarUri, 80) }} style={styles.commentAvatar} />
              <View style={styles.commentBubble}>
                <View style={styles.commentTop}>
                  <Text style={styles.commentUser}>
                    {item.name}
                    {item.mine ? ' (tú)' : ''}
                  </Text>
                  <Text style={styles.commentTime}>{formatTime(item.minutesAgo)}</Text>
                </View>
                <Text style={styles.commentText}>{item.text}</Text>
              </View>
            </View>
          )}
        />

        <View style={styles.inputBar}>
          <Image
            source={{ uri: thumb(user?.avatarUrl ?? userFallbackAvatar(user?.username ?? 'yo'), 80) }}
            style={styles.inputAvatar}
          />
          <TextInput
            style={styles.input}
            placeholder="Escribe tu consulta..."
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            returnKeyType="send"
            onSubmitEditing={send}
          />
          <Pressable
            onPress={send}
            style={[styles.sendBtn, (!draft.trim() || sending) && { opacity: 0.4 }]}
            disabled={!draft.trim() || sending}
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="arrow-up" size={18} color="#fff" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  notFoundEmoji: { fontSize: 48 },
  notFoundTitle: { fontWeight: '800', fontSize: 18, color: colors.text },
  notFoundText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  notFoundBtn: { marginTop: 12, backgroundColor: colors.primary, paddingHorizontal: 26, paddingVertical: 11, borderRadius: radius.full },
  notFoundBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  dotsRow: { position: 'absolute', bottom: 12, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: '#fff', width: 8, height: 8, borderRadius: 4 },
  backBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentBlock: { padding: spacing.lg, gap: spacing.sm },
  categoryBadge: { alignSelf: 'flex-start', backgroundColor: colors.primarysoft, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5 },
  categoryBadgeText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  titleText: { fontSize: 20, fontWeight: '900', color: colors.text, marginTop: 4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  ratingChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingChipText: { fontSize: 13, fontWeight: '700', color: colors.text },
  locChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locChipText: { fontSize: 13, color: colors.textMuted },
  priceBlock: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  pricePatitas: { fontSize: 20, fontWeight: '900', color: colors.primary },
  priceArs: { fontSize: 14, color: colors.textMuted, textDecorationLine: 'line-through' },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  stockText: { fontSize: 13, fontWeight: '600', color: colors.text },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  infoText: { fontSize: 13, color: colors.text },
  description: { fontSize: 14, color: colors.text, lineHeight: 20, marginTop: spacing.sm },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    ...shadow.card,
  },
  sellerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.border },
  sellerName: { fontSize: 14, fontWeight: '700', color: colors.text },
  sellerSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  favActionBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  buyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 13,
    ...shadow.card,
  },
  buyBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  shareBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  commentsTitle: { fontWeight: '800', fontSize: 16, color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm },
  emptyComments: { alignItems: 'center', paddingVertical: spacing.lg, gap: 4 },
  emptyEmoji: { fontSize: 28 },
  emptyText: { color: colors.textMuted, fontSize: 13 },
  commentRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  commentAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.border },
  commentBubble: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, ...shadow.card },
  commentTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  commentUser: { fontWeight: '700', fontSize: 13, color: colors.text },
  commentTime: { fontSize: 11, color: colors.textMuted },
  commentText: { fontSize: 13, color: colors.text, lineHeight: 18 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  inputAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.border },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
