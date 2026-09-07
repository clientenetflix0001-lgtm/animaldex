import React, { memo, useCallback } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { ApiReel } from '../lib/db';
import { ReelGridTile } from './ReelGrid';
import { spacing } from '../lib/theme';

function FeedReelsRowInner({ reels }: { reels: ApiReel[] }) {
  const navigation = useNavigation<any>();
  const open = useCallback(
    (reel: ApiReel, index: number) => {
      navigation.navigate('ReelViewer', {
        reelId: reel.id,
        scope: 'feed',
        initialReels: reels,
        initialIndex: index,
      });
    },
    [navigation, reels]
  );
  const renderItem = useCallback(
    ({ item, index }: { item: ApiReel; index: number }) => (
      <ReelGridTile reel={item} size={132} onPress={() => open(item, index)} />
    ),
    [open]
  );
  return (
    <View style={styles.wrap}>
      <FlatList
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        data={reels}
        keyExtractor={(item) => `reel:${item.id}`}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

export const FeedReelsRow = memo(FeedReelsRowInner);

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.sm },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md },
});
