// ============================================================
// Animaldex — Reproductor de Reels (web)
// ============================================================
// En web se renderiza un <iframe> normal apuntando al reproductor
// OFICIAL embebido de TikTok (https://www.tiktok.com/embed/v2/<id>).
// Metro/Webpack resuelve este archivo automáticamente en builds web
// (sufijo .web.tsx) en lugar de ReelPlayer.tsx (nativo), evitando
// cualquier intento de cargar react-native-webview en el bundle web.
import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';

interface Props {
  embedUrl: string;
  onReady?: () => void;
}

export default function ReelPlayer({ embedUrl, onReady }: Props) {
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  const handleLoad = useCallback(() => {
    setLoading(false);
    onReady?.();
  }, [onReady]);

  const handleError = useCallback(() => {
    setLoading(false);
    setErrored(true);
  }, []);

  return (
    <View style={styles.root}>
      {/* @ts-ignore — elemento DOM nativo, válido en react-native-web */}
      <iframe
        src={embedUrl}
        style={webStyle}
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        // @ts-ignore
        allowFullScreen
        frameBorder="0"
        title="Reel de TikTok"
        onLoad={handleLoad}
        onError={handleError}
      />
      {loading && !errored && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator color="#fff" size="large" />
        </View>
      )}
      {errored && (
        <View style={styles.overlay} pointerEvents="none">
          <Text style={styles.errorEmoji}>🎬</Text>
          <Text style={styles.errorText}>No se pudo cargar el video</Text>
        </View>
      )}
    </View>
  );
}

const webStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  border: 0,
  backgroundColor: '#000',
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    gap: 10,
  },
  errorEmoji: { fontSize: 36 },
  errorText: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600' },
});
