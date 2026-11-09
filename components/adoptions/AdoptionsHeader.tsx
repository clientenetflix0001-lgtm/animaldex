// Header del muro. El wordmark es el de Inicio (marca + «nimaldex»).
// Tres filas: logo y lugar, publicar y mis publicaciones, filtros.
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '../AppIcon';
import { useAppTheme, type ThemeColors, radius, spacing } from '../../lib/theme';
import { RootStackParamList } from '../../lib/types';
import {
  ADOPTION_LOCALITIES,
  type AdoptionLocality,
} from '../../lib/adoptionLocalities';
import {
  ADOPTION_SPECIES_FILTERS,
  type AdoptionSpeciesFilter,
} from '../../lib/adoptionSpeciesFilter';

const LOGO = require('../../assets/images/animaldex-logo-mark.png');

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Props {
  city: string;
  locality: string;
  species: AdoptionSpeciesFilter;
  onSpecies: (filter: AdoptionSpeciesFilter) => void;
  onPublish: () => void;
  onMine: () => void;
}

export function AdoptionsHeader({ city, locality, species, onSpecies, onPublish, onMine }: Props) {
  const { colors, scheme } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, scheme === 'dark'), [colors, scheme]);
  const navigation = useNavigation<Nav>();
  const [placeOpen, setPlaceOpen] = useState(false);

  const choosePlace = (place: AdoptionLocality) => {
    setPlaceOpen(false);
    if (place.slug === city) return;
    navigation.navigate('AdoptionsWall', { city: place.slug });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.between}>
        <View style={styles.brand}>
          <Image source={LOGO} style={styles.mark} contentFit="contain" accessibilityLabel="Animaldex" />
          <Text style={styles.word}>nimaldex</Text>
        </View>
        <Pressable
          style={styles.place}
          onPress={() => setPlaceOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Ubicación: ${locality}. Cambiar localidad`}
        >
          <Ionicons name="location" size={14} color={colors.primary} />
          <Text style={styles.placeText} numberOfLines={1}>
            {locality}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.text} />
        </Pressable>
      </View>
      <View style={styles.between}>
        <Pressable onPress={onPublish} hitSlop={6} style={styles.publishHit} accessibilityRole="button">
          <Text style={styles.publish} numberOfLines={1}>+ Publicar una adopción</Text>
        </Pressable>
        <Pressable onPress={onMine} hitSlop={6} accessibilityRole="link">
          <Text style={styles.mine}>Mis publicaciones</Text>
        </Pressable>
      </View>
      <View style={styles.filters}>
        {ADOPTION_SPECIES_FILTERS.map((item) => {
          const selected = item.id === species;
          return (
            <Pressable
              key={item.id}
              style={[styles.chip, selected && styles.chipOn]}
              onPress={() => onSpecies(item.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.chipText, selected && styles.chipTextOn]} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Modal visible={placeOpen} transparent animationType="fade" onRequestClose={() => setPlaceOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPlaceOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Adopciones en</Text>
            {ADOPTION_LOCALITIES.map((place) => {
              const selected = place.slug === city;
              return (
                <Pressable
                  key={place.slug}
                  style={styles.placeRow}
                  onPress={() => choosePlace(place)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Ionicons
                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={18}
                    color={selected ? colors.primary : colors.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.placeName}>{place.locality}</Text>
                    <Text style={styles.placeProvince}>{place.province}</Text>
                  </View>
                </Pressable>
              );
            })}
            <Text style={styles.sheetNote}>Solo aparecen las localidades que ya tienen muro.</Text>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(colors: ThemeColors, dark: boolean) {
  const page = dark ? colors.bg : '#FFFFFF';
  return StyleSheet.create({
    wrap: {
      backgroundColor: page,
      paddingHorizontal: 12,
      paddingTop: 4,
      paddingBottom: 6,
      gap: 2,
    },
    between: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 32,
      gap: spacing.sm,
    },
    brand: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
    mark: { width: 22, height: 22 },
    word: { fontSize: 20, fontWeight: '900', color: colors.primary, letterSpacing: -0.5 },
    place: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      flexShrink: 1,
      maxWidth: '48%',
      paddingVertical: 4,
    },
    placeText: { fontWeight: '700', fontSize: 14, color: colors.text, flexShrink: 1 },
    publishHit: { flexShrink: 1, paddingVertical: 4 },
    publish: { color: colors.primary, fontWeight: '700', fontSize: 14 },
    mine: { color: colors.text, fontWeight: '500', fontSize: 14 },
    filters: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    chip: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
      paddingVertical: 6,
      paddingHorizontal: 4,
    },
    chipOn: { backgroundColor: colors.primary },
    chipText: { fontSize: 13, fontWeight: '700', color: colors.text },
    chipTextOn: { color: '#fff' },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    sheet: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
      maxWidth: 420,
      width: '100%',
      alignSelf: 'center',
    },
    sheetTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
    placeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8 },
    placeName: { fontSize: 15, fontWeight: '800', color: colors.text },
    placeProvince: { fontSize: 12, color: colors.textMuted },
    sheetNote: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  });
}
