import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing } from '../../lib/theme';
import { useProfiles } from './ProfileContext';
import { limitMessage, type ProfileType, type PublicProfile } from './profileTypes';
import BioField from '../../components/BioField';
import { isBioWithinWordLimit, BIO_WORD_LIMIT_ERROR } from '../../lib/bio';
import { isValidPublicUsername, normalizePublicUsername } from '../../lib/publicHandles';
import { ADOPTION_CONTACT_REQUIRED, parseProtectorAdoptionContact } from '../../lib/adoptionContact';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated?: (profile: PublicProfile) => void;
  initialType?: Exclude<ProfileType, 'personal'> | null;
  lockType?: boolean;
}

export default function CreateProfileSheet({ visible, onClose, onCreated, initialType, lockType }: Props) {
  const { canCreate, createProfile } = useProfiles();
  const [step, setStep] = useState<'pick' | 'form'>('pick');
  const [type, setType] = useState<Exclude<ProfileType, 'personal'> | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [adoptionWhatsapp, setAdoptionWhatsapp] = useState('');
  const [adoptionPhone, setAdoptionPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStep('pick');
    setType(null);
    setName('');
    setUsername('');
    setBio('');
    setAdoptionWhatsapp('');
    setAdoptionPhone('');
    setSaving(false);
  };

  useEffect(() => {
    if (!visible) return;
    setName('');
    setUsername('');
    setBio('');
    setAdoptionWhatsapp('');
    setAdoptionPhone('');
    setSaving(false);
    if (initialType) {
      setType(initialType);
      setStep('form');
    } else {
      setType(null);
      setStep('pick');
    }
  }, [visible, initialType]);

  const close = () => {
    reset();
    onClose();
  };

  const pick = (next: Exclude<ProfileType, 'personal'>) => {
    if (!canCreate(next)) {
      Alert.alert('Límite alcanzado', limitMessage(next));
      return;
    }
    setType(next);
    setStep('form');
  };

  const submit = async () => {
    if (!type) return;
    const handle = normalizePublicUsername(username);
    if (name.trim().length < 2) {
      Alert.alert('Falta el nombre', 'Escribe el nombre de la página.');
      return;
    }
    if (!isValidPublicUsername(handle)) {
      Alert.alert(
        'Usuario inválido',
        'El @ debe tener 3-20 caracteres: letras, números, punto o guion bajo, y no puede coincidir con una ruta del sistema.'
      );
      return;
    }
    if (!isBioWithinWordLimit(bio)) {
      Alert.alert('Biografía', BIO_WORD_LIMIT_ERROR);
      return;
    }
    if (type === 'protector') {
      const contact = parseProtectorAdoptionContact(type, adoptionWhatsapp, adoptionPhone);
      if (!contact.ok) {
        Alert.alert('Falta un contacto', contact.error || ADOPTION_CONTACT_REQUIRED);
        return;
      }
    }
    setSaving(true);
    try {
      const created = await createProfile({
        type,
        name: name.trim(),
        username: handle,
        bio: bio.trim(),
        adoptionWhatsapp: type === 'protector' ? adoptionWhatsapp.trim() : undefined,
        adoptionPhone: type === 'protector' ? adoptionPhone.trim() : undefined,
      });
      onCreated?.(created);
      close();
    } catch (e: any) {
      Alert.alert('No se pudo crear', e?.message || 'Inténtalo de nuevo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {step === 'pick' ? (
            <>
              <Text style={styles.title}>¿Qué página quieres crear?</Text>
              <Pressable style={styles.option} onPress={() => pick('business')}>
                <Text style={styles.optionEmoji}>🏪</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>Empresa / Tienda</Text>
                  <Text style={styles.optionSub}>Hasta 2 por cuenta</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
              <Pressable style={styles.option} onPress={() => pick('protector')}>
                <Text style={styles.optionEmoji}>❤️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>Bienestar Animal</Text>
                  <Text style={styles.optionSub}>Hasta 2 por cuenta</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            </>
          ) : (
            <>
              {!lockType ? (
                <Pressable onPress={() => setStep('pick')} style={styles.back}>
                  <Ionicons name="chevron-back" size={18} color={colors.primary} />
                  <Text style={styles.backText}>Volver</Text>
                </Pressable>
              ) : null}
              <Text style={styles.title}>
                {type === 'business' ? 'Nueva página empresarial' : 'Nueva página de Bienestar Animal'}
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Nombre"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder="@usuario"
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
              <BioField
                value={bio}
                onChangeText={setBio}
                placeholder="Bio (opcional)"
                style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
              />
              {type === 'protector' ? (
                <View>
                  <Text style={styles.sectionTitle}>SOLICITUDES DE ADOPCIÓN</Text>
                  <Text style={styles.help}>
                    Agregá al menos un medio de contacto para recibir solicitudes de adopción.
                  </Text>
                  <Text style={styles.fieldLabel}>WhatsApp</Text>
                  <TextInput
                    value={adoptionWhatsapp}
                    onChangeText={setAdoptionWhatsapp}
                    placeholder="Número de WhatsApp"
                    keyboardType="phone-pad"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                  />
                  <Text style={styles.fieldLabel}>Teléfono</Text>
                  <TextInput
                    value={adoptionPhone}
                    onChangeText={setAdoptionPhone}
                    placeholder="Número de teléfono"
                    keyboardType="phone-pad"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                  />
                </View>
              ) : null}
              <Pressable style={styles.save} onPress={submit} disabled={saving || !isBioWithinWordLimit(bio)}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Crear página</Text>}
              </Pressable>
            </>
          )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(45,32,22,0.35)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: spacing.lg,
    paddingBottom: 32,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: colors.text,
    marginTop: 6,
    marginBottom: 6,
  },
  help: { fontSize: 12, color: colors.textMuted, marginBottom: 10, lineHeight: 17 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    marginBottom: 10,
  },
  optionEmoji: { fontSize: 22 },
  optionTitle: { fontWeight: '800', color: colors.text, fontSize: 15 },
  optionSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backText: { color: colors.primary, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  save: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 6,
  },
  saveText: { color: '#fff', fontWeight: '800' },
});
