import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { visibleFlyerFacts, type AlertFlyer } from '../lib/alertFlyer';
import { colors, radius } from '../lib/theme';

export function AlertFlyerCanvas({ flyer }: { flyer: AlertFlyer }) {
  const facts = visibleFlyerFacts(flyer);
  return (
    <View style={styles.sheet}>
      <View style={styles.pawsTop}>
        <Text style={styles.paw}>🐾</Text>
        <Text style={styles.paw}>🐾</Text>
      </View>
      <Text style={[styles.headline, { color: flyer.accent }]}>{flyer.headline}</Text>
      {flyer.image ? (
        <View style={styles.photoWrap}>
          <Image source={{ uri: flyer.image }} style={styles.photo} contentFit="cover" />
        </View>
      ) : null}
      {flyer.petName ? <Text style={styles.name}>{flyer.petName}</Text> : null}
      {facts.length ? <Text style={styles.facts}>{facts.join(' · ')}</Text> : null}
      {flyer.location ? <Text style={styles.meta}>📍 {flyer.location}</Text> : null}
      {flyer.dateLabel ? <Text style={styles.meta}>{flyer.dateLabel}</Text> : null}
      {flyer.description ? <Text style={styles.desc}>{flyer.description}</Text> : null}
      <Text style={[styles.cta, { color: flyer.accent }]}>{flyer.cta}</Text>
      {flyer.contact ? <Text style={styles.contact}>{flyer.contact}</Text> : null}
      {flyer.authorName ? <Text style={styles.author}>{flyer.authorName}</Text> : null}
      <View style={styles.pawsBottom}>
        <Text style={styles.paw}>🐾</Text>
        <Text style={styles.brand}>Animaldex</Text>
        <Text style={styles.paw}>🐾</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: '#FFF9F2',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#F0E6DA',
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 18,
  },
  pawsTop: { flexDirection: 'row', justifyContent: 'space-between' },
  pawsBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
  },
  paw: { fontSize: 16, opacity: 0.45 },
  headline: {
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: 0.6,
    marginTop: 8,
    marginBottom: 14,
  },
  photoWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#F4EDE4',
  },
  photo: { width: '100%', height: '100%' },
  name: {
    textAlign: 'center',
    fontSize: 26,
    fontWeight: '900',
    color: colors.text,
    marginTop: 16,
    letterSpacing: 0.3,
  },
  facts: {
    textAlign: 'center',
    marginTop: 6,
    fontWeight: '700',
    fontSize: 14,
    color: colors.textMuted,
  },
  meta: {
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '700',
    fontSize: 14,
    color: colors.text,
  },
  desc: {
    textAlign: 'center',
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    fontWeight: '600',
  },
  cta: {
    textAlign: 'center',
    marginTop: 16,
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.4,
  },
  contact: {
    textAlign: 'center',
    marginTop: 10,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  author: {
    textAlign: 'center',
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  brand: { fontWeight: '900', fontSize: 13, color: colors.textMuted, letterSpacing: 0.4 },
});
