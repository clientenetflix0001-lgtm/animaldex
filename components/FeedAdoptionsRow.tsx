import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { AdoptionCard } from '../lib/adoptionDiscovery';
import { HOME_MODULE_TITLES } from '../lib/homeFeedModules';
import { HomeHorizontalList, HomeModulePressable } from './HomeHorizontalList';
import { HomeModuleTitle } from './HomeModuleTitle';
import PetAvatar from './PetAvatar';
import { colors, radius, spacing } from '../lib/theme';

function AdoptionChip({ card, onPress }: { card: AdoptionCard; onPress: () => void }) {
  return (
    <HomeModulePressable onPress={onPress} style={styles.card} accessibilityRole="button" accessibilityLabel="Ver mascota en adopción">
      <PetAvatar
        uri={card.photo}
        style={styles.photo}
        radius={radius.md}
        thumbWidth={240}
        iconSize={48}
        recyclingKey={card.id}
        contentFit="cover"
      />
      <Text style={styles.name} numberOfLines={1}>
        {card.name}
      </Text>
    </HomeModulePressable>
  );
}

function FeedAdoptionsRowInner({ pets }: { pets: AdoptionCard[] }) {
  const navigation = useNavigation<any>();
  const open = useCallback(
    (card: AdoptionCard) => {
      const petId = card.petUsername || card.petId;
      if (petId) navigation.navigate('PetProfile', { petId });
    },
    [navigation]
  );
  const renderItem = useCallback(
    ({ item }: { item: AdoptionCard }) => <AdoptionChip card={item} onPress={() => open(item)} />,
    [open]
  );
  return (
    <View style={styles.wrap}>
      <HomeModuleTitle>{HOME_MODULE_TITLES.adoptions}</HomeModuleTitle>
      <HomeHorizontalList
        data={pets}
        keyExtractor={(item) => item.petId || item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

export const FeedAdoptionsRow = memo(FeedAdoptionsRowInner);

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.sm },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md },
  card: { width: 140 },
  photo: { width: 140, height: 168, borderRadius: radius.md, backgroundColor: colors.border },
  name: { marginTop: 6, fontSize: 13, fontWeight: '800', color: colors.text },
});
