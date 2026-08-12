// ============================================================
// Animaldex — Sección REELS (en construcción)
// ============================================================
// La integración con TikTok fue removida por completo. Esta pantalla
// es un placeholder intencional mientras se prepara la futura versión
// con videos alojados directamente en Animaldex vía Cloudflare Stream
// (subida propia + reproductor propio). No hay scroll vertical de
// videos ni reproductor en esta etapa — solo un mensaje informativo.
//
// La navegación horizontal Feed ↔ Reels (swipe) se maneja en
// screens/FeedReelsSwiper.tsx, que monta este componente como la
// segunda página del pager.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, radius } from '../lib/theme';
import { useBreakpoint } from '../lib/responsive';

export default function ReelsScreen() {
  const { desktopWeb } = useBreakpoint();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={[styles.center, desktopWeb && styles.centerDesktop]}>
        <View style={styles.iconWrap}>
          <Ionicons name="film" size={40} color={colors.primary} />
        </View>
        <Text style={styles.title}>🎬 Reels</Text>
        <Text style={styles.headline}>Estamos preparando algo nuevo para vos.</Text>
        <Text style={styles.subtext}>
          Próximamente vas a poder disfrutar y compartir videos de mascotas directamente en
          Animaldex.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  centerDesktop: { maxWidth: 480, alignSelf: 'center' },
  iconWrap: {
    width: 84,
    height: 84,
    borderRadius: radius.lg + 20,
    backgroundColor: colors.primarysoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: 24, fontWeight: '900', color: colors.text, marginBottom: spacing.sm },
  headline: { fontSize: 17, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtext: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: spacing.xs,
  },
});
