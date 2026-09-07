import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, radius, shadow } from '../lib/theme';

interface Props {
  collapsed: boolean;
  onToggle: (collapsed: boolean) => void;
  onLogin: () => void;
  onRegister: () => void;
}

/**
 * Panel de invitación para visitantes SIN sesión que llegan a una
 * publicación mediante un enlace compartido. Identidad visual Animaldex
 * (nada de Facebook). En móvil se comporta como panel inferior / bottom
 * sheet. Puede colapsarse con la X para seguir viendo la publicación; las
 * acciones sociales siguen requiriendo iniciar sesión.
 */
export function GuestInviteBar({ collapsed, onToggle, onLogin, onRegister }: Props) {
  if (collapsed) {
    return (
      <Pressable
        style={styles.pill}
        onPress={() => onToggle(false)}
        accessibilityRole="button"
        accessibilityLabel="Únete a Animaldex"
      >
        <Text style={styles.pillEmoji}>🐾</Text>
        <Text style={styles.pillText}>Únete a Animaldex</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.panel}>
      <Pressable
        style={styles.close}
        onPress={() => onToggle(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Cerrar panel"
      >
        <Ionicons name="close" size={22} color={colors.textMuted} />
      </Pressable>

      <View style={styles.headingRow}>
        <Text style={styles.paw}>🐾</Text>
        <Text style={styles.heading}>Únete a Animaldex</Text>
      </View>
      <Text style={styles.subtitle}>
        Conecta con mascotas, personas y páginas de Bienestar Animal.
      </Text>

      <Pressable style={styles.primaryBtn} onPress={onRegister} accessibilityRole="button">
        <Text style={styles.primaryText}>Crear cuenta</Text>
      </Pressable>
      <Pressable style={styles.secondaryBtn} onPress={onLogin} accessibilityRole="button">
        <Text style={styles.secondaryText}>Iniciar sesión</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl + spacing.md : spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
    // En web/escritorio, centrar y limitar el ancho para que no se vuelva gigante.
    ...(Platform.OS === 'web'
      ? { maxWidth: 480, marginHorizontal: 'auto' as any, borderRadius: radius.lg, bottom: spacing.lg }
      : null),
  },
  close: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    zIndex: 2,
    padding: 2,
  },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: 28 },
  paw: { fontSize: 22 },
  heading: { fontSize: 18, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.sm },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondaryBtn: {
    borderRadius: radius.full,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  secondaryText: { color: colors.primary, fontWeight: '800', fontSize: 15 },
  pill: {
    position: 'absolute',
    bottom: spacing.lg,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    ...shadow.card,
  },
  pillEmoji: { fontSize: 16 },
  pillText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
