import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PETS, petAvatar, Pet } from '../lib/data';
import { thumb } from '../lib/images';
import { colors, spacing } from '../lib/theme';

interface Props {
  onOpenPet: (petId: string) => void;
}

export function StoriesBar({ onOpenPet }: Props) {
  return (
    <View style={styles.wrap}>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={PETS}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.item}>
            <View style={styles.addRing}>
              <View style={styles.addCircle}>
                <Ionicons name="add" size={26} color={colors.primary} />
              </View>
            </View>
            <Text style={styles.name}>Tú</Text>
          </View>
        }
        renderItem={({ item }: { item: Pet }) => (
          <Pressable style={styles.item} onPress={() => onOpenPet(item.id)}>
            <LinearGradient
              colors={['#FF6B4A', '#FFB800', '#2EC4B6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ring}
            >
              <View style={styles.imgWrap}>
                <Image source={{ uri: thumb(petAvatar(item), 150) }} style={styles.img} transition={200} />
              </View>
            </LinearGradient>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const SIZE = 64;

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.md },
  list: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  item: { alignItems: 'center', width: SIZE + 8 },
  ring: {
    width: SIZE + 6,
    height: SIZE + 6,
    borderRadius: (SIZE + 6) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imgWrap: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 3,
    borderColor: colors.bg,
    overflow: 'hidden',
  },
  img: { width: '100%', height: '100%' },
  addRing: {
    width: SIZE + 6,
    height: SIZE + 6,
    borderRadius: (SIZE + 6) / 2,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCircle: {
    width: SIZE - 6,
    height: SIZE - 6,
    borderRadius: (SIZE - 6) / 2,
    backgroundColor: colors.primarysoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 11, color: colors.text, marginTop: 5, fontWeight: '600' },
});
