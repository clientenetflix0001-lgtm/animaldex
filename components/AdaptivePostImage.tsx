import React, { useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Modal, Pressable, Platform, StatusBar } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { large } from '../lib/images';
import { colors } from '../lib/theme';

interface Props {
  uri: string;
  imageWidth?: number | null;
  imageHeight?: number | null;
  /** Altura uniforme del contenedor en móvil (por defecto 350px para el Feed). */
  containerHeight?: number;
  /** Permite desactivar el visor en pantalla completa si se desea. */
  allowFullScreen?: boolean;
  /** Callback opcional para doble tap (ej: dar like con animación de corazón). */
  onDoubleTap?: () => void;
}

/**
 * Muestra la imagen dentro de un contenedor uniforme a ancho completo.
 * - Utiliza contentFit="cover" para llenar el contenedor sin bandas laterales ni deformación.
 * - Permite tocar la imagen para abrir el visor en pantalla completa con la imagen completa sin recorte.
 * - Soporta doble tap para like si se proporciona onDoubleTap.
 */
export function AdaptivePostImage({
  uri,
  imageWidth,
  imageHeight,
  containerHeight = 350,
  allowFullScreen = true,
  onDoubleTap,
}: Props) {
  const [modalVisible, setModalVisible] = useState(false);
  const lastTapRef = useRef(0);
  const singleTapTimerRef = useRef<any>(null);

  const handlePress = useCallback(() => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 280;

    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Es doble tap
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapRef.current = 0;
      if (onDoubleTap) {
        onDoubleTap();
      }
    } else {
      // Es primer tap: esperamos por si viene un segundo tap antes de abrir modal
      lastTapRef.current = now;
      if (allowFullScreen) {
        if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = setTimeout(() => {
          setModalVisible(true);
          singleTapTimerRef.current = null;
        }, DOUBLE_TAP_DELAY);
      }
    }
  }, [allowFullScreen, onDoubleTap]);

  return (
    <>
      <Pressable onPress={handlePress} style={[styles.container, { height: containerHeight }]}>
        <Image
          source={{ uri: large(uri) }}
          style={styles.image}
          contentFit="cover"
          contentPosition="center"
          transition={200}
          placeholder={{ blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj' }}
        />
      </Pressable>

      {/* Modal visor de imagen completa */}
      {allowFullScreen && (
        <Modal
          visible={modalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalBg}>
            <Pressable
              style={styles.closeBtn}
              onPress={() => setModalVisible(false)}
              hitSlop={12}
              accessibilityLabel="Cerrar imagen completa"
            >
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
            <Pressable style={styles.modalBackdrop} onPress={() => setModalVisible(false)}>
              <Image
                source={{ uri: large(uri) }}
                style={styles.fullImage}
                contentFit="contain"
                transition={200}
              />
            </Pressable>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  closeBtn: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 20) + 10 : 44,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
