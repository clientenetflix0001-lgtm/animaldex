import React, { memo, useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { ApiAlert } from '../lib/db';
import { db } from '../lib/db';
import { HOME_ALERTS_VISIBLE_MAX, HOME_MODULE_TITLES } from '../lib/homeFeedModules';
import { AlertCard } from './AlertCard';
import { HomeModulePressable } from './HomeHorizontalList';
import { HomeModuleTitle } from './HomeModuleTitle';
import { spacing } from '../lib/theme';

function FeedAlertsRowInner({ alerts }: { alerts: ApiAlert[] }) {
  const navigation = useNavigation<any>();
  const [rows, setRows] = useState(alerts);

  useEffect(() => {
    setRows(alerts);
  }, [alerts]);

  const open = useCallback(
    (alertId: string) => navigation.navigate('AlertDetail', { alertId }),
    [navigation]
  );

  const onToggleLike = useCallback((alertId: string) => {
    setRows((prev) =>
      prev.map((alert) =>
        alert.id === alertId
          ? { ...alert, isLiked: !alert.isLiked, likeCount: alert.likeCount + (alert.isLiked ? -1 : 1) }
          : alert
      )
    );
    const target = rows.find((alert) => alert.id === alertId);
    db.alertLike(alertId, !(target?.isLiked ?? false)).catch(() => {});
  }, [rows]);

  return (
    <View style={styles.wrap}>
      <HomeModuleTitle>{HOME_MODULE_TITLES.alerts}</HomeModuleTitle>
      {rows.slice(0, HOME_ALERTS_VISIBLE_MAX).map((alert) => (
        <HomeModulePressable
          key={alert.id}
          onPress={() => open(alert.id)}
          accessibilityRole="button"
          accessibilityLabel="Abrir alerta"
          style={styles.cardPress}
        >
          <AlertCard alert={alert} onToggleLike={onToggleLike} onOpenComments={(item) => open(item.id)} />
        </HomeModulePressable>
      ))}
    </View>
  );
}

export const FeedAlertsRow = memo(FeedAlertsRowInner);

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.sm },
  cardPress: { width: '100%' },
});
