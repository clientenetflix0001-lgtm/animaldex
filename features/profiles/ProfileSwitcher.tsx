import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing } from '../../lib/theme';
import { thumb, userFallbackAvatar } from '../../lib/images';
import { useStore } from '../../lib/store';
import { useProfiles } from './ProfileContext';
import { PROFILE_TYPE_LABEL } from './profileTypes';
import CreateProfileSheet from './CreateProfileSheet';

interface Props {
  compact?: boolean;
}

export default function ProfileSwitcher({ compact }: Props) {
  const { user } = useStore();
  const { profiles, activeProfile, activeProfileId, setActiveProfileId } = useProfiles();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  if (!user) return null;

  const name = activeProfile?.name || user.name;
  const username = activeProfile?.username || user.username;
  const avatar = activeProfile?.avatar || user.avatarUrl || userFallbackAvatar(user.id);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={compact ? styles.compact : styles.trigger}
        hitSlop={6}
        accessibilityLabel="Seleccionar perfil o página"
      >
        <Image source={{ uri: thumb(avatar, 80) }} style={compact ? styles.avatarSm : styles.avatar} />
        <Text style={compact ? styles.compactName : styles.triggerName} numberOfLines={1}>
          {name}
        </Text>
        <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Seleccionar perfil o página</Text>
          <ScrollView style={{ maxHeight: 360 }}>
            {profiles.map((p) => {
              const selected = p.id === activeProfileId;
              return (
                <Pressable
                  key={p.id}
                  style={styles.row}
                  onPress={() => {
                    setActiveProfileId(p.id);
                    setOpen(false);
                  }}
                >
                  <Image
                    source={{ uri: thumb(p.avatar || userFallbackAvatar(p.id), 80) }}
                    style={styles.rowAvatar}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>
                      {selected ? '✓ ' : ''}
                      {p.name}
                    </Text>
                    <Text style={styles.rowUser}>@{p.username}</Text>
                    <Text style={styles.rowType}>{PROFILE_TYPE_LABEL[p.type]}</Text>
                  </View>
                </Pressable>
              );
            })}
            <Pressable
              style={styles.create}
              onPress={() => {
                setOpen(false);
                setCreating(true);
              }}
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              <Text style={styles.createText}>Crear página</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      <CreateProfileSheet visible={creating} onClose={() => setCreating(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginLeft: spacing.lg,
    marginBottom: 6,
    paddingRight: 8,
    maxWidth: '72%',
  },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.border },
  avatarSm: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.border },
  triggerName: { fontSize: 13, fontWeight: '700', color: colors.text, maxWidth: 160 },
  compactName: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(45,32,22,0.35)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: spacing.lg,
    paddingBottom: 28,
    maxHeight: '72%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.border },
  rowName: { fontWeight: '800', color: colors.text, fontSize: 15 },
  rowUser: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  rowType: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  create: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 4,
  },
  createText: { color: colors.primary, fontWeight: '800', fontSize: 15 },
});
