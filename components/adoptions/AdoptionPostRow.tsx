import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import type { ApiAlert } from '../../lib/db';
import { thumb } from '../../lib/images';
import { useAppTheme, type ThemeColors, radius, spacing } from '../../lib/theme';
import { adoptionPostState, adoptionRemainingLabel, adoptionStateLabel } from '../../lib/adoptionLifecycle';

export type RowAction = { key: string; label: string; onPress: () => void; danger?: boolean; disabled?: boolean };

interface Props {
  alert: ApiAlert;
  now: number;
  actions: RowAction[];
  busy?: boolean;
  note?: string | null;
}

export function adoptionPostTitle(alert: ApiAlert): string {
  if (alert.petName) return alert.petName;
  return alert.mediaKind === 'flyer' ? 'Flyer de adopción' : 'Mascota en adopción';
}

export function AdoptionPostRow({ alert, now, actions, busy, note }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const state = adoptionPostState(alert, now);
  const remaining = state === 'active' || state === 'paused' ? adoptionRemainingLabel(alert, now) : null;
  return (
    <View style={styles.row}>
      <Image source={{ uri: thumb(alert.image, 200) }} style={styles.thumb} contentFit="cover" />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.title} numberOfLines={1}>
          {adoptionPostTitle(alert)}
        </Text>
        <Text style={styles.meta}>
          <Text style={[styles.state, state === 'active' && styles.stateActive]}>{adoptionStateLabel(state)}</Text>
          {remaining && alert.expiresAt != null ? ` · ${remaining}` : ''}
        </Text>
        {note ? <Text style={styles.meta}>{note}</Text> : null}
        <View style={styles.actions}>
          {busy ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            actions.map((a) => (
              <Pressable
                key={a.key}
                onPress={a.onPress}
                disabled={a.disabled}
                hitSlop={6}
                style={[styles.action, a.disabled && styles.disabled]}
                accessibilityRole="button"
              >
                <Text style={[styles.actionText, a.danger && styles.danger]}>{a.label}</Text>
              </Pressable>
            ))
          )}
        </View>
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: spacing.md,
      padding: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    thumb: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: colors.surfaceSoft },
    title: { fontSize: 15, fontWeight: '800', color: colors.text },
    meta: { fontSize: 12, color: colors.textMuted },
    state: { fontWeight: '800', color: colors.textMuted },
    stateActive: { color: '#2EA65A' },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 2 },
    action: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
    },
    actionText: { fontSize: 12, fontWeight: '700', color: colors.text },
    danger: { color: '#E0483E' },
    disabled: { opacity: 0.4 },
  });
}
