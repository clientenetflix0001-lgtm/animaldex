import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { adoptionStatusOverlay, compactAgeLabel } from '../lib/compactTime';
import { thumb, petFallbackAvatar } from '../lib/images';

export const PROTECTOR_GRID_GAP = 3;

interface Props {
  photo?: string | null;
  name: string;
  careStatus?: string | null;
  adoptionStartedAt?: number | null;
  birthDate?: string | null;
  petId: string;
  onPress: () => void;
}

function ProtectorPetGridItem({
  photo,
  name,
  careStatus,
  adoptionStartedAt,
  birthDate,
  petId,
  onPress,
}: Props) {
  const statusText = adoptionStatusOverlay(careStatus, adoptionStartedAt);
  const ageText = compactAgeLabel(birthDate);

  return (
    <Pressable
      style={styles.cell}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name}
    >
      <Image
        source={{ uri: thumb(photo || petFallbackAvatar(petId), 400) }}
        style={styles.photo}
        contentFit="cover"
        transition={0}
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.55)']}
        locations={[0.35, 1]}
        style={styles.fade}
        pointerEvents="none"
      />
      {!!statusText && (
        <View style={styles.pill} pointerEvents="none">
          <Text style={styles.pillText}>{statusText}</Text>
        </View>
      )}
      <View style={styles.bottom} pointerEvents="none">
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {!!ageText && (
          <Text style={styles.meta} numberOfLines={1}>
            {ageText}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export default memo(ProtectorPetGridItem);

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    aspectRatio: 1,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  photo: {
    ...StyleSheet.absoluteFill,
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '42%',
  },
  pill: {
    position: 'absolute',
    top: 6,
    left: 6,
    maxWidth: '94%',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  pillText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  bottom: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
  },
  name: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  meta: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
