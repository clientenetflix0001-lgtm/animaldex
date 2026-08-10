// ============================================================
// Animaldex — Agregar Reel (pegar enlace de TikTok)
// ============================================================
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { db } from '../lib/db';
import { isLikelyTikTokUrl } from '../lib/tiktok';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const STEPS = [
  { icon: 'logo-tiktok' as const, text: 'Abre el video en TikTok' },
  { icon: 'share-social-outline' as const, text: 'Presiona "Compartir"' },
  { icon: 'link-outline' as const, text: 'Presiona "Copiar enlace"' },
  { icon: 'arrow-back-outline' as const, text: 'Vuelve a Animaldex' },
  { icon: 'clipboard-outline' as const, text: 'Pega el enlace aquí abajo' },
];

export default function CreateReelScreen() {
  const navigation = useNavigation<Nav>();
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) setUrl(text.trim());
    } catch {}
  }, []);

  const submit = useCallback(async () => {
    setError('');
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Pega el enlace del video de TikTok');
      return;
    }
    if (!isLikelyTikTokUrl(trimmed)) {
      setError('Ese enlace no parece ser de TikTok. Verifica que empiece con https://www.tiktok.com o https://vm.tiktok.com');
      return;
    }
    setSaving(true);
    try {
      const { reel } = await db.createReel(trimmed);
      navigation.replace('ReelDetail', { reelId: reel.id });
    } catch (e: any) {
      setError(e?.message || 'No se pudo agregar el Reel. Verifica que el video sea público.');
    } finally {
      setSaving(false);
    }
  }, [url, navigation]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.heroIcon}>
            <Ionicons name="logo-tiktok" size={34} color={colors.primary} />
          </View>
          <Text style={styles.heroTitle}>Pegá el enlace del video de TikTok</Text>
          <Text style={styles.heroSub}>
            Compartimos videos públicos de TikTok sobre mascotas. Animaldex no descarga ni aloja el
            video: solo muestra el reproductor oficial de TikTok.
          </Text>

          <View style={styles.stepsCard}>
            {STEPS.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepIconWrap}>
                  <Ionicons name={step.icon} size={16} color={colors.primary} />
                </View>
                <Text style={styles.stepText}>{step.text}</Text>
              </View>
            ))}
          </View>

          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="https://www.tiktok.com/@usuario/video/123..."
              placeholderTextColor={colors.textMuted}
              value={url}
              onChangeText={(t) => {
                setUrl(t);
                if (error) setError('');
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              multiline
            />
            <Pressable style={styles.pasteBtn} onPress={pasteFromClipboard}>
              <Ionicons name="clipboard-outline" size={16} color={colors.primary} />
              <Text style={styles.pasteBtnText}>Pegar</Text>
            </Pressable>
          </View>

          {error !== '' && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={15} color={colors.heart} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable style={styles.saveBtn} onPress={submit} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="add-circle" size={18} color="#fff" />
                <Text style={styles.saveText}>Agregar Reel</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: 60, width: '100%', maxWidth: 560, alignSelf: 'center' },
  heroIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.primarysoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  heroTitle: { fontSize: 19, fontWeight: '800', color: colors.text, textAlign: 'center' },
  heroSub: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19, marginTop: spacing.sm },
  stepsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.xl,
    gap: spacing.md,
    ...shadow.card,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primarysoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 13.5, color: colors.text, fontWeight: '600', flex: 1 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.xl,
  },
  input: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 10, minHeight: 44 },
  pasteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10 },
  pasteBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFE8EC',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.md,
  },
  errorText: { color: colors.heart, fontSize: 13, fontWeight: '600', flex: 1 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 15,
    marginTop: spacing.xl,
    ...shadow.card,
  },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
