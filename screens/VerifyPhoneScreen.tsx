import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { sendVerificationCode, verifyCode } from '../lib/api';
import { normalizePhone } from '../lib/phone';
import { useStore } from '../lib/store';
import { colors, spacing, radius, shadow } from '../lib/theme';

type Step = 'phone' | 'code' | 'done';

export default function VerifyPhoneScreen() {
  const navigation = useNavigation<any>();
  const { setVerifiedPhone } = useStore();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [lockedPhone, setLockedPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const sendCode = useCallback(async () => {
    const n = normalizePhone(phone);
    if (!n) {
      setError('Ingresá un celular argentino válido, ej. 3875197086');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await sendVerificationCode(n, 'verify_phone');
      setLockedPhone(n);
      setInfo(`Enviamos un SMS a ${n}`);
      setStep('code');
    } catch (e: any) {
      setError(e?.message || 'SMS no disponible');
    } finally {
      setLoading(false);
    }
  }, [phone]);

  const confirm = useCallback(async () => {
    if (code.trim().length !== 6) {
      setError('El código tiene 6 dígitos');
      return;
    }
    if (!lockedPhone) return;
    setError('');
    setLoading(true);
    try {
      const result = await verifyCode(lockedPhone, code.trim(), 'verify_phone');
      if (result.ok && result.ticket) {
        setVerifiedPhone(lockedPhone, result.ticket);
        setStep('done');
      } else {
        setError(result.error || 'Código incorrecto');
      }
    } catch (e: any) {
      setError(e?.message || 'Código incorrecto');
    } finally {
      setLoading(false);
    }
  }, [code, lockedPhone, setVerifiedPhone]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.body}>
          <View style={styles.iconCircle}>
            <Ionicons
              name={step === 'done' ? 'shield-checkmark' : 'chatbubble-ellipses'}
              size={38}
              color={colors.primary}
            />
          </View>

          {step === 'phone' && (
            <>
              <Text style={styles.title}>Verifica tu cuenta</Text>
              <Text style={styles.subtitle}>
                Te enviaremos un código por SMS para confirmar que eres tú.
              </Text>
              <View style={styles.inputWrap}>
                <Ionicons name="call-outline" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.input}
                  placeholder="387 519 7086"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  autoFocus
                  returnKeyType="send"
                  onSubmitEditing={sendCode}
                />
              </View>
              <Pressable style={styles.primaryBtn} onPress={sendCode} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Enviar código</Text>
                )}
              </Pressable>
            </>
          )}

          {step === 'code' && (
            <>
              <Text style={styles.title}>Ingresa el código</Text>
              <Text style={styles.subtitle}>{info}</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="keypad-outline" size={18} color={colors.textMuted} />
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  placeholder="••••••"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={code}
                  onChangeText={setCode}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={confirm}
                />
              </View>
              <Pressable style={styles.primaryBtn} onPress={confirm} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Verificar</Text>
                )}
              </Pressable>
              <Pressable onPress={() => { setStep('phone'); setCode(''); setError(''); setLockedPhone(null); }}>
                <Text style={styles.linkText}>Cambiar número</Text>
              </Pressable>
            </>
          )}

          {step === 'done' && (
            <>
              <Text style={styles.title}>¡Cuenta verificada! 🎉</Text>
              <Text style={styles.subtitle}>
                Tu número quedó confirmado. Ahora tu perfil muestra la insignia de verificación.
              </Text>
              <Pressable style={styles.primaryBtn} onPress={() => navigation.goBack()}>
                <Text style={styles.primaryBtnText}>Volver al perfil</Text>
              </Pressable>
            </>
          )}

          {error !== '' && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.heart} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, alignItems: 'center', padding: spacing.xl, paddingTop: 48 },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primarysoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  title: { fontSize: 24, fontWeight: '900', color: colors.text, textAlign: 'center' },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    lineHeight: 20,
    maxWidth: 320,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: 4,
    width: '100%',
    maxWidth: 340,
    ...shadow.card,
  },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 12 },
  codeInput: { letterSpacing: 10, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    marginTop: spacing.lg,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  linkText: { color: colors.secondary, fontWeight: '700', fontSize: 14, marginTop: spacing.lg },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.lg,
    backgroundColor: '#FFE8EC',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  errorText: { color: colors.heart, fontSize: 13, fontWeight: '600' },
});
