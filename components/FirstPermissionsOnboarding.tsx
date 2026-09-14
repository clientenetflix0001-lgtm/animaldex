import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  nextFirstPermissionsStep,
  shouldRequestOsNotificationPermission,
  type FirstPermissionsStep,
} from '../lib/firstPermissionsOnboarding';
import {
  markFirstPermissionsOnboardingDone,
  wasFirstPermissionsOnboardingDone,
} from '../lib/firstPermissionsOnboardingStore';
import {
  getForegroundLocationGranted,
  requestForegroundLocationIfNeeded,
} from '../lib/locationPermission';
import {
  dismissPushPrompt,
  ensureAndroidChannels,
  getPushPermissionStatus,
  registerPushTokenIfGranted,
  requestPushPermission,
} from '../lib/push';
import { colors, radius, spacing } from '../lib/theme';

function androidSdk(): number {
  return Platform.OS === 'android' ? Number(Platform.Version) || 0 : 0;
}

export default function FirstPermissionsOnboarding() {
  const [step, setStep] = useState<Exclude<FirstPermissionsStep, 'done'> | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = useCallback(async () => {
    await markFirstPermissionsOnboardingDone();
    setStep(null);
  }, []);

  const advanceAfterLocation = useCallback(async () => {
    const permission = await getPushPermissionStatus();
    const next = nextFirstPermissionsStep({
      onboardingDone: false,
      locationGranted: true,
      notificationsGranted: permission === 'granted',
      platform: Platform.OS,
    });
    if (next === 'done') {
      await finish();
      return;
    }
    setStep(next);
  }, [finish]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let alive = true;
    (async () => {
      const done = await wasFirstPermissionsOnboardingDone();
      if (!alive) return;
      if (done) return;
      const locationGranted = await getForegroundLocationGranted();
      const permission = await getPushPermissionStatus();
      const next = nextFirstPermissionsStep({
        onboardingDone: false,
        locationGranted,
        notificationsGranted: permission === 'granted',
        platform: Platform.OS,
      });
      if (!alive) return;
      if (next === 'done') {
        await markFirstPermissionsOnboardingDone();
        return;
      }
      setStep(next);
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!step) return null;

  const isLocation = step === 'location';

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={async () => {
        if (isLocation) await advanceAfterLocation();
        else {
          await dismissPushPrompt();
          await finish();
        }
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{isLocation ? 'Usá tu ubicación' : 'Activar notificaciones'}</Text>
          <Text style={styles.body}>
            {isLocation
              ? 'Animaldex utiliza tu ubicación para mostrarte alertas, mascotas en adopción y contenido cercano. Tu ubicación exacta no se muestra públicamente.'
              : 'Recibí avisos importantes sobre alertas, mascotas y actividad en Animaldex.'}
          </Text>
          <View style={styles.row}>
            <Pressable
              style={[styles.primary, busy && styles.disabled]}
              disabled={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  if (isLocation) {
                    await requestForegroundLocationIfNeeded();
                    await advanceAfterLocation();
                    return;
                  }
                  const already = (await getPushPermissionStatus()) === 'granted';
                  if (
                    shouldRequestOsNotificationPermission({
                      platform: Platform.OS,
                      androidSdk: androidSdk(),
                      alreadyGranted: already,
                    })
                  ) {
                    await requestPushPermission();
                  } else {
                    await ensureAndroidChannels();
                  }
                  if ((await getPushPermissionStatus()) === 'granted') {
                    await registerPushTokenIfGranted();
                    await dismissPushPrompt();
                  }
                  await finish();
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>
                  {isLocation ? 'Permitir ubicación' : 'Activar notificaciones'}
                </Text>
              )}
            </Pressable>
            <Pressable
              style={styles.secondary}
              disabled={busy}
              onPress={async () => {
                if (isLocation) {
                  await advanceAfterLocation();
                  return;
                }
                await dismissPushPrompt();
                await finish();
              }}
            >
              <Text style={styles.secondaryText}>Ahora no</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  body: { fontSize: 14, color: colors.textMuted, marginTop: 8, lineHeight: 20 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  secondary: {
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
  disabled: { opacity: 0.7 },
});
