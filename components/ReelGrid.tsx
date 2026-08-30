import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { db, type ApiReel } from '../lib/db';
import { getMuxThumbnail } from '../lib/reels';
import {
  REEL_GRID_PAGE,
  appendUniqueReels,
  ownerGridLabel,
  reelGridCursor,
  reelViewerParamsFromGrid,
  type ReelGridScope,
} from '../lib/reelGrid';
import { colors, radius } from '../lib/theme';

export function ReelGridTile({
  reel,
  size,
  isOwner,
  onPress,
}: {
  reel: ApiReel;
  size: number;
  isOwner?: boolean;
  onPress: () => void;
}) {
  const thumbUri = getMuxThumbnail(reel.playbackId, { width: 240, height: 426 });
  const label = isOwner ? ownerGridLabel(reel.status) : null;
  const tileH = Math.round((size * 16) / 9);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label ? `${label} Reel` : 'Abrir Reel'}
      style={[styles.tile, { width: size, height: tileH }]}
    >
      {thumbUri ? (
        <Image
          source={{ uri: thumbUri }}
          style={styles.img}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={reel.id}
          transition={180}
        />
      ) : (
        <View style={[styles.img, styles.ph]} />
      )}
      {label ? (
        <View style={styles.overlay}>
          <Text style={styles.overlayT}>{label}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

async function fetchScope(scope: ReelGridScope, before?: number) {
  if (scope.type === 'profile') return db.profileReels(scope.id, before, REEL_GRID_PAGE);
  if (scope.type === 'pet') return db.petReels(scope.id, before, REEL_GRID_PAGE);
  if (scope.type === 'user') return db.userReels(scope.id, before, REEL_GRID_PAGE);
  return db.reelsFeed(before, REEL_GRID_PAGE);
}

export function useReelGrid(scope: ReelGridScope | null, enabled: boolean) {
  const [items, setItems] = useState<ApiReel[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const loadingRef = useRef(false);
  const itemsRef = useRef<ApiReel[]>([]);
  itemsRef.current = items;

  const load = useCallback(
    async (reset: boolean) => {
      if (!scope || scope.type === 'feed' || !enabled) return;
      if (loadingRef.current) return;
      loadingRef.current = true;
      if (reset) setLoading(true);
      try {
        const before = reset ? undefined : reelGridCursor(itemsRef.current);
        const page = await fetchScope(scope, before);
        setHasMore(page.hasMore);
        setError(false);
        setItems((prev) => (reset ? page.reels : appendUniqueReels(prev, page.reels)));
      } catch {
        setError(true);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [scope, enabled]
  );

  useEffect(() => {
    if (!enabled || !scope || scope.type === 'feed') {
      setItems([]);
      return;
    }
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, scope && scope.type !== 'feed' ? `${scope.type}:${scope.id}` : '']);

  const loadMore = useCallback(() => {
    if (hasMore && !loading) load(false);
  }, [hasMore, loading, load]);

  return { items, hasMore, loading, error, reload: () => load(true), loadMore };
}

export function openReelFromGrid(
  navigation: { navigate: (name: string, params: object) => void },
  input: {
    reel: ApiReel;
    items: ApiReel[];
    index: number;
    scope: Extract<ReelGridScope, { type: 'profile' | 'pet' | 'user' }>;
  }
) {
  navigation.navigate('ReelViewer', reelViewerParamsFromGrid({
    reelId: input.reel.id,
    items: input.items,
    index: input.index,
    scope: input.scope,
  }));
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  img: { width: '100%', height: '100%' },
  ph: { backgroundColor: colors.border },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayT: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
