import React, { useMemo } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
// Ícono semántico naranja: AppIcon lo pasaría a blanco/negro en web.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme, type ThemeColors, radius, spacing } from '../../lib/theme';

export const FLYER_CONTACT_TITLE = '¿Querés adoptar esta mascota?';
export const FLYER_CONTACT_MESSAGE =
  'Los datos de contacto están en la imagen de la publicación. Revisá el flyer para comunicarte con la persona que la publicó.';

interface Props {
  visible: boolean;
  onViewFlyer: () => void;
  onClose: () => void;
}

export function FlyerContactModal({ visible, onViewFlyer, onClose }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar">
        <Pressable style={styles.card} onPress={() => {}} accessibilityRole="alert">
          <View style={styles.iconWrap}>
            <Ionicons name="call-outline" size={28} color={colors.primary} />
          </View>
          <Text style={styles.title}>{FLYER_CONTACT_TITLE}</Text>
          <Text style={styles.message}>{FLYER_CONTACT_MESSAGE}</Text>
          <Pressable style={styles.primaryBtn} onPress={onViewFlyer} accessibilityRole="button">
            <Text style={styles.primaryText}>Ver flyer</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={onClose} accessibilityRole="button" hitSlop={6}>
            <Text style={styles.secondaryText}>Cerrar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    card: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xl,
      paddingBottom: spacing.lg,
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primarysoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    title: { fontSize: 17, fontWeight: '800', color: colors.text, textAlign: 'center' },
    message: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.lg,
    },
    primaryBtn: {
      alignSelf: 'stretch',
      backgroundColor: colors.primary,
      borderRadius: radius.full,
      paddingVertical: 12,
      alignItems: 'center',
    },
    primaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    secondaryBtn: { paddingVertical: 12, paddingHorizontal: spacing.lg, marginTop: 2 },
    secondaryText: { color: colors.textMuted, fontWeight: '700', fontSize: 14 },
  });
}
