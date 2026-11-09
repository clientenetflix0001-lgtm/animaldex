// Header del muro. El wordmark es el de Inicio (marca + «nimaldex»).
// La pastilla de lugar sigue el gesto de Alertas, pero solo lista
// localidades que el muro sabe consultar.
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
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const [placeOpen, setPlaceOpen] = useState(false);

  const choosePlace = (place: AdoptionLocality) => {
    setPlaceOpen(false);
    if (place.slug === city) return;
    navigation.navigate('AdoptionsWall', { city: place.slug });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
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
          <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
        </Pressable>
        <View style={styles.actions}>
          <Pressable style={styles.publish} onPress={onPublish} accessibilityRole="button">
            <Text style={styles.publishText}>Publicar</Text>
          </Pressable>
          <Pressable onPress={onMine} hitSlop={8} accessibilityRole="link">
            <Text style={styles.mine}>Mis publicaciones</Text>
          </Pressable>
        </View>
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
              <Text style={[styles.chipText, selected && styles.chipTextOn]}>{item.label}</Text>
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

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      gap: spacing.sm,
    },
    top: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    brand: { flexDirection: 'row', alignItems: 'center' },
    mark: { width: 24, height: 24 },
    word: { fontSize: 22, fontWeight: '900', color: colors.primary, letterSpacing: -0.5 },
    place: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primarysoft,
      borderRadius: radius.full,
      paddingHorizontal: 10,
      paddingVertical: 6,
      maxWidth: '100%',
    },
    placeText: { fontWeight: '800', fontSize: 13, color: colors.text, flexShrink: 1 },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginLeft: 'auto',
    },
    publish: {
      backgroundColor: colors.primary,
      borderRadius: radius.full,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    publishText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
    mine: { color: colors.primary, fontWeight: '800', fontSize: 12.5 },
    filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      borderRadius: radius.full,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12.5, fontWeight: '800', color: colors.text },
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
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    sheetTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
    placeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8 },
    placeName: { fontSize: 15, fontWeight: '800', color: colors.text },
    placeProvince: { fontSize: 12, color: colors.textMuted },
    sheetNote: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  });
}
