import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { useBreakpoint, CONTENT } from '../lib/responsive';
import { createChooserDestination, type CreateChooserKind } from '../lib/createChooser';

export default function CreateChooserScreen() {
  const navigation = useNavigation<any>();
  const { desktopWeb } = useBreakpoint();

  const open = useCallback(
    (kind: CreateChooserKind) => {
      const dest = createChooserDestination(kind);
      const parent = navigation.getParent?.() ?? navigation;
      parent.navigate(dest);
    },
    [navigation]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={[styles.wrap, desktopWeb && styles.desktop]}>
        <Text style={styles.title}>Crear</Text>
        <Text style={styles.sub}>Elegí qué querés publicar</Text>

        <Pressable
          style={styles.card}
          onPress={() => open('post')}
          accessibilityRole="button"
          accessibilityLabel="Publicación"
        >
          <View style={[styles.iconWrap, { backgroundColor: colors.primarysoft }]}>
            <Ionicons name="image-outline" size={26} color={colors.primary} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.cardTitle}>Publicación</Text>
            <Text style={styles.cardHint}>Foto, texto o contenido normal</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>

        <Pressable
          style={styles.card}
          onPress={() => open('story')}
          accessibilityRole="button"
          accessibilityLabel="Crear historia"
        >
          <View style={[styles.iconWrap, { backgroundColor: colors.primarysoft }]}>
            <Ionicons name="time-outline" size={26} color={colors.primary} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.cardTitle}>Historia</Text>
            <Text style={styles.cardHint}>Foto o video de 24 horas</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>

        <Pressable
          style={styles.card}
          onPress={() => open('reel')}
          accessibilityRole="button"
          accessibilityLabel="Reel"
        >
          <View style={[styles.iconWrap, { backgroundColor: colors.secondarySoft }]}>
            <Ionicons name="film-outline" size={26} color={colors.secondary} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.cardTitle}>Reel</Text>
            <Text style={styles.cardHint}>Video de hasta 30 segundos</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  wrap: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  desktop: { width: '100%', maxWidth: CONTENT.page, alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: colors.text },
  sub: { marginTop: 6, marginBottom: spacing.xl, color: colors.textMuted, fontWeight: '600' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  cardHint: { marginTop: 2, fontSize: 13, color: colors.textMuted, fontWeight: '600' },
});
