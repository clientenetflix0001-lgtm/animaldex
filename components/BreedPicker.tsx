import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  BREED_UNKNOWN_FOUND_LABEL,
  BREED_UNKNOWN_LABEL,
  catalogSpeciesFromAlert,
  breedById,
  suggestBreeds,
  type BreedCatalogEntry,
} from '../lib/breeds';
import { colors, radius, spacing } from '../lib/theme';

type Props = {
  species: string;
  breedId: string | null;
  onSelect: (breedId: string | null) => void;
  allowUnknown?: boolean;
  label?: string;
};

export default function BreedPicker({
  species,
  breedId,
  onSelect,
  allowUnknown = true,
  label = 'Raza',
}: Props) {
  const [query, setQuery] = useState('');
  const dogCatalog = catalogSpeciesFromAlert(species) === 'dog';
  const suggestions = useMemo(() => (dogCatalog ? suggestBreeds(query, species) : []), [dogCatalog, query, species]);
  const selected = breedById(breedId);

  const pick = (entry: BreedCatalogEntry | null) => {
    onSelect(entry ? entry.id : null);
    setQuery('');
  };

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      {breedId ? (
        <View style={styles.selectedRow}>
          <Text style={styles.selectedText}>{selected?.label || breedId}</Text>
          <Pressable onPress={() => pick(null)} accessibilityLabel="Quitar raza">
            <Text style={styles.clear}>Cambiar</Text>
          </Pressable>
        </View>
      ) : dogCatalog ? (
        <>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Buscá Caniche, Labrador..."
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.trim() ? (
            <View style={styles.list}>
              {suggestions.map((entry) => (
                <Pressable
                  key={entry.id}
                  style={styles.item}
                  onPress={() => pick(entry)}
                  accessibilityLabel={entry.label}
                >
                  <Text style={styles.itemText}>{entry.label}</Text>
                </Pressable>
              ))}
              {suggestions.length === 0 ? (
                <Text style={styles.empty}>Elegí una raza del catálogo. El texto libre no se guarda.</Text>
              ) : null}
            </View>
          ) : null}
        </>
      ) : (
        <Text style={styles.help}>Por ahora el catálogo de razas es solo para perros.</Text>
      )}
      {allowUnknown ? (
        <Pressable
          style={[styles.unknown, breedId == null && styles.unknownActive]}
          onPress={() => pick(null)}
        >
          <Text style={[styles.unknownText, breedId == null && { color: '#fff' }]}>
            {allowUnknown && dogCatalog ? BREED_UNKNOWN_FOUND_LABEL : BREED_UNKNOWN_LABEL}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    backgroundColor: colors.card,
    fontSize: 15,
  },
  list: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  item: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemText: { fontSize: 15, fontWeight: '700', color: colors.text },
  empty: { padding: 12, color: colors.textMuted, fontSize: 13 },
  help: { fontSize: 13, color: colors.textMuted, marginBottom: 8 },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectedText: { fontSize: 15, fontWeight: '800', color: colors.text },
  clear: { color: colors.primary, fontWeight: '800' },
  unknown: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  unknownActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  unknownText: { fontWeight: '800', color: colors.text, fontSize: 13 },
});
