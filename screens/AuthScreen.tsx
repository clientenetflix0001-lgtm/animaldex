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
import { auth, db } from '../lib/db';
import { sendVerificationCode, verifyCode, smsStatus, PHONE_SIGNUP_UNAVAILABLE } from '../lib/api';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { useBreakpoint } from '../lib/responsive';
import { RootStackParamList } from '../lib/types';
import { isReservedPublicUsername, isValidPublicUsername, normalizePublicUsername } from '../lib/publicHandles';
import {
  isValidEmail,
  normalizeEmail,
  normalizePhone,
  validatePasswordPair,
} from '../lib/phone';

type Tab = 'login' | 'register';
type Step =
  | 'login'
  | 'registerChoice'
  | 'emailCredentials'
  | 'emailUsername'
  | 'phoneNumber'
  | 'phoneOtp'
  | 'phonePassword'
  | 'phoneUsername';

const AR_DIAL = '+54';

export default function AuthScreen() {
  const { login, registerEmail, registerPhone, pendingTagCode } = useStore();
  const { desktopWeb } = useBreakpoint();
  const route = useRoute<RouteProp<RootStackParamList, 'Auth'>>();

  const [tab, setTab] = useState<Tab>(route.params?.mode === 'register' ? 'register' : 'login');
  const [step, setStep] = useState<Step>(route.params?.mode === 'register' ? 'registerChoice' : 'login');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [phoneLocal, setPhoneLocal] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [lockedPhone, setLockedPhone] = useState<string | null>(null);
  const [phoneTicket, setPhoneTicket] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    if (route.params?.mode === 'register') goRegister();
    else if (route.params?.mode === 'login') goLogin();
    // El wizard vive en este screen: no se toca pendingTagCode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.mode]);

  const goLogin = useCallback(() => {
    setTab('login');
    setStep('login');
    setError('');
    setInfo('');
    setPassword2('');
    setOtpCode('');
  }, []);

  const goRegister = useCallback(() => {
    setTab('register');
    setStep('registerChoice');
    setError('');
    setInfo('');
    setOtpCode('');
  }, []);

  const choosePhoneSignup = useCallback(async () => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const status = await smsStatus();
      if (!status.available) {
        setInfo(PHONE_SIGNUP_UNAVAILABLE);
        return;
      }
      setStep('phoneNumber');
    } catch {
      setInfo(PHONE_SIGNUP_UNAVAILABLE);
    } finally {
      setLoading(false);
    }
  }, []);

  const composedPhone = useCallback(() => {
    const raw = phoneLocal.trim();
    if (!raw) return '';
    if (raw.startsWith('+') || raw.startsWith('00')) return raw;
    return `${AR_DIAL}${raw}`;
  }, [phoneLocal]);

  const submitLogin = useCallback(async () => {
    setError('');
    if (!identifier.trim()) {
      setError('Escribe tu correo o número de celular');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    setLoading(true);
    try {
      await login(identifier.trim(), password);
    } catch (e: any) {
      setError(e?.message || 'Algo salió mal, intenta de nuevo');
    } finally {
      setLoading(false);
    }
  }, [identifier, password, login]);

  const submitEmailCredentials = useCallback(async () => {
    setError('');
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      setError('Escribe un correo válido');
      return;
    }
    const passErr = validatePasswordPair(password, password2);
    if (passErr) {
      setError(passErr);
      return;
    }
    setLoading(true);
    try {
      const check = await auth.checkEmail(normalized);
      if (!check.available) {
        setError('Ese correo ya está en uso');
        return;
      }
      setEmail(normalized);
      setStep('emailUsername');
    } catch (e: any) {
      setError(e?.message || 'No se pudo validar el correo');
    } finally {
      setLoading(false);
    }
  }, [email, password, password2]);

  const submitEmailUsername = useCallback(async () => {
    setError('');
    const u = normalizePublicUsername(username);
    if (!isValidPublicUsername(u)) {
      setError(
        isReservedPublicUsername(u)
          ? 'Ese nombre de usuario no está disponible'
          : 'El usuario debe tener 3-20 caracteres: letras, números, punto o guion bajo'
      );
      return;
    }
    setLoading(true);
    try {
      const check = await db.checkProfileUsername(u);
      if (!check.available) {
        setError(
          check.reason === 'reserved'
            ? 'Ese nombre de usuario no está disponible'
            : 'Ese nombre de usuario ya está en uso'
        );
        return;
      }
      await registerEmail(normalizeEmail(email), password, u);
    } catch (e: any) {
      setError(e?.message || 'Algo salió mal, intenta de nuevo');
    } finally {
      setLoading(false);
    }
  }, [username, email, password, registerEmail]);

  const submitPhoneNumber = useCallback(async () => {
    setError('');
    const n = normalizePhone(composedPhone());
    if (!n) {
      setError('Escribe un número de celular válido');
      return;
    }
    if (lockedPhone && lockedPhone !== n) {
      setPhoneTicket('');
      setLockedPhone(null);
    }
    setLoading(true);
    try {
      await sendVerificationCode(n, 'signup');
      setLockedPhone(n);
      setOtpCode('');
      setStep('phoneOtp');
    } catch (e: any) {
      const msg = String(e?.message || '');
      setError(/SMS no disponible|503/i.test(msg) ? PHONE_SIGNUP_UNAVAILABLE : (msg || PHONE_SIGNUP_UNAVAILABLE));
    } finally {
      setLoading(false);
    }
  }, [composedPhone, lockedPhone]);

  const submitPhoneOtp = useCallback(async () => {
    setError('');
    if (!lockedPhone) {
      setError('Solicitá un código primero.');
      return;
    }
    if (!/^\d{6}$/.test(otpCode.trim())) {
      setError('El código tiene 6 dígitos');
      return;
    }
    setLoading(true);
    try {
      const result = await verifyCode(lockedPhone, otpCode.trim(), 'signup');
      if (!result.ticket) {
        setError('No se pudo verificar el número');
        return;
      }
      setPhoneTicket(result.ticket);
      setStep('phonePassword');
    } catch (e: any) {
      setError(e?.message || 'Código incorrecto');
    } finally {
      setLoading(false);
    }
  }, [lockedPhone, otpCode]);

  const resendPhoneOtp = useCallback(async () => {
    if (!lockedPhone) return;
    setError('');
    setLoading(true);
    try {
      await sendVerificationCode(lockedPhone, 'signup');
    } catch (e: any) {
      setError(e?.message || 'No se pudo reenviar el código');
    } finally {
      setLoading(false);
    }
  }, [lockedPhone]);

  const submitPhonePassword = useCallback(() => {
    setError('');
    const passErr = validatePasswordPair(password, password2);
    if (passErr) {
      setError(passErr);
      return;
    }
    setStep('phoneUsername');
  }, [password, password2]);

  const submitPhoneUsername = useCallback(async () => {
    setError('');
    if (!lockedPhone || !phoneTicket) {
      setError('Verificá tu teléfono antes de crear la cuenta');
      setStep('phoneNumber');
      return;
    }
    const u = normalizePublicUsername(username);
    if (!isValidPublicUsername(u)) {
      setError(
        isReservedPublicUsername(u)
          ? 'Ese nombre de usuario no está disponible'
          : 'El usuario debe tener 3-20 caracteres: letras, números, punto o guion bajo'
      );
      return;
    }
    setLoading(true);
    try {
      const check = await db.checkProfileUsername(u);
      if (!check.available) {
        setError(
          check.reason === 'reserved'
            ? 'Ese nombre de usuario no está disponible'
            : 'Ese nombre de usuario ya está en uso'
        );
        return;
      }
      await registerPhone(lockedPhone, password, u, phoneTicket);
    } catch (e: any) {
      setError(e?.message || 'Algo salió mal, intenta de nuevo');
    } finally {
      setLoading(false);
    }
  }, [lockedPhone, phoneTicket, username, password, registerPhone]);

  const onPrimary = useCallback(() => {
    if (step === 'login') return submitLogin();
    if (step === 'emailCredentials') return submitEmailCredentials();
    if (step === 'emailUsername') return submitEmailUsername();
    if (step === 'phoneNumber') return submitPhoneNumber();
    if (step === 'phoneOtp') return submitPhoneOtp();
    if (step === 'phonePassword') return submitPhonePassword();
    if (step === 'phoneUsername') return submitPhoneUsername();
  }, [
    step,
    submitLogin,
    submitEmailCredentials,
    submitEmailUsername,
    submitPhoneNumber,
    submitPhoneOtp,
    submitPhonePassword,
    submitPhoneUsername,
  ]);

  const primaryLabel =
    step === 'login'
      ? 'Entrar'
      : step === 'phoneOtp'
        ? 'Verificar'
        : step === 'emailUsername' || step === 'phoneUsername'
          ? 'Crear mi cuenta'
          : 'Continuar';

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

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, tab === 'login' && styles.tabActive]}
          onPress={goLogin}
        >
          <Text style={[styles.tabText, tab === 'login' && styles.tabTextActive]}>
            Iniciar sesión
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'register' && styles.tabActive]}
          onPress={goRegister}
        >
          <Text style={[styles.tabText, tab === 'register' && styles.tabTextActive]}>
            Crear cuenta
          </Text>
        </Pressable>
      </View>

      {step === 'login' && (
        <>
          <View style={styles.inputWrap}>
            <Ionicons name="person-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.input}
              placeholder="Correo o número de celular"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={identifier}
              onChangeText={setIdentifier}
              returnKeyType="next"
            />
          </View>
          <PasswordField
            value={password}
            onChangeText={setPassword}
            showPass={showPass}
            onToggle={() => setShowPass((s) => !s)}
            onSubmit={onPrimary}
          />
        </>
      )}

      {step === 'registerChoice' && (
        <>
          <Text style={styles.stepTitle}>¿Cómo quieres continuar?</Text>
          <Pressable style={styles.choiceBtn} onPress={() => { setError(''); setStep('emailCredentials'); }}>
            <Ionicons name="mail-outline" size={22} color={colors.primary} />
            <Text style={styles.choiceText}>Correo electrónico</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
          <Pressable style={styles.choiceBtn} onPress={choosePhoneSignup} disabled={loading}>
            <Ionicons name="phone-portrait-outline" size={22} color={colors.primary} />
            <Text style={styles.choiceText}>Número de celular</Text>
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            )}
          </Pressable>
          <Pressable onPress={goLogin} hitSlop={8}>
            <Text style={styles.switchLink}>¿Ya tienes cuenta? Iniciar sesión</Text>
          </Pressable>
        </>
      )}

      {step === 'emailCredentials' && (
        <>
          <Text style={styles.stepTitle}>Correo electrónico</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.input}
              placeholder="Correo electrónico"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              returnKeyType="next"
            />
          </View>
          <PasswordField
            value={password}
            onChangeText={setPassword}
            showPass={showPass}
            onToggle={() => setShowPass((s) => !s)}
            placeholder="Contraseña"
          />
          <PasswordField
            value={password2}
            onChangeText={setPassword2}
            showPass={showPass}
            onToggle={() => setShowPass((s) => !s)}
            placeholder="Repetir contraseña"
            onSubmit={onPrimary}
          />
        </>
      )}

      {(step === 'emailUsername' || step === 'phoneUsername') && (
        <>
          <Text style={styles.stepTitle}>Elige tu nombre de usuario</Text>
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
              returnKeyType="go"
              onSubmitEditing={onPrimary}
            />
          </View>
        </>
      )}

      {step === 'phoneNumber' && (
        <>
          <Text style={styles.stepTitle}>Número de celular</Text>
          <View style={styles.phoneRow}>
            <View style={styles.dialWrap}>
              <Text style={styles.dialFlag}>AR</Text>
              <Text style={styles.dialCode}>{AR_DIAL}</Text>
            </View>
            <View style={[styles.inputWrap, styles.phoneInput]}>
              <Ionicons name="call-outline" size={18} color={colors.textMuted} />
              <TextInput
                style={styles.input}
                placeholder="387 519 7086"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                value={phoneLocal}
                onChangeText={(t) => {
                  setPhoneLocal(t);
                  setPhoneTicket('');
                  setLockedPhone(null);
                }}
                returnKeyType="go"
                onSubmitEditing={onPrimary}
              />
            </View>
          </View>
        </>
      )}

      {step === 'phoneOtp' && (
        <>
          <Text style={styles.stepTitle}>Código de verificación</Text>
          <Text style={styles.stepHint}>
            Ingresá el código de 6 dígitos enviado a {lockedPhone}.
          </Text>
          <View style={styles.inputWrap}>
            <Ionicons name="keypad-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="••••••"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              value={otpCode}
              onChangeText={setOtpCode}
              returnKeyType="go"
              onSubmitEditing={onPrimary}
            />
          </View>
          <Pressable onPress={resendPhoneOtp} disabled={loading} hitSlop={8}>
            <Text style={styles.switchLink}>Reenviar código</Text>
          </Pressable>
        </>
      )}

      {step === 'phonePassword' && (
        <>
          <Text style={styles.stepTitle}>Creá tu contraseña</Text>
          <PasswordField
            value={password}
            onChangeText={setPassword}
            showPass={showPass}
            onToggle={() => setShowPass((s) => !s)}
            placeholder="Contraseña"
          />
          <PasswordField
            value={password2}
            onChangeText={setPassword2}
            showPass={showPass}
            onToggle={() => setShowPass((s) => !s)}
            placeholder="Repetir contraseña"
            onSubmit={onPrimary}
          />
        </>
      )}

      {info !== '' && (
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={15} color={colors.secondary} />
          <Text style={styles.infoText}>{info}</Text>
        </View>
      )}

      {error !== '' && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={15} color={colors.heart} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {step !== 'registerChoice' && (
        <Pressable style={styles.primaryBtn} onPress={onPrimary} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
          )}
        </Pressable>
      )}

      {step !== 'login' && step !== 'registerChoice' && (
        <Pressable onPress={goRegister} hitSlop={8}>
          <Text style={styles.hint}>Volver</Text>
        </Pressable>
      )}

      {step === 'login' && (
        <Text style={styles.hint}>¿Primera vez? Toca &quot;Crear cuenta&quot; para unirte en segundos.</Text>
      )}
    </View>
  );

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

