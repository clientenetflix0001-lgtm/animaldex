// ============================================================
// Animaldex — Navegación horizontal Feed ↔ Reels
// ============================================================
// Envuelve Feed (página 0) y Reels (página 1) en un carrusel
// horizontal con "paging": deslizar el dedo de derecha a izquierda
// pasa de Feed a Reels, y de izquierda a derecha vuelve a Feed.
// Cada instancia recibe `initialPage` según desde qué pestaña de la
// barra inferior se accedió (Inicio → 0, Reels → 1), para que el
// tab activo y la página visible siempre coincidan al entrar.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, LayoutChangeEvent } from 'react-native';
import FeedScreen from './FeedScreen';
import ReelsScreen from './ReelsScreen';

interface Props {
  initialPage: 0 | 1;
}

export default function FeedReelsSwiper({ initialPage }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const appliedInitialRef = useRef(false);

  useEffect(() => {
    if (size.width > 0 && !appliedInitialRef.current) {
      appliedInitialRef.current = true;
      if (initialPage === 1) {
        // Sin animación: al entrar por la pestaña "Reels" debe verse
        // directamente esa página, no un salto visible desde Feed.
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ x: size.width, animated: false });
        });
      }
    }
  }, [size.width, initialPage]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0 && (width !== size.width || height !== size.height)) {
      setSize({ width, height });
    }
  }, [size.width, size.height]);

  return (
    <View style={styles.root} onLayout={onLayout}>
      {size.width > 0 && (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          style={{ width: size.width, height: size.height }}
        >
          <View style={{ width: size.width, height: size.height }}>
            <FeedScreen />
          </View>
          <View style={{ width: size.width, height: size.height }}>
            <ReelsScreen />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
