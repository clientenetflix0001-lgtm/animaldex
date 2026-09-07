import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { db, type ApiStoryRailItem } from '../lib/db';
import { useStore } from '../lib/store';
import { useProfiles } from '../features/profiles';
import { spacing } from '../lib/theme';
import { storyRingVariant } from '../lib/stories';
import { useStoriesRevision } from '../lib/useStoriesRevision';
import { HomeHorizontalList } from './HomeHorizontalList';
import { HomeModuleTitle } from './HomeModuleTitle';
import StoryCircle from './StoryCircle';

export default function StoryRail({
  seedItems,
  title,
  disableNetworkRefresh,
  onItemsChange,
}: {
  seedItems?: ApiStoryRailItem[];
  title?: string;
  disableNetworkRefresh?: boolean;
  onItemsChange?: (items: ApiStoryRailItem[]) => void;
}) {
  const navigation = useNavigation<any>();
  const { user } = useStore();
  const { activeProfileId } = useProfiles();
  const storiesRevision = useStoriesRevision();
  const [items, setItems] = useState<ApiStoryRailItem[]>(seedItems || []);
  const [loading, setLoading] = useState(!(seedItems && seedItems.length));

  const load = useCallback(async () => {
    if (!user) {
      setItems([]);
      return;
    }
    try {
      const res = await db.storyRail({ authorProfileId: activeProfileId });
      const next = res.items || [];
      setItems(next);
      onItemsChange?.(next);
    } catch {
      setItems([]);
      onItemsChange?.([]);
    } finally {
      setLoading(false);
    }
  }, [user, activeProfileId, onItemsChange]);

  useEffect(() => {
    if (seedItems && seedItems.length) setItems(seedItems);
  }, [seedItems]);

  const skipFirstRevisionLoad = useRef(true);
  const skipFirstFocusLoad = useRef(true);

  useEffect(() => {
    if (disableNetworkRefresh) {
      setLoading(false);
      return;
    }
    if (skipFirstRevisionLoad.current) {
      skipFirstRevisionLoad.current = false;
      setLoading(false);
      return;
    }
    if (!(seedItems && seedItems.length)) setLoading(true);
    load();
  }, [load, storiesRevision]);

  useFocusEffect(
    useCallback(() => {
      if (disableNetworkRefresh) return;
      if (skipFirstFocusLoad.current) {
        skipFirstFocusLoad.current = false;
        return;
      }
      load();
    }, [disableNetworkRefresh, load])
  );

  const openCreate = useCallback(() => {
    navigation.navigate('CreateStory');
  }, [navigation]);

  const openItem = useCallback(
    (item: ApiStoryRailItem) => {
      if (item.kind === 'more') {
        navigation.navigate('StoryMoreBreeds');
        return;
      }
      if (item.kind === 'self') {
        if (!item.hasStory) {
          openCreate();
          return;
        }
        navigation.navigate('StoryViewer', { source: 'self', authorProfileId: activeProfileId });
        return;
      }
      if (item.kind === 'breed') {
        navigation.navigate('StoryViewer', {
          source: 'breed',
          breedSpecies: item.breedSpecies,
          breedKey: item.breedKey,
        });
        return;
      }
      navigation.navigate('StoryViewer', {
        source: 'identity',
        authorUserId: item.authorUserId,
        authorProfileId: item.authorProfileId,
        authorProfileType: item.authorProfileType,
        authorPetId: item.authorPetId,
      });
    },
    [navigation, activeProfileId, openCreate]
  );

  return (
    <View style={styles.wrap}>
      {title ? <HomeModuleTitle>{title}</HomeModuleTitle> : null}
      {loading && items.length === 0 ? <ActivityIndicator color="#FF6B4A" style={{ marginVertical: 12 }} /> : null}
      <HomeHorizontalList
        data={items}
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <StoryCircle
            label={item.label}
            thumbUrl={item.thumbUrl}
            emoji={item.emoji}
            ring={item.kind === 'more' ? 'none' : storyRingVariant(!!item.hasStory, !!item.hasUnseen)}
            isSelf={item.kind === 'self'}
            onPress={() => openItem(item)}
            onAdd={item.kind === 'self' ? openCreate : undefined}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.md },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md },
});
