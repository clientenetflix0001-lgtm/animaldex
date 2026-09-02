import React, { memo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Linking } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { adoptionStatusOverlay, compactAgeLabel } from '../lib/compactTime';
import { thumb, petFallbackAvatar, userFallbackAvatar } from '../lib/images';
import { sharePetProfile } from '../lib/share';
import { db } from '../lib/db';
import { adoptCtaLabel, resolveAdoptionOpenAction } from '../lib/adoptionContact';
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
  const shelterHandle = card.shelterUsername || card.shelterName;
  const shelterAvatar = thumb(
    card.shelterAvatar || userFallbackAvatar(card.shelterUsername || card.shelterProfileId || 'refugio'),
    80
  );
  const [contactBusy, setContactBusy] = useState(false);
  const cta = adoptCtaLabel(card.sex);

  const onAdopt = useCallback(async () => {
    if (contactBusy) return;
    const petId = card.petId;
    if (!petId) {
      Alert.alert(cta, 'Este refugio todavía no agregó un medio de contacto para solicitudes de adopción.');
      return;
    }
    setContactBusy(true);
    try {
      const res = await db.adoptionContact(petId);
      const action = resolveAdoptionOpenAction({
        expectedShelterProfileId: card.shelterProfileId,
        shelterProfileId: res.shelterProfileId,
        whatsapp: res.adoptionWhatsapp,
        phone: res.adoptionPhone,
        petName: res.petName || card.name,
        petHandleOrId: res.petUsername || card.petUsername || petId,
      });
      if (action.kind === 'none') {
        Alert.alert(cta, action.message);
        return;
      }
      try {
        await Linking.openURL(action.url);
      } catch {
        Alert.alert(cta, 'No se pudo abrir el contacto. Probá de nuevo más tarde.');
      }
    } catch {
      Alert.alert(cta, 'Este refugio todavía no agregó un medio de contacto para solicitudes de adopción.');
    } finally {
      setContactBusy(false);
    }
  }, [card, cta, contactBusy]);

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
        {!!shelterHandle && (
          <Pressable onPress={onOpenShelter} style={styles.shelterRow} accessibilityLabel={shelterHandle}>
            <Image source={{ uri: shelterAvatar }} style={styles.shelterAvatar} />
            <Text style={styles.shelter}>{shelterHandle}</Text>
          </Pressable>
        )}
        {!!(card.shelterLocality || card.shelterLocation) && (
          <Text style={styles.loc}>📍 {card.shelterLocality || card.shelterLocation}</Text>
        )}
        <WantToAdoptButton
          label={cta}
          size="block"
          style={styles.cta}
          onPress={onAdopt}
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
  shelterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  shelterAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)' },
  shelter: { color: '#fff', fontSize: 15, fontWeight: '800' },
  loc: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 2 },
  cta: { marginTop: 12 },
});
