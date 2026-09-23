import React, { memo, useMemo } from 'react';
import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme, type ThemeColors, spacing, radius, shadow } from '../lib/theme';
import { centeredParentTextWrap } from '../lib/centeredText';

type Props = {
  visible: boolean;
  message: string;
  onClose: () => void;
};

/** Misma cáscara que QrLostPetModal: overlay, X, no tapa el perfil detrás. */
function QrClaimSuccessModal({ visible, message, onClose }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
          <View style={styles.card}>
            <Pressable
              style={styles.close}
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
            >
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
            <Text style={styles.paw}>🐾</Text>
            <Text style={[styles.title, centeredParentTextWrap]}>Listo</Text>
            <Text style={[styles.body, centeredParentTextWrap]}>{message}</Text>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export default memo(QrClaimSuccessModal);

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(45,32,22,0.35)',
  },
  safe: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    ...shadow.card,
  },
  close: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paw: { fontSize: 36, marginBottom: spacing.sm },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  body: {
    marginTop: spacing.sm,
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
    textAlign: 'center',
  },
});
}
