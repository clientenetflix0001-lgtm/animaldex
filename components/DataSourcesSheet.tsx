// ============================================================
// Animaldex — Fuentes de datos.
// ============================================================
// Atribución CC BY 4.0 del Servicio Georef. La licencia obliga a nombrar la
// fuente, enlazar la licencia e indicar que los datos fueron modificados, así
// que las tres cosas están acá y no sólo en el pie del selector.
// ============================================================

import React from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { geoCatalogMeta } from '../lib/geoplace/catalog.ts';
import { colors, radius, shadow, spacing } from '../lib/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function DataSourcesSheet({ visible, onClose }: Props) {
  const meta = geoCatalogMeta();
  const open = (url: string) => () => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <Text style={styles.title}>Fuentes de datos</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.sectionTitle}>Localidades y divisiones administrativas</Text>
          <Text style={styles.text}>{meta.attribution}</Text>
          <Text style={styles.text}>{meta.modificationNote}</Text>

          <Pressable style={styles.link} onPress={open('https://www.argentina.gob.ar/georef')}>
            <Ionicons name="open-outline" size={15} color={colors.primary} />
            <Text style={styles.linkText}>Servicio Georef</Text>
          </Pressable>
          <Pressable style={styles.link} onPress={open(meta.licenseUrl)}>
            <Ionicons name="open-outline" size={15} color={colors.primary} />
            <Text style={styles.linkText}>Licencia {meta.license}</Text>
          </Pressable>

          <Text style={styles.meta}>
            Dataset {meta.sourceDataset} ({meta.sourceVersion}) · {meta.counts.places} localidades ·
            versión {meta.geoCatalogVersion}
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    maxHeight: '80%',
    ...shadow.card,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  body: { gap: spacing.sm, paddingBottom: spacing.md },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.text, letterSpacing: 0.3 },
  text: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  linkText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  meta: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 16 },
});
