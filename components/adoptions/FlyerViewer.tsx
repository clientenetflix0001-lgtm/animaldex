import React, { useEffect, useState } from 'react';
import { Modal, View, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, Platform, Linking } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useImageNaturalSize } from '../../lib/imageNaturalSize';

const ZOOM_STEPS = [1, 2, 3];

interface Props {
  uri: string | null;
  onClose: () => void;
}

/** Flyer original a pantalla completa con zoom (tocar o botones) y desplazamiento. */
export function FlyerViewer({ uri, onClose }: Props) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const natural = useImageNaturalSize(uri || undefined);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
  }, [uri]);

  const zoom = ZOOM_STEPS[step];
  const ratio = natural?.width && natural?.height ? natural.width / natural.height : 3 / 4;
  const fitW = Math.min(screenW, screenH * ratio);
  const fitH = fitW / ratio;
  const w = fitW * zoom;
  const h = fitH * zoom;

  const openOriginal = () => {
    if (!uri) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(uri, '_blank', 'noopener');
    else Linking.openURL(uri).catch(() => {});
  };

  return (
    <Modal visible={!!uri} animationType="fade" onRequestClose={onClose} transparent={false}>
      <View style={styles.root}>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={[styles.center, { minWidth: screenW, minHeight: screenH }]}
          showsVerticalScrollIndicator={false}
        >
          <ScrollView
            horizontal
            contentContainerStyle={[styles.center, { minWidth: screenW }]}
            showsHorizontalScrollIndicator={false}
          >
            <Pressable onPress={() => setStep((s) => (s + 1) % ZOOM_STEPS.length)} accessibilityLabel="Acercar o alejar">
              {uri ? <Image source={{ uri }} style={{ width: w, height: h }} contentFit="contain" /> : null}
            </Pressable>
          </ScrollView>
        </ScrollView>

        <View style={styles.topBar} pointerEvents="box-none">
          <Pressable onPress={onClose} style={styles.roundBtn} hitSlop={10} accessibilityLabel="Cerrar flyer">
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.bottomBar} pointerEvents="box-none">
          <Pressable
            onPress={() => setStep((s) => Math.max(0, s - 1))}
            style={[styles.roundBtn, step === 0 && styles.disabled]}
            disabled={step === 0}
            accessibilityLabel="Alejar"
          >
            <Ionicons name="remove" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.zoomText}>{zoom}×</Text>
          <Pressable
            onPress={() => setStep((s) => Math.min(ZOOM_STEPS.length - 1, s + 1))}
            style={[styles.roundBtn, step === ZOOM_STEPS.length - 1 && styles.disabled]}
            disabled={step === ZOOM_STEPS.length - 1}
            accessibilityLabel="Acercar"
          >
            <Ionicons name="add" size={22} color="#fff" />
          </Pressable>
          <Pressable onPress={openOriginal} style={styles.roundBtn} accessibilityLabel="Abrir imagen original">
            <Ionicons name="open-outline" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  topBar: { position: 'absolute', top: 16, right: 16 },
  bottomBar: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  disabled: { opacity: 0.4 },
  zoomText: { color: '#fff', fontWeight: '800', fontSize: 14, minWidth: 28, textAlign: 'center' },
});
