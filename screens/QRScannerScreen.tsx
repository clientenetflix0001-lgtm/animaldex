// ============================================================
// Animaldex — Escáner de códigos QR
// ============================================================
// Pantalla de cámara a pantalla completa con:
// - Marco de escaneo animado (línea láser) y overlay oscuro.
// - Zoom por pellizco (pinch-to-zoom) + accesos rápidos 1x/2x/3x.
// - Linterna (flash) para escanear en poca luz.
// - Manejo de permisos con estados claros (pedir / denegado / ajustes).
// - Resolución inteligente del contenido escaneado: perfiles de
//   mascota/usuario, publicaciones, enlaces externos o texto plano.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Linking,
  Dimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../lib/types';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { resolveScannedValue, scanKindLabel, ScanResolution } from '../lib/qr';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_W } = Dimensions.get('window');
const FRAME_SIZE = Math.min(SCREEN_W * 0.72, 300);
const ZOOM_STEPS = [
  { label: '1x', value: 0 },
  { label: '2x', value: 0.45 },
  { label: '3x', value: 0.85 },
];

export default function QRScannerScreen() {
  const navigation = useNavigation<Nav>();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const [scanned, setScanned] = useState(false);
  const [result, setResult] = useState<ScanResolution | null>(null);
  const [copied, setCopied] = useState(false);
  const baseZoomRef = useRef(0);

  const scanLineY = useSharedValue(0);

  useEffect(() => {
    scanLineY.value = withRepeat(
      withSequence(
        withTiming(FRAME_SIZE - 8, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [scanLineY]);

  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanLineY.value }],
  }));

  const applyZoom = useCallback((value: number) => {
    const clamped = Math.min(Math.max(value, 0), 1);
    setZoom(clamped);
  }, []);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      baseZoomRef.current = zoom;
    })
    .onUpdate((event) => {
      const next = Math.min(Math.max(baseZoomRef.current + (event.scale - 1) * 0.5, 0), 1);
      runOnJS(applyZoom)(next);
    });

  const handleZoomStep = useCallback((index: number) => {
    setActiveStep(index);
    applyZoom(ZOOM_STEPS[index].value);
  }, [applyZoom]);

  const resetScanner = useCallback(() => {
    setScanned(false);
    setResult(null);
    setCopied(false);
  }, []);

  const onBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (scanned || !data) return;
      setScanned(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setResult(resolveScannedValue(data));
    },
    [scanned]
  );

  const goToInternalTarget = useCallback(
    (r: ScanResolution) => {
      if (r.kind === 'pet') navigation.replace('PetProfile', { petId: r.id });
      else if (r.kind === 'handle') navigation.replace('PublicProfile', { username: r.username });
      else if (r.kind === 'user') navigation.replace('UserProfile', { userId: r.id });
      else if (r.kind === 'post') navigation.replace('PostDetail', { postId: r.id });
      else if (r.kind === 'tag') navigation.replace('TagWelcome', { code: r.code });
    },
    [navigation]
  );

  const openExternalLink = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      // Si no se puede abrir, dejamos que el usuario copie el enlace.
    }
  }, []);

  const copyToClipboard = useCallback(async (text: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setTimeout(() => setCopied(false), 1800);
  }, []);

  // ---------- Permisos ----------
  if (!permission) {
    return (
      <View style={styles.centerBlack}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionRoot} edges={['top', 'bottom']}>
        <Pressable style={styles.closeBtnDark} onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
        <View style={styles.permissionBody}>
          <View style={styles.permissionIconWrap}>
            <Ionicons name="camera-outline" size={44} color={colors.primary} />
          </View>
          <Text style={styles.permissionTitle}>Permite el acceso a la cámara</Text>
          <Text style={styles.permissionText}>
            Animaldex necesita la cámara para escanear códigos QR de mascotas y perfiles.
          </Text>
          {permission.canAskAgain ? (
            <Pressable style={styles.primaryBtn} onPress={requestPermission}>
              <Text style={styles.primaryBtnText}>Permitir acceso a la cámara</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.primaryBtn} onPress={() => Linking.openSettings()}>
              <Text style={styles.primaryBtnText}>Abrir ajustes</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <GestureDetector gesture={pinchGesture}>
        <View style={StyleSheet.absoluteFill}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            zoom={zoom}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanned ? undefined : onBarcodeScanned}
          />
        </View>
      </GestureDetector>

      {/* Overlay oscuro con marco de escaneo recortado */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.overlayRow} />
        <View style={styles.overlayMidRow}>
          <View style={styles.overlaySide} />
          <View style={styles.frameWrap}>
            <View style={styles.corner} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            {!scanned && (
              <Animated.View style={[styles.scanLine, scanLineStyle]} />
            )}
          </View>
          <View style={styles.overlaySide} />
        </View>
        <View style={styles.overlayRow} />
      </View>

      {/* Header */}
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Escanear código QR</Text>
          <Pressable style={styles.iconBtn} onPress={() => setTorch((t) => !t)} hitSlop={10}>
            <Ionicons name={torch ? 'flash' : 'flash-off'} size={22} color="#fff" />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Instrucción + zoom rápido */}
      {!scanned && (
        <View style={styles.bottomControls}>
          <Text style={styles.hintText}>Apunta la cámara al código QR</Text>
          <View style={styles.zoomRow}>
            {ZOOM_STEPS.map((step, idx) => (
              <Pressable
                key={step.label}
                style={[styles.zoomChip, activeStep === idx && styles.zoomChipActive]}
                onPress={() => handleZoomStep(idx)}
              >
                <Text style={[styles.zoomChipText, activeStep === idx && styles.zoomChipTextActive]}>
                  {step.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.pinchHint}>Pellizca para ajustar el zoom</Text>
        </View>
      )}

      {/* Resultado del escaneo */}
      {scanned && result && (
        <View style={styles.resultSheet}>
          <View style={styles.resultHandle} />
          <View style={styles.resultIconWrap}>
            <Ionicons
              name={
                result.kind === 'pet'
                  ? 'paw'
                  : result.kind === 'user' || result.kind === 'handle'
                  ? 'person'
                  : result.kind === 'post'
                  ? 'chatbubble-ellipses'
                  : result.kind === 'tag'
                  ? 'qr-code'
                  : result.kind === 'url'
                  ? 'link'
                  : 'document-text'
              }
              size={26}
              color={colors.primary}
            />
          </View>
          <Text style={styles.resultKind}>{scanKindLabel(result.kind)}</Text>
          <Text style={styles.resultRaw} numberOfLines={2}>
            {result.kind === 'url' ? result.url : result.kind === 'tag' ? `Código #${result.code}` : result.raw}
          </Text>

          <View style={styles.resultActions}>
            {(result.kind === 'pet' || result.kind === 'user' || result.kind === 'handle' || result.kind === 'post' || result.kind === 'tag') && (
              <Pressable style={styles.primaryBtn} onPress={() => goToInternalTarget(result)}>
                <Ionicons name="arrow-forward-circle" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>
                  {result.kind === 'post'
                    ? 'Ver publicación'
                    : result.kind === 'tag'
                    ? 'Continuar'
                    : 'Ver perfil'}
                </Text>
              </Pressable>
            )}

            {result.kind === 'url' && (
              <Pressable style={styles.primaryBtn} onPress={() => openExternalLink(result.url)}>
                <Ionicons name="open-outline" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>Abrir enlace</Text>
              </Pressable>
            )}

            {(result.kind === 'url' || result.kind === 'text') && (
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => copyToClipboard(result.kind === 'url' ? result.url : result.raw)}
              >
                <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={colors.text} />
                <Text style={styles.secondaryBtnText}>{copied ? 'Copiado' : 'Copiar'}</Text>
              </Pressable>
            )}

            <Pressable style={styles.secondaryBtn} onPress={resetScanner}>
              <Ionicons name="scan-outline" size={18} color={colors.text} />
              <Text style={styles.secondaryBtnText}>Escanear de nuevo</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  centerBlack: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },

  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  overlayRow: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  overlayMidRow: { flexDirection: 'row', height: FRAME_SIZE },
  overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  frameWrap: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 34,
    height: 34,
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: colors.primary,
    borderTopLeftRadius: 14,
  },
  cornerTR: {
    left: undefined,
    right: 0,
    borderLeftWidth: 0,
    borderRightWidth: 4,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 14,
  },
  cornerBL: {
    top: undefined,
    bottom: 0,
    borderTopWidth: 0,
    borderBottomWidth: 4,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 14,
  },
  cornerBR: {
    top: undefined,
    left: undefined,
    bottom: 0,
    right: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderTopLeftRadius: 0,
    borderBottomRightRadius: 14,
  },
  scanLine: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },

  headerSafe: { position: 'absolute', top: 0, left: 0, right: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  bottomControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Platform.OS === 'ios' ? 56 : 40,
    alignItems: 'center',
    gap: spacing.md,
  },
  hintText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  zoomRow: { flexDirection: 'row', gap: spacing.sm },
  zoomChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  zoomChipActive: { backgroundColor: colors.primary },
  zoomChipText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  zoomChipTextActive: { color: '#fff' },
  pinchHint: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },

  // ---------- Permisos ----------
  permissionRoot: { flex: 1, backgroundColor: '#000' },
  closeBtnDark: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 24,
    left: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  permissionBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  permissionIconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(255,107,74,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  permissionTitle: { color: '#fff', fontSize: 19, fontWeight: '800', textAlign: 'center' },
  permissionText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.md,
  },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    gap: 8,
    backgroundColor: colors.bg,
    borderRadius: radius.full,
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  secondaryBtnText: { color: colors.text, fontWeight: '700', fontSize: 14 },

  // ---------- Resultado ----------
  resultSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadow.card,
  },
  resultHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  resultIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primarysoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultKind: { fontSize: 16, fontWeight: '800', color: colors.text },
  resultRaw: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  resultActions: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
