import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, radius } from '../lib/theme';
import {
  dismissPushPrompt,
  getPushPermissionStatus,
  registerPushTokenIfGranted,
  requestPushPermission,
  wasPushPromptDismissed,
} from '../lib/push';
import { shouldShowPushPrompt } from '../lib/pushPrompt';

export default function PushPermissionBanner({ hasPets }: { hasPets: boolean }) {
  const [visible, setVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'web' || !hasPets) {
        setVisible(false);
        return;
      }
      let alive = true;
      (async () => {
        const dismissed = await wasPushPromptDismissed();
        const permission = await getPushPermissionStatus();
        if (!alive) return;
        if (permission === 'granted') {
          await registerPushTokenIfGranted().catch(() => {});
          if (alive) setVisible(false);
          return;
        }
        setVisible(shouldShowPushPrompt({ hasPets: true, dismissed, permission }));
      })().catch(() => {});
      return () => {
        alive = false;
      };
    }, [hasPets])
  );

  if (!visible) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Notificaciones</Text>
      <Text style={styles.body}>Activá las notificaciones para recibir avisos importantes sobre tus mascotas.</Text>
      <View style={styles.row}>
        <Pressable
          style={styles.primary}
          onPress={async () => {
            const ok = await requestPushPermission();
            if (ok) {
              await registerPushTokenIfGranted();
              await dismissPushPrompt();
              setVisible(false);
              return;
            }
            const permission = await getPushPermissionStatus();
            const dismissed = await wasPushPromptDismissed();
            setVisible(shouldShowPushPrompt({ hasPets: true, dismissed, permission }));
          }}
        >
          <Text style={styles.primaryText}>Activar</Text>
        </Pressable>
        <Pressable
          style={styles.secondary}
          onPress={async () => {
            await dismissPushPrompt();
            setVisible(false);
          }}
        >
          <Text style={styles.secondaryText}>Ahora no</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontSize: 15, fontWeight: '800', color: colors.text },
  body: { fontSize: 13, color: colors.textMuted, marginTop: 4, lineHeight: 18 },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  secondary: {
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
});
