import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import type { ApiAlert } from '../lib/db';
import { alertBadgeColor, alertBadgeText } from '../lib/alerts';
import { thumb, petFallbackAvatar } from '../lib/images';
import { HomeHorizontalList, HomeModulePressable } from './HomeHorizontalList';
import { colors, radius, spacing } from '../lib/theme';

function AlertChip({ alert, onPress }: { alert: ApiAlert; onPress: () => void }) {
  const color = alertBadgeColor(alert);
  return (
    <HomeModulePressable onPress={onPress} style={styles.card} accessibilityRole="button" accessibilityLabel="Abrir alerta">
      <Image
        source={{ uri: thumb(alert.image || petFallbackAvatar(alert.id), 240) }}
        style={styles.photo}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={alert.id}
      />
      <View style={[styles.badge, { backgroundColor: `${color}22` }]}>
        <Text style={[styles.badgeText, { color }]} numberOfLines={1}>
          {alertBadgeText(alert)}
        </Text>
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {alert.petName || 'Mascota'}
      </Text>
    </HomeModulePressable>
  );
}

function FeedAlertsRowInner({ alerts }: { alerts: ApiAlert[] }) {
  const navigation = useNavigation<any>();
  const open = useCallback(
    (alertId: string) => navigation.navigate('AlertDetail', { alertId }),
    [navigation]
  );
  const renderItem = useCallback(
    ({ item }: { item: ApiAlert }) => <AlertChip alert={item} onPress={() => open(item.id)} />,
    [open]
  );
  return (
    <View style={styles.wrap}>
      <HomeHorizontalList
        data={alerts}
        keyExtractor={(item) => `alert:${item.id}`}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

export const FeedAlertsRow = memo(FeedAlertsRowInner);

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.sm },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md },
  card: { width: 132 },
  photo: { width: 132, height: 132, borderRadius: radius.md, backgroundColor: colors.border },
  badge: { marginTop: 6, alignSelf: 'flex-start', borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  name: { marginTop: 4, fontSize: 13, fontWeight: '700', color: colors.text },
});
