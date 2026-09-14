import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import {
  FLYER_PHOTO_HEIGHT_COMPACT,
  FLYER_PHOTO_HEIGHT_NORMAL,
  FLYER_PHOTO_WIDTH,
  flyerContentDensity,
  flyerDescriptionLines,
  flyerMetaLine,
  type AlertFlyer,
} from '../lib/alertFlyer';

const LOGO = require('../assets/images/animaldex-logo-mark.png');

export function AlertFlyerCanvas({ flyer }: { flyer: AlertFlyer }) {
  const meta = flyerMetaLine(flyer);
  const density = flyerContentDensity(flyer);
  const compact = density === 'compact';
  const photoHeight = compact ? FLYER_PHOTO_HEIGHT_COMPACT : FLYER_PHOTO_HEIGHT_NORMAL;
  const descLines = flyerDescriptionLines(density);
  const space = compact ? styles.spaceCompact : styles.spaceNormal;

  return (
    <View style={[styles.sheet, compact && styles.sheetCompact]} collapsable={false}>
      <View style={[styles.brandRow, space]}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
        <Text style={styles.brand}>Animaldex</Text>
        <Text style={styles.brandPaw}>🐾</Text>
      </View>

      <View style={[styles.heroBand, space, { backgroundColor: flyer.accent }]}>
        <Text style={[styles.hero, compact && styles.heroCompact]} numberOfLines={2}>
          {flyer.headline}
        </Text>
      </View>

      <View style={[styles.photoStage, { height: photoHeight, width: FLYER_PHOTO_WIDTH }]}>
        {flyer.image ? (
          <View style={styles.photoWrap}>
            <Image source={{ uri: flyer.image }} style={styles.photo} resizeMode="cover" />
          </View>
        ) : (
          <View style={[styles.photoWrap, styles.photoEmpty]} />
        )}
      </View>

      {flyer.petName ? (
        <Text style={[styles.name, compact && styles.nameCompact]} numberOfLines={1} ellipsizeMode="tail">
          {flyer.petName}
        </Text>
      ) : null}

      {meta ? (
        <Text style={[styles.meta, compact && styles.metaCompact]} numberOfLines={1} ellipsizeMode="tail">
          🐾 {meta}
        </Text>
      ) : null}

      {flyer.location ? (
        <View style={styles.block}>
          <Text style={styles.blockLabel}>📍 {flyer.locationLabel}</Text>
          <Text style={styles.blockValue} numberOfLines={2} ellipsizeMode="tail">
            {flyer.location}
          </Text>
        </View>
      ) : null}

      {flyer.dateLabel ? (
        <View style={styles.block}>
          <Text style={styles.blockLabel}>📅 Fecha</Text>
          <Text style={styles.blockValue} numberOfLines={1}>
            {flyer.dateLabel}
          </Text>
        </View>
      ) : null}

      {flyer.description ? (
        <View style={styles.block}>
          <Text style={styles.blockLabel}>📝 Descripción</Text>
          <Text style={styles.blockValue} numberOfLines={descLines} ellipsizeMode="tail">
            {flyer.description}
          </Text>
        </View>
      ) : null}

      <View style={[styles.ctaBand, { backgroundColor: flyer.accent }]}>
        <Text style={styles.cta} numberOfLines={2} ellipsizeMode="tail">
          {flyer.cta}
        </Text>
      </View>

      {flyer.contact ? (
        <Text style={styles.contactLine} numberOfLines={1} ellipsizeMode="tail">
          ☎ {flyer.contact}
        </Text>
      ) : null}

      {flyer.petPublicUrl ? (
        <Text style={styles.petUrl} numberOfLines={1} ellipsizeMode="tail">
          {flyer.petPublicUrl}
        </Text>
      ) : null}

      <Text style={styles.domain} numberOfLines={1}>
        animaldex.com
      </Text>
    </View>
  );
}

export function FlyerCanvasFallback() {
  return (
    <View style={styles.fallback}>
      <Text style={styles.fallbackText}>
        No pudimos preparar el flyer. Revisá los datos e intentá nuevamente.
      </Text>
    </View>
  );
}

export class FlyerRenderGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('AlertFlyerCanvas', error.message, info.componentStack);
  }

  render() {
    if (this.state.failed) return <FlyerCanvasFallback />;
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    justifyContent: 'flex-start',
  },
  sheetCompact: { paddingTop: 8, paddingBottom: 6 },
  spaceNormal: { marginBottom: 8 },
  spaceCompact: { marginBottom: 5 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  logo: { width: 18, height: 18 },
  brand: { flex: 1, fontWeight: '900', fontSize: 14, color: '#2D2016', letterSpacing: 0.3 },
  brandPaw: { fontSize: 14, color: '#C4B6A8' },
  heroBand: {
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    flexShrink: 0,
  },
  hero: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  heroCompact: { fontSize: 14 },
  photoStage: {
    alignSelf: 'center',
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 8,
  },
  photoWrap: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F0F0F0',
  },
  photo: { width: '100%', height: '100%' },
  photoEmpty: { backgroundColor: '#F0F0F0' },
  name: {
    flexShrink: 0,
    fontSize: 20,
    fontWeight: '900',
    color: '#2D2016',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  nameCompact: { fontSize: 17 },
  meta: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '700',
    color: '#2D2016',
    lineHeight: 16,
    marginBottom: 6,
  },
  metaCompact: { fontSize: 11, marginBottom: 4 },
  block: { flexShrink: 0, marginBottom: 4 },
  blockLabel: { fontSize: 9, fontWeight: '800', color: '#9A8C7E', letterSpacing: 0.2 },
  blockValue: { marginTop: 1, fontSize: 12, fontWeight: '700', color: '#2D2016', lineHeight: 16 },
  ctaBand: {
    flexShrink: 0,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  cta: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  contactLine: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '800',
    color: '#2D2016',
    marginBottom: 2,
  },
  petUrl: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '700',
    color: '#2D2016',
    marginBottom: 2,
  },
  domain: { flexShrink: 0, fontSize: 11, fontWeight: '800', color: '#9A8C7E', marginTop: 2 },
  fallback: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fallbackText: { textAlign: 'center', fontWeight: '800', fontSize: 15, color: '#2D2016' },
});
