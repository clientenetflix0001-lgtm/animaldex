import React, { memo, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ApiListing } from '../lib/db';
import { formatPatitas, formatArs } from '../lib/market';
import { formatDistance, haversineKm } from '../lib/geo';
import { thumb, userFallbackAvatar } from '../lib/images';
import { colors, radius, shadow, spacing } from '../lib/theme';

interface Props {
  listing: ApiListing;
  onPress: (listing: ApiListing) => void;
  onToggleFavorite: (listingId: string) => void;
  viewerLat?: number | null;
  viewerLon?: number | null;
  style?: ViewStyle;
}

function ListingCardInner({ listing, onPress, onToggleFavorite, viewerLat, viewerLon, style }: Props) {
  const image = listing.images[0];
  const avatar = listing.userAvatar ?? userFallbackAvatar(listing.username ?? 'usuario');

  const distanceLabel = useMemo(() => {
    if (viewerLat == null || viewerLon == null || listing.lat == null || listing.lon == null) {
      return listing.locality;
    }
    const km = haversineKm(viewerLat, viewerLon, listing.lat, listing.lon);
    return `${formatDistance(km)} · ${listing.locality}`;
  }, [viewerLat, viewerLon, listing.lat, listing.lon, listing.locality]);

  const handleFavorite = useCallback(() => onToggleFavorite(listing.id), [onToggleFavorite, listing.id]);

  return (
    <Pressable style={[styles.card, style]} onPress={() => onPress(listing)}>
      <View style={styles.imageWrap}>
        {image ? (
          <Image source={{ uri: thumb(image, 400) }} style={styles.image} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.image, styles.imageEmpty]}>
            <Ionicons name={listing.kind === 'service' ? 'construct-outline' : 'bag-handle-outline'} size={26} color={colors.textMuted} />
          </View>
        )}
        <Pressable style={styles.favBtn} onPress={handleFavorite} hitSlop={8}>
          <Ionicons
            name={listing.isFavorited ? 'heart' : 'heart-outline'}
            size={17}
            color={listing.isFavorited ? colors.heart : '#fff'}
          />
        </Pressable>
        {listing.kind === 'service' && listing.availability ? (
          <View style={styles.availBadge}>
            <Text style={styles.availBadgeText} numberOfLines={1}>
              {listing.availability}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {listing.title}
        </Text>

        <View style={styles.priceRow}>
          <Text style={styles.pricePatitas} numberOfLines={1}>
            {formatPatitas(listing.pricePatitas)}
          </Text>
        </View>
        {listing.priceArs != null && (
          <Text style={styles.priceArs}>{formatArs(listing.priceArs)}</Text>
        )}

        <View style={styles.metaRow}>
          {listing.sellerRating != null ? (
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={12} color={colors.gold} />
              <Text style={styles.ratingText}>{listing.sellerRating.toFixed(1)}</Text>
            </View>
          ) : null}
          <View style={styles.locRow}>
            <Ionicons name="location-outline" size={11} color={colors.textMuted} />
            <Text style={styles.locText} numberOfLines={1}>
              {distanceLabel}
            </Text>
          </View>
        </View>

        <View style={styles.sellerRow}>
          <Image source={{ uri: thumb(avatar, 60) }} style={styles.sellerAvatar} />
          <Text style={styles.sellerName} numberOfLines={1}>
            @{listing.username ?? 'usuario'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export const ListingCard = memo(ListingCardInner);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadow.card,
  },
  imageWrap: { position: 'relative' },
  image: { width: '100%', aspectRatio: 1, backgroundColor: colors.border },
  imageEmpty: { alignItems: 'center', justifyContent: 'center' },
  favBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  availBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    right: 44,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  availBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  body: { padding: spacing.sm, gap: 3 },
  title: { fontSize: 13, fontWeight: '700', color: colors.text, lineHeight: 17, minHeight: 34 },
  priceRow: { marginTop: 2 },
  pricePatitas: { fontSize: 13, fontWeight: '800', color: colors.primary },
  priceArs: { fontSize: 11, color: colors.textMuted, textDecorationLine: 'line-through' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2, flexWrap: 'wrap' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingText: { fontSize: 11, fontWeight: '700', color: colors.text },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 },
  locText: { fontSize: 11, color: colors.textMuted, flexShrink: 1 },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  sellerAvatar: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.border },
  sellerName: { fontSize: 11, color: colors.textMuted, flexShrink: 1 },
});
