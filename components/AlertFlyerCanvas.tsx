import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { flyerFactRows, type AlertFlyer } from '../lib/alertFlyer';

const LOGO = require('../assets/images/animaldex-logo-mark.png');

export function AlertFlyerCanvas({ flyer }: { flyer: AlertFlyer }) {
  const facts = flyerFactRows(flyer);
  return (
    <View style={styles.sheet} collapsable={false}>
      <Text style={[styles.paw, styles.pawTR]}>🐾</Text>
      <Text style={[styles.paw, styles.pawBR]}>🐾</Text>

      <View style={styles.brandRow}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
        <Text style={styles.brand}>Animaldex</Text>
      </View>

      <View style={[styles.heroBand, { backgroundColor: flyer.accent }]}>
        <Text style={styles.hero}>{flyer.headline}</Text>
        <Text style={styles.heroCta}>{flyer.cta}</Text>
      </View>

      <View style={styles.heroRow}>
        {flyer.image ? (
          <View style={styles.photoWrap}>
            <Image source={{ uri: flyer.image }} style={styles.photo} resizeMode="contain" />
          </View>
        ) : (
          <View style={[styles.photoWrap, styles.photoEmpty]} />
        )}
        <View style={styles.sidePanel}>
          {flyer.petName ? <Text style={styles.name}>{flyer.petName}</Text> : null}
          {facts.map((row) => (
            <View key={`${row.label}-${row.value}`} style={styles.fact}>
              <Text style={styles.factIcon}>{row.icon}</Text>
              <View style={styles.factCopy}>
                <Text style={styles.factLabel}>{row.label}</Text>
                <Text style={styles.factValue}>{row.value}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {flyer.location ? (
        <View style={styles.block}>
          <Text style={styles.blockLabel}>📍 {flyer.locationLabel}</Text>
          <Text style={styles.blockValue}>{flyer.location}</Text>
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
          <Text style={styles.blockValue} numberOfLines={3} ellipsizeMode="tail">
            {flyer.description}
          </Text>
        </View>
      ) : null}

      {flyer.contact ? (
        <View style={styles.contactCard}>
          <Text style={styles.contactKicker}>☎ SI TENÉS INFORMACIÓN</Text>
          <Text style={styles.contactValue}>{flyer.contact}</Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.shareLine}>Comparte esta alerta</Text>
        <Text style={styles.tagline}>Juntos los encontramos</Text>
        <Text style={styles.domain}>animaldex.com</Text>
      </View>
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
    backgroundColor: '#FFF9F2',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
  },
  paw: { position: 'absolute', fontSize: 16, color: '#C4B6A8', opacity: 0.45 },
  pawTR: { top: 12, right: 14 },
  pawBR: { bottom: 10, right: 14 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  logo: { width: 22, height: 22 },
  brand: { fontWeight: '900', fontSize: 15, color: '#2D2016', letterSpacing: 0.3 },
  heroBand: {
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  hero: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 20,
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  heroCta: {
    marginTop: 2,
    color: '#fff',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.6,
    textAlign: 'center',
    opacity: 0.95,
  },
  heroRow: { flexDirection: 'row', gap: 12, flex: 1, minHeight: 0 },
  photoWrap: {
    width: '56%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F3EBE0',
  },
  photo: { width: '100%', height: '100%' },
  photoEmpty: { backgroundColor: '#F3EBE0' },
  sidePanel: { flex: 1, justifyContent: 'center', gap: 6, paddingTop: 2 },
  name: { fontSize: 22, fontWeight: '900', color: '#2D2016', letterSpacing: 0.2, marginBottom: 4 },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  factIcon: { fontSize: 12, width: 16, marginTop: 1 },
  factCopy: { flex: 1 },
  factLabel: { fontSize: 9, fontWeight: '700', color: '#9A8C7E', letterSpacing: 0.3 },
  factValue: { fontSize: 13, fontWeight: '800', color: '#2D2016' },
  block: { marginTop: 8 },
  blockLabel: { fontSize: 10, fontWeight: '800', color: '#9A8C7E', letterSpacing: 0.2 },
  blockValue: { marginTop: 2, fontSize: 13, fontWeight: '700', color: '#2D2016', lineHeight: 18 },
  contactCard: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F0E6DA',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  contactKicker: { fontSize: 10, fontWeight: '800', color: '#9A8C7E', letterSpacing: 0.4 },
  contactValue: { marginTop: 3, fontSize: 16, fontWeight: '900', color: '#2D2016' },
  footer: { marginTop: 10, alignItems: 'flex-start' },
  shareLine: { fontSize: 12, fontWeight: '800', color: '#2D2016' },
  tagline: { marginTop: 2, fontSize: 10, fontWeight: '600', color: '#C4B6A8' },
  domain: { marginTop: 2, fontSize: 11, fontWeight: '800', color: '#9A8C7E' },
  fallback: {
    flex: 1,
    backgroundColor: '#FFF9F2',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fallbackText: { textAlign: 'center', fontWeight: '800', fontSize: 15, color: '#2D2016' },
});
