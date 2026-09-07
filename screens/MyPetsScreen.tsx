import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useStore } from '../lib/store';
import { thumb } from '../lib/images';
import { colors, spacing, radius, shadow } from '../lib/theme';
import WantToAdoptButton from '../components/WantToAdoptButton';
import PetStatusAvatar from '../components/PetStatusAvatar';
import {
  ADD_PET_ROUTE,
  ADOPT_ROUTE,
  PET_PROFILE_ROUTE,
  buildMyPetsGrid,
  type MyPetsGridItem,
} from '../lib/myPetsGrid';
import { filterPersonalPets } from '../lib/petOwnership';
import { useProfiles } from '../features/profiles';

const GRID_GAP = spacing.md;
const GRID_PAD = spacing.lg;

export default function MyPetsScreen() {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const { myPets, refreshMyPets } = useStore();
  const { profiles } = useProfiles();

  useFocusEffect(
    useCallback(() => {
      refreshMyPets();
    }, [refreshMyPets])
  );

  const tileW = (width - GRID_PAD * 2 - GRID_GAP) / 2;
  const personalPets = useMemo(() => filterPersonalPets(myPets, profiles), [myPets, profiles]);
  const items = useMemo(() => buildMyPetsGrid(personalPets), [personalPets]);

  const openAdopt = useCallback(() => navigation.navigate(ADOPT_ROUTE), [navigation]);
  const openAdd = useCallback(() => navigation.navigate(ADD_PET_ROUTE), [navigation]);
  const openPet = useCallback(
    (petId: string) => navigation.navigate(PET_PROFILE_ROUTE, { petId }),
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }: { item: MyPetsGridItem }) => {
      if (item.kind === 'add') {
        return (
          <Pressable
            style={[styles.card, { width: tileW }]}
            onPress={openAdd}
            accessibilityRole="button"
            accessibilityLabel="Agregar mascota"
          >
            <View style={styles.addCircle}>
              <Ionicons name="add" size={32} color={colors.primary} />
            </View>
            <Text style={styles.handle}>+ Agregar mascota</Text>
          </Pressable>
        );
      }
      return (
        <Pressable
          style={[styles.card, { width: tileW }]}
          onPress={() => openPet(item.petId)}
          accessibilityRole="button"
          accessibilityLabel={item.handle}
        >
          <PetStatusAvatar
            uri={thumb(item.avatarUri, 200)}
            size={72}
            status={personalPets.find((p) => p.id === item.key)?.careStatus}
          />
          <Text style={styles.handle} numberOfLines={1}>
            {item.handle}
          </Text>
          {item.ageLabel ? <Text style={styles.age}>{item.ageLabel}</Text> : null}
        </Pressable>
      );
    },
    [openAdd, openPet, tileW]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Mis mascotas 🐾</Text>
            <WantToAdoptButton size="block" onPress={openAdopt} />
          </View>
        }
        renderItem={renderItem}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { paddingBottom: spacing.xxl, gap: GRID_GAP },
  row: { gap: GRID_GAP, paddingHorizontal: GRID_PAD },
  header: {
    paddingHorizontal: GRID_PAD,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  title: { fontWeight: '800', fontSize: 22, color: colors.text },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    ...shadow.card,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: spacing.sm,
    backgroundColor: colors.border,
  },
  addCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarysoft,
  },
  handle: { fontWeight: '700', fontSize: 13, color: colors.text, textAlign: 'center' },
  age: { fontSize: 12, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
});
