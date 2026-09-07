import React, { memo, useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { db } from '../lib/db';
import { thumb, userFallbackAvatar } from '../lib/images';
import type { HomePageRecommendation } from '../lib/feedComposition';
import { useHomeModuleGestureLock } from '../lib/homeModuleGesturesContext';
import { FollowButton } from './FollowButton';
import { HOME_MODULE_TITLES } from '../lib/homeFeedModules';
import { HomeHorizontalList, HomeModulePressable } from './HomeHorizontalList';
import { HomeModuleTitle } from './HomeModuleTitle';
import { colors, radius, spacing } from '../lib/theme';

function PageChip({
  page,
  following,
  onFollow,
  onOpen,
}: {
  page: HomePageRecommendation;
  following: boolean;
  onFollow: () => void;
  onOpen: () => void;
}) {
  return (
    <View style={styles.card}>
      <HomeModulePressable onPress={onOpen} style={styles.info} accessibilityRole="button">
        <Image
          source={{ uri: thumb(page.avatarUrl || userFallbackAvatar(page.username || page.id), 120) }}
          style={styles.avatar}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={page.id}
        />
        <Text style={styles.name} numberOfLines={1}>
          {page.name}
        </Text>
        <Text style={styles.type} numberOfLines={1}>
          {page.typeLabel}
        </Text>
      </HomeModulePressable>
      <FollowButton following={following} onPress={onFollow} compact />
    </View>
  );
}

function FeedPagesRowInner({ pages }: { pages: HomePageRecommendation[] }) {
  const navigation = useNavigation<any>();
  const { wasRecentHorizontalSwipe } = useHomeModuleGestureLock();
  const [followed, setFollowed] = useState<string[]>([]);
  const visible = pages.filter((page) => !followed.includes(page.id));
  const toggle = useCallback((id: string) => {
    setFollowed((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      db.follow('profile', id, next.includes(id)).catch(() => {});
      return next;
    });
  }, []);
  const renderItem = useCallback(
    ({ item }: { item: HomePageRecommendation }) => (
      <PageChip
        page={item}
        following={followed.includes(item.id)}
        onFollow={() => {
          if (wasRecentHorizontalSwipe()) return;
          toggle(item.id);
        }}
        onOpen={() => navigation.navigate('PublicProfile', { profileId: item.id, username: item.username })}
      />
    ),
    [followed, navigation, toggle, wasRecentHorizontalSwipe]
  );
  if (visible.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <HomeModuleTitle>{HOME_MODULE_TITLES.pages}</HomeModuleTitle>
      <HomeHorizontalList
        data={visible}
        keyExtractor={(item) => `page:${item.id}`}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

export const FeedPagesRow = memo(FeedPagesRowInner);

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.sm },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md },
  card: {
    width: 148,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    alignItems: 'center',
    gap: spacing.sm,
  },
  info: { alignItems: 'center', width: '100%' },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.border },
  name: { fontSize: 13, fontWeight: '800', color: colors.text, textAlign: 'center' },
  type: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textAlign: 'center' },
});
