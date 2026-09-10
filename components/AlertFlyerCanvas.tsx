import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { flyerMetaLine, type AlertFlyer } from '../lib/alertFlyer';

const LOGO = require('../assets/images/animaldex-logo-mark.png');

export function AlertFlyerCanvas({ flyer }: { flyer: AlertFlyer }) {
  const meta = flyerMetaLine(flyer);
  return (
    <View style={styles.sheet} collapsable={false}>
      <Text style={[styles.paw, styles.pawBR]}>🐾</Text>

      <View style={styles.brandRow}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
        <Text style={styles.brand}>Animaldex</Text>
        <Text style={styles.brandPaw}>🐾</Text>
      </View>

      <View style={[styles.heroBand, { backgroundColor: flyer.accent }]}>
        <Text style={styles.hero}>{flyer.headline}</Text>
      </View>

      <View style={styles.photoStage}>
        {flyer.image ? (
          <View style={styles.photoWrap}>
            <Image source={{ uri: flyer.image }} style={styles.photo} resizeMode="cover" />
          </View>
        ) : (
          <View style={[styles.photoWrap, styles.photoEmpty]} />
        )}
      </View>

      {flyer.petName ? (
        <Text style={styles.name} numberOfLines={2}>
          {flyer.petName}
        </Text>
      ) : null}

      {meta ? (
        <Text style={styles.meta} numberOfLines={2}>
          🐾 {meta}
        </Text>
      ) : null}

      {flyer.location ? (
        <View style={styles.block}>
          <Text style={styles.blockLabel}>📍 {flyer.locationLabel}</Text>
          <Text style={styles.blockValue} numberOfLines={2}>
            {flyer.location}
          </Text>
        </View>
      ) : null}

      {flyer.dateLabel ? (
        <View style={styles.block}>
          <Text style={styles.blockLabel}>📅 Fecha</Text>
          <Text style={styles.blockValue}>{flyer.dateLabel}</Text>
        </View>
      ) : null}

      {flyer.description ? (
        <View style={styles.block}>
          <Text style={styles.blockLabel}>📝 Descripción</Text>
          <Text style={styles.blockValue} numberOfLines={4} ellipsizeMode="tail">
            {flyer.description}
          </Text>
        </View>
      ) : null}

      <View style={[styles.ctaBand, { backgroundColor: flyer.accent }]}>
        <Text style={styles.cta}>{flyer.cta}</Text>
      </View>

      {flyer.contact ? (
        <View style={styles.contactCard}>
          <Text style={styles.contactKicker}>☎ SI TENÉS INFORMACIÓN</Text>
          <Text style={styles.contactValue} numberOfLines={2}>
            {flyer.contact}
          </Text>
        </View>
      ) : null}

      {flyer.petPublicUrl ? (
        <Text style={styles.petUrl} numberOfLines={1}>
          {flyer.petPublicUrl}
        </Text>
      ) : null}

      <Text style={styles.domain}>animaldex.com</Text>
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
    paddingTop: 12,
    paddingBottom: 10,
  },
  paw: { position: 'absolute', fontSize: 16, color: '#C4B6A8', opacity: 0.4 },
  pawBR: { bottom: 8, right: 12 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    flexShrink: 0,
  },
  logo: { width: 20, height: 20 },
  brand: { flex: 1, fontWeight: '900', fontSize: 15, color: '#2D2016', letterSpacing: 0.3 },
  brandPaw: { fontSize: 16, color: '#C4B6A8' },
  heroBand: {
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginBottom: 8,
    flexShrink: 0,
  },
  hero: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  photoStage: {
    flex: 1,
    minHeight: 168,
    width: '100%',
    marginBottom: 8,
    justifyContent: 'center',
  },
  photoWrap: {
    width: '90%',
    flex: 1,
    alignSelf: 'center',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#F0F0F0',
  },
  photo: { width: '100%', height: '100%' },
  photoEmpty: { backgroundColor: '#F0F0F0' },
  name: {
    flexShrink: 0,
    fontSize: 22,
    fontWeight: '900',
    color: '#2D2016',
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  meta: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '700',
    color: '#2D2016',
    lineHeight: 18,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  block: { flexShrink: 0, marginBottom: 6 },
  blockLabel: { fontSize: 10, fontWeight: '800', color: '#9A8C7E', letterSpacing: 0.2 },
  blockValue: { marginTop: 2, fontSize: 13, fontWeight: '700', color: '#2D2016', lineHeight: 18 },
  ctaBand: {
    flexShrink: 0,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 6,
  },
  cta: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  contactCard: {
    flexShrink: 0,
    marginBottom: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F0E6DA',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  contactKicker: { fontSize: 10, fontWeight: '800', color: '#9A8C7E', letterSpacing: 0.4 },
  contactValue: { marginTop: 3, fontSize: 15, fontWeight: '900', color: '#2D2016' },
  petUrl: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '700',
    color: '#2D2016',
    marginBottom: 2,
  },
  domain: { flexShrink: 0, fontSize: 11, fontWeight: '800', color: '#9A8C7E' },
  fallback: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fallbackText: { textAlign: 'center', fontWeight: '800', fontSize: 15, color: '#2D2016' },
});
