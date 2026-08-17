import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Image as RNImage } from 'react-native';
import { Image } from 'expo-image';
import { large } from '../lib/images';
import { colors } from '../lib/theme';
import { useBreakpoint } from '../lib/responsive';

/**
 * Muestra la foto con su proporción original. No recorta ni deforma.
 *
 * - Móvil / tablet: full-bleed. El contenedor toma exactamente la proporción
 *   real de la imagen (aspectRatio) y ocupa el 100% del ancho disponible, por
 *   lo que la foto va de borde a borde y crece en altura de forma
 *   proporcional (estilo Instagram), sin franjas laterales beige/grises.
 * - Escritorio (web ≥ 1024): se contiene dentro de un alto máximo razonable
 *   para que una imagen vertical no se vuelva gigantesca.
 *
 * La proporción se obtiene con Image.getSize (fiable en web y nativo), en
 * lugar de depender del evento onLoad, que no siempre entrega dimensiones en
 * web y dejaba el contenedor cuadrado (causando el letterbox lateral).
 */
export function AdaptivePostImage({ uri, maxHeight = 520 }: { uri: string; maxHeight?: number }) {
  const { desktopWeb } = useBreakpoint();
  const [ratio, setRatio] = useState(1);
  const src = large(uri);

  useEffect(() => {
    let active = true;
    RNImage.getSize(
      src,
      (w, h) => {
        if (active && w > 0 && h > 0) setRatio(w / h);
      },
      () => {
        /* si falla, se conserva el ratio actual */
      }
    );
    return () => {
      active = false;
    };
  }, [src]);

  if (desktopWeb) {
    return (
      <View style={[styles.wrapDesktop, { maxHeight }]}>
        <Image
          source={{ uri: src }}
          style={{ width: '100%', aspectRatio: ratio, maxHeight }}
          contentFit="contain"
          transition={200}
        />
      </View>
    );
  }

  // Móvil / tablet: contenedor con la proporción exacta de la imagen → la
  // foto llena el ancho completo sin bandas ni recorte.
  return (
    <View style={[styles.wrapMobile, { aspectRatio: ratio }]}>
      <Image
        source={{ uri: src }}
        style={styles.fill}
        contentFit="cover"
        transition={200}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapDesktop: { width: '100%', backgroundColor: colors.border, overflow: 'hidden' },
  wrapMobile: { width: '100%', backgroundColor: 'transparent', overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
});
