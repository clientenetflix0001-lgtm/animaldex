// ============================================================
// Animaldex — Reproductor de Reels (nativo: iOS/Android)
// ============================================================
// Usa react-native-webview para mostrar el reproductor OFICIAL
// embebido de TikTok (https://www.tiktok.com/embed/v2/<id>). No se
// descarga ni se aloja ningún video: solo se muestra el player que
// TikTok entrega vía su propio servicio.
import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../lib/theme';

interface Props {
  embedUrl: string;
  onReady?: () => void;
}

export default function ReelPlayer({ embedUrl, onReady }: Props) {
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  const handleLoadEnd = useCallback(() => {
    setLoading(false);
    onReady?.();
  }, [onReady]);

  const handleError = useCallback(() => {
    setLoading(false);
    setErrored(true);
  }, []);

  return (
    <View style={styles.root}>
      <WebView
        source={{ uri: embedUrl }}
        style={styles.webview}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        originWhitelist={['*']}
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  webview: { flex: 1, backgroundColor: '#000' },
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
