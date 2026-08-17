import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { large } from '../lib/images';
import { colors } from '../lib/theme';
import { useBreakpoint } from '../lib/responsive';

/**
 * Muestra la foto con su proporción original. No recorta ni deforma.
 *
 * - Móvil / tablet: full-bleed. La imagen ocupa el 100% del ancho de su
 *   contenedor y crece en altura según su proporción real (estilo
 *   Instagram), sin franjas laterales beige/grises.
 * - Escritorio (web ≥ 1024): se contiene dentro de un alto máximo razonable
 *   para que una imagen vertical no se vuelva gigantesca.
 */
export function AdaptivePostImage({ uri, maxHeight = 520 }: { uri: string; maxHeight?: number }) {
  const { desktopWeb } = useBreakpoint();
  const [ratio, setRatio] = useState(1);

  const handleLoad = (e: any) => {
    const w = e?.source?.width;
    const h = e?.source?.height;
    if (w && h && w > 0 && h > 0) setRatio(w / h);
  };

  if (desktopWeb) {
    return (
      <View style={[styles.wrapDesktop, { maxHeight }]}>
        <Image
          source={{ uri: large(uri) }}
          style={{ width: '100%', aspectRatio: ratio, maxHeight }}
          contentFit="contain"
          transition={200}
          onLoad={handleLoad}
        />
      </View>
    );
  }

  // Móvil / tablet: full-bleed. El contenedor toma exactamente la proporción
  // de la imagen (aspectRatio), por lo que "cover" llena el ancho completo
  // sin recortar ni dejar bandas laterales.
  return (
    <View style={styles.wrapMobile}>
      <Image
        source={{ uri: large(uri) }}
        style={{ width: '100%', aspectRatio: ratio }}
        contentFit="cover"
        transition={200}
        onLoad={handleLoad}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapDesktop: { width: '100%', backgroundColor: colors.border, overflow: 'hidden' },
  wrapMobile: { width: '100%', backgroundColor: 'transparent', overflow: 'hidden' },
});
