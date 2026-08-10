// ============================================================
// Animaldex — Selector de localidad (sin mapas)
// ============================================================
// Modal reutilizable: se usa tanto para filtrar el feed de Alertas
// como para elegir la ubicación del hecho al crear una alerta.
import React, { useState, useMemo, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ARGENTINA_LOCALITIES,
  getLocalitiesForProvince,
  getProvinceForLocality,
  searchLocalities,
  LocalityEntry,
} from '../lib/localities';
import { detectCurrentLocality } from '../lib/geo';
import { colors, spacing, radius, shadow } from '../lib/theme';

interface Props {
  visible: boolean;
  currentProvince?: string | null;
  onClose: () => void;
  onSelect: (entry: { locality: string; province: string | null; lat?: number | null; lon?: number | null }) => void;
  /** Título del modal (por defecto "Elegir localidad") */
  title?: string;
  /** Muestra el botón "Usar mi ubicación actual" (por defecto sí) */
  allowUseCurrentLocation?: boolean;
}

export function LocalityPicker({
  visible,
  currentProvince,
  onClose,
  onSelect,
  title = 'Elegir localidad',
  allowUseCurrentLocation = true,
}: Props) {
  const [query, setQuery] = useState('');
  const [locating, setLocating] = useState(false);

  const quickList = useMemo(() => {
    if (currentProvince) {
      const list = getLocalitiesForProvince(currentProvince);
      if (list.length > 0) return list.map((locality) => ({ locality, province: currentProvince }));
    }
    // Sin provincia detectada: mostrar las capitales más comunes.
    return Object.entries(ARGENTINA_LOCALITIES)
      .slice(0, 8)
      .map(([province, list]) => ({ locality: list[0], province }));
  }, [currentProvince]);

  const searchResults: LocalityEntry[] = useMemo(
    () => (query.trim() ? searchLocalities(query, 30) : []),
    [query]
  );

  const useCurrentLocation = useCallback(async () => {
    setLocating(true);
    try {
      const res = await detectCurrentLocality();
      if (res && res.locality) {
        onSelect({ locality: res.locality, province: res.province, lat: res.lat, lon: res.lon });
        setQuery('');
        onClose();
      }
    } finally {
      setLocating(false);
    }
  }, [onSelect, onClose]);

  const pick = useCallback(
    (locality: string, province: string | null) => {
      onSelect({ locality, province });
      setQuery('');
      onClose();
    },
    [onSelect, onClose]
  );

  const acceptTyped = useCallback(() => {
    const text = query.trim();
    if (!text) return;
    const province = getProvinceForLocality(text);
    pick(text, province);
  }, [query, pick]);

  const list = query.trim() ? searchResults : quickList;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        {allowUseCurrentLocation && (
          <Pressable style={styles.currentLocBtn} onPress={useCurrentLocation} disabled={locating}>
            {locating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="locate" size={17} color={colors.primary} />
            )}
            <Text style={styles.currentLocText}>Usar mi ubicación actual</Text>
          </Pressable>
        )}

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={17} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar otra localidad..."
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            onSubmitEditing={acceptTyped}
          />
        </View>

        <FlatList
          data={list}
          keyExtractor={(item, idx) => `${item.locality}-${idx}`}
          renderItem={({ item }) => (
            <Pressable style={styles.item} onPress={() => pick(item.locality, item.province)}>
              <Ionicons name="location-outline" size={17} color={colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemLocality}>{item.locality}</Text>
                <Text style={styles.itemProvince}>{item.province}</Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            query.trim() ? (
              <Pressable style={styles.item} onPress={acceptTyped}>
                <Ionicons name="add-circle-outline" size={17} color={colors.primary} />
                <Text style={styles.itemLocality}>Usar "{query.trim()}"</Text>
              </Pressable>
            ) : null
          }
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          keyboardShouldPersistTaps="handled"
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
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  currentLocBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarysoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginBottom: spacing.md,
  },
  currentLocText: { fontWeight: '700', fontSize: 14, color: colors.primary },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 11 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemLocality: { fontSize: 14, fontWeight: '700', color: colors.text },
  itemProvince: { fontSize: 12, color: colors.textMuted },
});
