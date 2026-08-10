// Panel derecho de sugerencias (solo escritorio ancho, estilo Instagram)
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { PETS, petAvatar, formatCount } from '../lib/data';
import { db, ApiPet } from '../lib/db';
import { useStore } from '../lib/store';
import { thumb, petFallbackAvatar, userFallbackAvatar } from '../lib/images';
import { FollowButton } from './FollowButton';
import { colors, spacing, radius } from '../lib/theme';
import { CONTENT } from '../lib/responsive';

interface Suggestion {
  id: string;
  name: string;
  sub: string;
  avatarUri: string;
  real: boolean;
}

export function SuggestionsPanel() {
  const navigation = useNavigation<any>();
  const { user, followedPets, toggleFollowPet } = useStore();
  const [realPets, setRealPets] = useState<ApiPet[]>([]);

  useEffect(() => {
    db.featuredPets()
      .then((r) => setRealPets(r.pets.slice(0, 4)))
      .catch(() => {});
  }, []);

  const suggestions: Suggestion[] = [
    ...realPets.map((p) => ({
      id: p.id,
      name: `${p.name} ${p.emoji}`,
      sub: `${p.breed || p.species} · Comunidad`,
      avatarUri: p.avatarUrl ?? petFallbackAvatar(p.id),
      real: true,
    })),
    ...PETS.slice(0, 8).map((p) => ({
      id: p.id,
      name: `${p.name} ${p.emoji}`,
      sub: `${p.breed} · ${formatCount(p.followers)} seguidores`,
      avatarUri: petAvatar(p),
      real: false,
    })),
  ].slice(0, 7);

  return (
    <ScrollView style={styles.panel} showsVerticalScrollIndicator={false}>
      {/* Mi tarjeta */}
      <Pressable style={styles.meRow} onPress={() => navigation.navigate('Perfil')}>
        <Image
          source={{ uri: thumb(user?.avatarUrl ?? userFallbackAvatar(user?.username ?? 'yo'), 120) }}
          style={styles.meAvatar}
          transition={200}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.meName} numberOfLines={1}>
            {user?.name ?? ''}
          </Text>
          <Text style={styles.meHandle} numberOfLines={1}>
            @{user?.username ?? ''}
          </Text>
        </View>
      </Pressable>

      {/* Sugerencias */}
      <View style={styles.suggHeader}>
        <Text style={styles.suggTitle}>Sugerencias para ti</Text>
      </View>
      {suggestions.map((s) => {
        const following = followedPets.includes(s.id);
        return (
          <View key={s.id} style={styles.suggRow}>
            <Pressable
              style={styles.suggInfo}
              onPress={() => navigation.navigate('PetProfile', { petId: s.id })}
            >
              <Image source={{ uri: thumb(s.avatarUri, 100) }} style={styles.suggAvatar} transition={200} />
              <View style={{ flex: 1 }}>
                <Text style={styles.suggName} numberOfLines={1}>
                  {s.name}
                </Text>
                <Text style={styles.suggSub} numberOfLines={1}>
                  {s.sub}
                </Text>
              </View>
            </Pressable>
            <FollowButton compact following={following} onPress={() => toggleFollowPet(s.id)} />
          </View>
        );
      })}

      <Text style={styles.footer}>© 2026 Animaldex · La red social de tus mascotas 🐾</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: CONTENT.rightPanel,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
  },
  meRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  meAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.border },
  meName: { fontWeight: '800', fontSize: 15, color: colors.text },
  meHandle: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  suggHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  suggTitle: { fontWeight: '700', fontSize: 14, color: colors.textMuted },
  suggRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  suggInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  suggAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.border },
  suggName: { fontWeight: '700', fontSize: 14, color: colors.text },
  suggSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  footer: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: spacing.xl,
    marginBottom: spacing.xxl,
    lineHeight: 16,
  },
});
