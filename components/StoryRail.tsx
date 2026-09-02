import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, type ApiStoryRailItem } from '../lib/db';
import { useStore } from '../lib/store';
import { useProfiles } from '../features/profiles';
import { spacing } from '../lib/theme';
import { storyRingVariant } from '../lib/stories';
import StoryCircle from './StoryCircle';

export default function StoryRail() {
  const navigation = useNavigation<any>();
  const { user } = useStore();
  const { activeProfileId } = useProfiles();
  const [items, setItems] = useState<ApiStoryRailItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const res = await db.storyRail({ authorProfileId: activeProfileId });
      setItems(res.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user, activeProfileId]);

  useEffect(() => {
    load();
  }, [load]);

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
      {loading && items.length === 0 ? <ActivityIndicator color="#FF6B4A" style={{ marginVertical: 12 }} /> : null}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
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
