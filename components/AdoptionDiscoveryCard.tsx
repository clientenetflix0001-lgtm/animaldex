import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { adoptionStatusOverlay, compactAgeLabel } from '../lib/compactTime';
import { thumb, petFallbackAvatar } from '../lib/images';
import { sharePetProfile } from '../lib/share';
import WantToAdoptButton from './WantToAdoptButton';
import type { AdoptionCard } from '../lib/adoptionDiscovery';
import { colors, spacing } from '../lib/theme';

interface Props {
  card: AdoptionCard;
  height: number;
  liked: boolean;
  onToggleLike: () => void;
  onOpenPet: () => void;
  onOpenShelter: () => void;
  onComments: () => void;
  bottomPad?: number;
}

function AdoptionDiscoveryCard({
  card,
  height,
  liked,
  onToggleLike,
  onOpenPet,
  onOpenShelter,
  onComments,
  bottomPad = spacing.lg,
}: Props) {
  const ageText = compactAgeLabel(card.birthDate);
  const statusText = adoptionStatusOverlay(card.careStatus, card.adoptionStartedAt) || '❤️ En adopción';
  const photo = thumb(card.photo || petFallbackAvatar(card.petId || card.id), 1080);
  const pad = Math.max(spacing.md, bottomPad);

  return (
    <View style={[styles.page, { height }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onOpenPet} accessibilityLabel={card.name}>
        <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
      </Pressable>
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.72)']}
        locations={[0.42, 1]}
        style={styles.fade}
        pointerEvents="none"
      />

      <View style={[styles.side, { bottom: pad + 148 }]}>
        <Pressable onPress={onToggleLike} style={styles.sideBtn} accessibilityLabel="Me gusta">
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={28} color={liked ? colors.heart : '#fff'} />
        </Pressable>
        <Pressable onPress={onComments} style={styles.sideBtn} accessibilityLabel="Comentarios">
          <Ionicons name="chatbubble-outline" size={26} color="#fff" />
        </Pressable>
        <Pressable
          onPress={() => sharePetProfile(card.petId || card.id, card.petUsername)}
          style={styles.sideBtn}
          accessibilityLabel="Compartir"
        >
          <Ionicons name="arrow-redo-outline" size={26} color="#fff" />
        </Pressable>
      </View>

      <View style={[styles.overlay, { bottom: pad }]}>
        <Pressable onPress={onOpenPet}>
          <Text style={styles.name}>{card.name}</Text>
        </Pressable>
        {!!ageText && <Text style={styles.meta}>{ageText}</Text>}
        <Text style={styles.meta}>{statusText.startsWith('❤️') ? statusText : `❤️ ${statusText}`}</Text>
        {!!card.shelterName && (
          <Pressable onPress={onOpenShelter}>
            <Text style={styles.shelter}>{card.shelterName}</Text>
          </Pressable>
        )}
        {!!(card.shelterLocality || card.shelterLocation) && (
          <Text style={styles.loc}>📍 {card.shelterLocality || card.shelterLocation}</Text>
        )}
        <WantToAdoptButton
          label="Quiero adoptarla"
          size="block"
          style={styles.cta}
          onPress={() =>
            Alert.alert(
              'Quiero adoptarla',
              'Pronto vas a poder enviar una solicitud al refugio desde acá. Mientras tanto podés abrir su perfil.',
              [
                { text: 'Ver refugio', onPress: onOpenShelter },
                { text: 'Cerrar', style: 'cancel' },
              ]
            )
          }
        />
      </View>
    </View>
  );
}

export default memo(AdoptionDiscoveryCard);

const styles = StyleSheet.create({
  page: {
    width: '100%',
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
  },
  side: {
    position: 'absolute',
    right: spacing.md,
    alignItems: 'center',
    gap: 16,
  },
  sideBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    left: spacing.lg,
    right: 64,
  },
  name: { color: '#fff', fontSize: 26, fontWeight: '900' },
  meta: { color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 3 },
  shelter: { color: '#fff', fontSize: 15, fontWeight: '800', marginTop: 8 },
  loc: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 2 },
  cta: { marginTop: 12 },
});
