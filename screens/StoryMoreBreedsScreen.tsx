import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { db } from '../lib/db';
import { colors, spacing } from '../lib/theme';
import { speciesEmoji } from '../lib/stories';

export default function StoryMoreBreedsScreen() {
  const navigation = useNavigation<any>();
  const [rows, setRows] = useState<Array<{ species: string; breedKey: string; breedLabel: string; count: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.storyMoreBreeds()
      .then((res) => setRows(res.channels || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.top}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Cerrar">
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Más razas</Text>
        <View style={{ width: 26 }} />
      </View>
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> : null}
      <FlatList
        data={rows}
        keyExtractor={(item) => `${item.species}:${item.breedKey}`}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() =>
              navigation.replace('StoryViewer', {
                source: 'breed',
                breedSpecies: item.species,
                breedKey: item.breedKey,
              })
            }
          >
            <Text style={styles.emoji}>{speciesEmoji(item.species)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.breedLabel}</Text>
              <Text style={styles.meta}>{item.count} historias activas</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>No hay canales de raza activos ahora.</Text> : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  list: { padding: spacing.lg, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: 14,
  },
  emoji: { fontSize: 22 },
  name: { fontWeight: '700', color: colors.text },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 24 },
});
