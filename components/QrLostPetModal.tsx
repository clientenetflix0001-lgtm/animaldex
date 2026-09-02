import React, { memo } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { qrLostPetMessage, qrLostPetQuestion, qrLostPetTitle } from '../lib/qrLostPet';

type Props = {
  visible: boolean;
  petName?: string | null;
  sending?: boolean;
  onClose: () => void;
  onSendLocation: () => void;
};

function QrLostPetModal({ visible, petName, sending, onClose, onSendLocation }: Props) {
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
            <Text style={styles.title}>{qrLostPetTitle()}</Text>
            <Text style={styles.body}>{qrLostPetMessage(petName)}</Text>
            <Text style={styles.question}>{qrLostPetQuestion()}</Text>
            <Pressable
              style={[styles.primary, sending && styles.primaryOff]}
              onPress={onSendLocation}
              disabled={!!sending}
              accessibilityRole="button"
              accessibilityLabel="Enviar ubicación"
            >
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="location" size={16} color="#fff" />
                  <Text style={styles.primaryText}>Enviar ubicación</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={styles.cancel}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export default memo(QrLostPetModal);

const styles = StyleSheet.create({
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
  question: {
    marginTop: spacing.md,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: 'center',
  },
  primary: {
    marginTop: spacing.lg,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 13,
    minHeight: 48,
  },
  primaryOff: { opacity: 0.7 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  cancel: {
    marginTop: spacing.sm,
    paddingVertical: 12,
    minHeight: 44,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: colors.textMuted, fontWeight: '700', fontSize: 15 },
});
