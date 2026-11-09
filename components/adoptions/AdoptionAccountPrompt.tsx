// Invitación a tener cuenta para publicar o administrar adopciones.
// Ver el muro no pasa por acá.
import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors, radius, spacing } from '../../lib/theme';

interface Props {
  title: string;
  message: string;
  onLogin: () => void;
  onRegister: () => void;
  onCancel: () => void;
}

export function AdoptionAccountPrompt({ title, message, onLogin, onRegister, onCancel }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <Pressable style={styles.primary} onPress={onLogin} accessibilityRole="button">
        <Text style={styles.primaryText}>Iniciar sesión</Text>
      </Pressable>
      <Pressable style={styles.secondary} onPress={onRegister} accessibilityRole="button">
        <Text style={styles.secondaryText}>Crear cuenta</Text>
      </Pressable>
      <Pressable onPress={onCancel} hitSlop={8} accessibilityRole="button">
        <Text style={styles.cancel}>Cancelar</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
      maxWidth: 420,
      width: '100%',
    },
    title: { fontSize: 18, fontWeight: '800', color: colors.text },
    message: { fontSize: 14, lineHeight: 20, color: colors.textMuted, marginBottom: spacing.xs },
    primary: {
      backgroundColor: colors.primary,
      borderRadius: radius.full,
      paddingVertical: 12,
      alignItems: 'center',
    },
    primaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    secondary: {
      borderRadius: radius.full,
      paddingVertical: 11,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryText: { color: colors.text, fontWeight: '700', fontSize: 14 },
    cancel: { color: colors.textMuted, fontWeight: '700', fontSize: 14, textAlign: 'center', paddingVertical: 8 },
  });
}
