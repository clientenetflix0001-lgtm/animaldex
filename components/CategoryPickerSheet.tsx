// ============================================================
// Animaldex — "Ver todas" las categorías del Mercado
// ============================================================
import React from 'react';
import { Modal, View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MARKET_CATEGORIES, categoriesFor } from '../lib/market';
import { ListingKind } from '../lib/market';
import { colors, spacing, radius, shadow } from '../lib/theme';

interface Props {
  visible: boolean;
  kind: ListingKind;
  selected: string | null;
  onClose: () => void;
  onSelect: (categoryId: string | null) => void;
}

export function CategoryPickerSheet({ visible, kind, selected, onClose, onSelect }: Props) {
  const categories = categoriesFor(kind);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <Text style={styles.title}>Todas las categorías</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <FlatList
          data={categories}
          keyExtractor={(c) => c.id}
          numColumns={3}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          ListHeaderComponent={
            <Pressable
              style={[styles.allItem, selected === null && styles.itemActive]}
              onPress={() => {
                onSelect(null);
                onClose();
              }}
            >
              <Text style={styles.itemEmoji}>🐾</Text>
              <Text style={[styles.itemLabel, selected === null && styles.itemLabelActive]}>
                Todas las categorías
              </Text>
            </Pressable>
          }
          renderItem={({ item }) => (
            <Pressable
              style={[styles.item, selected === item.id && styles.itemActive]}
              onPress={() => {
                onSelect(item.id);
                onClose();
              }}
            >
              <Text style={styles.itemEmoji}>{item.emoji}</Text>
              <Text style={[styles.itemLabel, selected === item.id && styles.itemLabelActive]} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '75%',
    ...shadow.card,
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  allItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  item: {
    flex: 1,
    margin: 4,
    minWidth: '29%',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemActive: { backgroundColor: colors.primarysoft, borderColor: colors.primary },
  itemEmoji: { fontSize: 24 },
  itemLabel: { fontSize: 12, fontWeight: '700', color: colors.text },
  itemLabelActive: { color: colors.primary },
});
