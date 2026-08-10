// ============================================================
// Animaldex — Pantalla de bienvenida al escanear una chapita QR
// ============================================================
// Solo se muestra cuando el usuario YA está autenticado (si no lo
// estaba, el flujo pasa primero por AuthScreen, que muestra un banner
// avisando que hay una chapita pendiente, y llega aquí automáticamente
// después de iniciar sesión/registrarse).
//
// Comportamiento:
// - Chapita ya asignada a una mascota → redirige directo a su perfil.
// - Chapita nueva/sin asignar → muestra el mensaje de bienvenida y
//   lleva al formulario de registro de mascota (que al guardar,
//   vincula automáticamente esta chapita).
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { db } from '../lib/db';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function TagWelcomeScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'TagWelcome'>>();
  const { code } = route.params;

  const [state, setState] = useState<'loading' | 'unclaimed' | 'claimed' | 'invalid' | 'error'>('loading');

  const check = useCallback(async () => {
    setState('loading');
    try {
      const res = await db.tagStatus(code);
      if (!res.exists) {
        setState('invalid');
        return;
      }
      if (res.status === 'claimed' && res.pet) {
        setState('claimed');
        // Pequeña pausa para que se note el mensaje antes de redirigir.
        setTimeout(() => {
          navigation.replace('PetProfile', { petId: res.pet!.id });
        }, 700);
        return;
      }
      setState('unclaimed');
    } catch {
      setState('error');
    }
  }, [code, navigation]);

  useEffect(() => {
    check();
  }, [check]);

  if (state === 'loading' || state === 'claimed') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>
            {state === 'claimed' ? 'Llevándote al perfil de la mascota…' : 'Verificando chapita…'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (state === 'invalid') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <View style={styles.iconWrapMuted}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
          </View>
          <Text style={styles.title}>Código no válido</Text>
          <Text style={styles.subtitle}>
            Esta chapita QR (#{code}) no existe en Animaldex. Verifica el enlace o contacta a quien te la entregó.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => navigation.replace('Tabs')}>
            <Text style={styles.primaryBtnText}>Ir al inicio</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (state === 'error') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <View style={styles.iconWrapMuted}>
            <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
          </View>
          <Text style={styles.title}>No se pudo verificar</Text>
          <Text style={styles.subtitle}>Revisa tu conexión e inténtalo de nuevo.</Text>
          <Pressable style={styles.primaryBtn} onPress={check}>
            <Text style={styles.primaryBtnText}>Reintentar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ---------- unclaimed: mensaje de bienvenida ----------
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <View style={styles.iconWrap}>
          <Text style={styles.pawEmoji}>🐾</Text>
        </View>
        <Text style={styles.title}>¡Escaneaste una chapita QR!</Text>
        <Text style={styles.subtitle}>
          Esta chapita (#{code}) todavía no tiene una mascota asignada. Completa estos datos para
          activarla: cada vez que alguien la escanee, llegará directo al perfil de tu mascota.
        </Text>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => navigation.replace('AddPet', { tagCode: code })}
        >
          <Ionicons name="paw" size={17} color="#fff" />
          <Text style={styles.primaryBtnText}>Registrar mi mascota</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  iconWrap: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.primarysoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  iconWrapMuted: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  pawEmoji: { fontSize: 44 },
  title: { fontSize: 21, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 340,
  },
  loadingText: { fontSize: 14, color: colors.textMuted, marginTop: spacing.sm },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 26,
    paddingVertical: 14,
    marginTop: spacing.md,
    ...shadow.card,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
