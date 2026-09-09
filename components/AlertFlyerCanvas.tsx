import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { visibleFlyerFacts, type AlertFlyer } from '../lib/alertFlyer';
import { colors } from '../lib/theme';

export function AlertFlyerCanvas({ flyer }: { flyer: AlertFlyer }) {
  const facts = visibleFlyerFacts(flyer);
  return (
    <View style={styles.sheet} collapsable={false}>
      <Text style={[styles.paw, styles.pawTL]}>🐾</Text>
      <Text style={[styles.paw, styles.pawTR]}>🐾</Text>
      <Text style={[styles.headline, { color: flyer.accent }]}>{flyer.headline}</Text>
      {flyer.image ? (
        <View style={styles.photoWrap}>
          <Image source={{ uri: flyer.image }} style={styles.photo} resizeMode="cover" />
        </View>
      ) : null}
      {flyer.petName ? <Text style={styles.name}>{flyer.petName}</Text> : null}
      {facts.length ? <Text style={styles.facts}>{facts.join(' · ')}</Text> : null}
      {flyer.location ? <Text style={styles.meta}>📍 {flyer.location}</Text> : null}
      {flyer.dateLabel ? <Text style={styles.meta}>{flyer.dateLabel}</Text> : null}
      {flyer.description ? <Text style={styles.desc} numberOfLines={4}>{flyer.description}</Text> : null}
      <Text style={[styles.cta, { color: flyer.accent }]}>{flyer.cta}</Text>
      {flyer.contact ? <Text style={styles.contact}>{flyer.contact}</Text> : null}
      {flyer.authorName ? <Text style={styles.author}>{flyer.authorName}</Text> : null}
      <View style={styles.brandBlock}>
        <Text style={styles.brand}>Animaldex</Text>
        <Text style={styles.domain}>animaldex.com</Text>
      </View>
      <Text style={[styles.paw, styles.pawBL]}>🐾</Text>
      <Text style={[styles.paw, styles.pawBR]}>🐾</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: '#FFF9F2',
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 22,
    justifyContent: 'center',
  },
  paw: { position: 'absolute', fontSize: 14, opacity: 0.28 },
  pawTL: { top: 10, left: 12 },
  pawTR: { top: 10, right: 12 },
  pawBL: { bottom: 10, left: 12 },
  pawBR: { bottom: 10, right: 12 },
  headline: {
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 17,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  photoWrap: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: '46%',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#F3EBE0',
    alignSelf: 'center',
  },
  photo: { width: '100%', height: '100%' },
  name: {
    textAlign: 'center',
    fontSize: 26,
    fontWeight: '900',
    color: colors.text,
    marginTop: 12,
    letterSpacing: 0.3,
  },
  facts: {
    textAlign: 'center',
    marginTop: 5,
    fontWeight: '700',
    fontSize: 14,
    color: colors.textMuted,
  },
  meta: {
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '700',
    fontSize: 14,
    color: colors.text,
  },
  desc: {
    textAlign: 'center',
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
    fontWeight: '600',
  },
  cta: {
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 0.4,
  },
  contact: {
    textAlign: 'center',
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  author: {
    textAlign: 'center',
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  brandBlock: { alignItems: 'center', marginTop: 14 },
  brand: { fontWeight: '900', fontSize: 13, color: colors.textMuted, letterSpacing: 0.5 },
  domain: { marginTop: 2, fontWeight: '700', fontSize: 11, color: '#C4B6A8' },
});
