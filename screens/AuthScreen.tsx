import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useStore } from '../lib/store';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { useBreakpoint } from '../lib/responsive';
import { RootStackParamList } from '../lib/types';
import { isReservedPublicUsername, normalizePublicUsername, USERNAME_RE } from '../lib/publicHandles';

export default function AuthScreen() {
  const { login, register, pendingTagCode } = useStore();
  const { desktopWeb } = useBreakpoint();
  // Si se abre desde el panel de invitación "Crear cuenta", empezar en registro.
  const route = useRoute<RouteProp<RootStackParamList, 'Auth'>>();
  const [mode, setMode] = useState<'login' | 'register'>(
    route.params?.mode === 'register' ? 'register' : 'login'
  );
  useEffect(() => {
    if (route.params?.mode === 'register') setMode('register');
    else if (route.params?.mode === 'login') setMode('login');
  }, [route.params?.mode]);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = useCallback(async () => {
    setError('');
    const u = normalizePublicUsername(username);
    if (u.length < 3) {
      setError('El usuario debe tener al menos 3 caracteres');
      return;
    }
    if (mode === 'register') {
      if (!USERNAME_RE.test(u)) {
        setError('El usuario debe tener 3-20 caracteres: letras, números, punto o guion bajo');
        return;
      }
      if (isReservedPublicUsername(u)) {
        setError('Ese nombre de usuario no está disponible');
        return;
      }
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (mode === 'register' && name.trim().length < 2) {
      setError('Escribe tu nombre');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') await login(u, password);
      else await register(u, name.trim(), password);
      // La navegación cambia sola cuando user != null
    } catch (e: any) {
      setError(e?.message || 'Algo salió mal, intenta de nuevo');
    } finally {
      setLoading(false);
    }
  }, [mode, username, name, password, login, register]);

  const formCard = (
    <View style={[styles.card, desktopWeb && styles.cardDesktop]}>
            {pendingTagCode != null && (
              <View style={styles.tagBanner}>
                <Text style={styles.tagBannerEmoji}>🐾</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tagBannerTitle}>¡Escaneaste una chapita QR!</Text>
                  <Text style={styles.tagBannerText}>
                    Crea tu cuenta o inicia sesión para registrar a tu mascota.
                  </Text>
                </View>
              </View>
            )}
            {/* Selector login/registro */}
            <View style={styles.tabs}>
              <Pressable
                style={[styles.tab, mode === 'login' && styles.tabActive]}
                onPress={() => {
                  setMode('login');
                  setError('');
                }}
              >
                <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>
                  Iniciar sesión
                </Text>
              </Pressable>
              <Pressable
                style={[styles.tab, mode === 'register' && styles.tabActive]}
                onPress={() => {
                  setMode('register');
                  setError('');
                }}
              >
                <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>
                  Crear cuenta
                </Text>
              </Pressable>
            </View>

            {/* Campos */}
            <View style={styles.inputWrap}>
              <Ionicons name="at" size={18} color={colors.textMuted} />
              <TextInput
                style={styles.input}
                placeholder="nombre de usuario"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={setUsername}
                returnKeyType="next"
              />
            </View>

            {mode === 'register' && (
              <View style={styles.inputWrap}>
                <Ionicons name="person-outline" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.input}
                  placeholder="Tu nombre"
                  placeholderTextColor={colors.textMuted}
                  value={name}
                  onChangeText={setName}
                  returnKeyType="next"
                />
              </View>
            )}

            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
              <TextInput
                style={styles.input}
                placeholder="contraseña"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPass}
                autoCapitalize="none"
                value={password}
                onChangeText={setPassword}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
              <Pressable onPress={() => setShowPass((s) => !s)} hitSlop={8}>
                <Ionicons
                  name={showPass ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>
            </View>

            {error !== '' && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={15} color={colors.heart} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Pressable style={styles.primaryBtn} onPress={submit} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {mode === 'login' ? 'Entrar' : 'Crear mi cuenta'}
                </Text>
              )}
            </Pressable>

      <Text style={styles.hint}>
        {mode === 'register'
          ? 'Tu cuenta se guarda en la nube: tus mascotas, fotos y likes te siguen a cualquier dispositivo.'
          : '¿Primera vez? Toca "Crear cuenta" para unirte en segundos.'}
      </Text>
    </View>
  );

  // ---------- Escritorio: split-screen (branding + formulario) ----------
  if (desktopWeb) {
    return (
      <View style={styles.dtRoot}>
        <LinearGradient
          colors={['#FF6B4A', '#FF8E53']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.dtHero}
        >
          <Text style={styles.dtHeroEmoji}>🐾</Text>
          <Text style={styles.dtHeroTitle}>Animaldex</Text>
          <Text style={styles.dtHeroSub}>La red social de tus mascotas</Text>
          <View style={styles.dtFeatures}>
            {[
              ['📸', 'Comparte los mejores momentos de tus peluditos'],
              ['❤️', 'Likes, comentarios y seguidores reales'],
              ['🐕', 'Un perfil único para cada mascota'],
              ['☁️', 'Tus fotos seguras en la nube'],
            ].map(([emoji, text]) => (
              <View key={text} style={styles.dtFeatureRow}>
                <Text style={styles.dtFeatureEmoji}>{emoji}</Text>
                <Text style={styles.dtFeatureText}>{text}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>
        <View style={styles.dtFormCol}>
          <ScrollView
            contentContainerStyle={styles.dtFormScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {formCard}
          </ScrollView>
        </View>
      </View>
    );
  }

  // ---------- Móvil / tablet (sin cambios) ----------
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={['#FF6B4A', '#FF8E53']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <Text style={styles.heroEmoji}>🐾</Text>
            <Text style={styles.heroTitle}>Animaldex</Text>
            <Text style={styles.heroSub}>La red social de tus mascotas</Text>
          </LinearGradient>
          {formCard}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingBottom: 40 },
  dtRoot: { flex: 1, flexDirection: 'row', backgroundColor: colors.bg },
  dtHero: {
    flex: 1.1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
  },
  dtHeroEmoji: { fontSize: 72 },
  dtHeroTitle: { fontSize: 56, fontWeight: '900', color: '#fff', marginTop: 10, letterSpacing: -2 },
  dtHeroSub: { fontSize: 19, color: 'rgba(255,255,255,0.92)', marginTop: 6, fontWeight: '600' },
  dtFeatures: { marginTop: 48, gap: 18, maxWidth: 380 },
  dtFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dtFeatureEmoji: { fontSize: 24 },
  dtFeatureText: { color: 'rgba(255,255,255,0.95)', fontSize: 15, fontWeight: '600', flex: 1, lineHeight: 21 },
  dtFormCol: { width: 520, justifyContent: 'center' },
  dtFormScroll: { flexGrow: 1, justifyContent: 'center', padding: 48 },
  cardDesktop: { marginHorizontal: 0, marginTop: 0, maxWidth: 420, width: '100%', alignSelf: 'center' },
  hero: {
    alignItems: 'center',
    paddingVertical: 48,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
  },
  heroEmoji: { fontSize: 52 },
  heroTitle: { fontSize: 36, fontWeight: '900', color: '#fff', marginTop: 6, letterSpacing: -1 },
  heroSub: { fontSize: 15, color: 'rgba(255,255,255,0.9)', marginTop: 4, fontWeight: '600' },
  card: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.xl,
    marginTop: -24,
    borderRadius: radius.lg,
    padding: spacing.xl,
    ...shadow.card,
  },
  tagBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.primarysoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  tagBannerEmoji: { fontSize: 22 },
  tagBannerTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  tagBannerText: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: radius.full,
    padding: 4,
    marginBottom: spacing.xl,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.full, alignItems: 'center' },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontWeight: '700', fontSize: 14, color: colors.textMuted },
  tabTextActive: { color: '#fff' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  input: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 13 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFE8EC',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  errorText: { color: colors.heart, fontSize: 13, fontWeight: '600', flex: 1 },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 18,
  },
});