function PasswordField({
  value,
  onChangeText,
  showPass,
  onToggle,
  placeholder = 'Contraseña',
  onSubmit,
}: {
  value: string;
  onChangeText: (t: string) => void;
  showPass: boolean;
  onToggle: () => void;
  placeholder?: string;
  onSubmit?: () => void;
}) {
  return (
    <View style={styles.inputWrap}>
      <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={!showPass}
        autoCapitalize="none"
        value={value}
        onChangeText={onChangeText}
        returnKeyType={onSubmit ? 'go' : 'next'}
        onSubmitEditing={onSubmit}
      />
      <Pressable onPress={onToggle} hitSlop={8}>
        <Ionicons
          name={showPass ? 'eye-off-outline' : 'eye-outline'}
          size={18}
          color={colors.textMuted}
        />
      </Pressable>
    </View>
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
  dtFormCol: { width: 560, justifyContent: 'center' },
  dtFormScroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 48, paddingHorizontal: spacing.lg },
  cardDesktop: { marginHorizontal: 0, marginTop: 0, width: '100%', alignSelf: 'stretch' },
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
    marginHorizontal: spacing.lg,
    marginTop: -24,
    borderRadius: radius.lg,
    padding: spacing.lg,
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
  stepTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.md,
  },
  stepHint: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
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
  codeInput: { letterSpacing: 8, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 0 },
  dialWrap: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  dialFlag: { fontSize: 11, fontWeight: '800', color: colors.textMuted },
  dialCode: { fontSize: 15, fontWeight: '800', color: colors.text },
  phoneInput: { flex: 1, marginBottom: spacing.md },
  choiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: 16,
    marginBottom: spacing.md,
  },
  choiceText: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  switchLink: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.secondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.secondarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  infoText: { color: colors.text, fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 18 },
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
