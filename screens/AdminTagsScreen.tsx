// ============================================================
// Animaldex — Panel de administrador: chapitas QR
// ============================================================
// Solo visible/accesible para ADMIN_USERNAMES (ver worker/index.js).
// Permite generar nuevos links de invitación (?qr=<code>), ver su
// código QR listo para imprimir, copiarlo/compartirlo, y ver el estado
// de todas las chapitas generadas (disponible / asignada a qué mascota).
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Share,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { db, ApiTag } from '../lib/db';
import { useStore } from '../lib/store';
import { TAG_CODE_INVALID, TAG_CODE_REQUIRED, buildTagUrl, parseManualTagCode, qrImageUrl } from '../lib/tags';
import { thumb, petFallbackAvatar } from '../lib/images';
import { colors, spacing, radius, shadow } from '../lib/theme';
import { RootStackParamList } from '../lib/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const ADMIN_USERNAME = 'lucasfuentes';

export default function AdminTagsScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useStore();
  const [tags, setTags] = useState<ApiTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [draftCode, setDraftCode] = useState('');
  const [newCode, setNewCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isAdmin = user?.username === ADMIN_USERNAME;

  const load = useCallback(async () => {
    try {
      const res = await db.listTags();
      setTags(res.tags);
    } catch {
      // silencioso: si no es admin, el backend ya rechazó la petición
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
    else setLoading(false);
  }, [isAdmin, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const generate = useCallback(async () => {
    const parsed = parseManualTagCode(draftCode);
    if (!String(draftCode).trim()) {
      Alert.alert('Código QR', TAG_CODE_REQUIRED);
      return;
    }
    if (!parsed) {
      Alert.alert('Código QR', TAG_CODE_INVALID);
      return;
    }
    setGenerating(true);
    setCopied(false);
    try {
      const res = await db.createTag(parsed);
      setNewCode(res.code);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo generar el link');
    } finally {
      setGenerating(false);
    }
  }, [draftCode, load]);

  const copyLink = useCallback(async (code: string) => {
    await Clipboard.setStringAsync(buildTagUrl(code));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, []);

  const shareLink = useCallback(async (code: string) => {
    try {
      await Share.share({
        message: `🐾 Registra a tu mascota en Animaldex escaneando esta chapita: ${buildTagUrl(code)}`,
        url: buildTagUrl(code),
      });
    } catch {}
  }, []);

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
          <Text style={styles.restrictedTitle}>Acceso restringido</Text>
          <Text style={styles.restrictedText}>
            Solo el administrador puede generar chapitas QR.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderTag = ({ item }: { item: ApiTag }) => {
    const claimed = item.status === 'claimed';
    return (
      <View style={styles.tagRow}>
        <View style={[styles.codeBadge, claimed ? styles.codeBadgeClaimed : styles.codeBadgeFree]}>
          <Text style={styles.codeBadgeText}>#{item.code}</Text>
        </View>

        {claimed ? (
          <Pressable
            style={styles.tagInfo}
            onPress={() => item.petId && navigation.navigate('PetProfile', { petId: item.petId })}
          >
            <Image
              source={{ uri: thumb(item.petAvatar || petFallbackAvatar(item.petName || 'pet'), 60) }}
              style={styles.petAvatar}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.petName} numberOfLines={1}>
                {item.petEmoji} {item.petName}
              </Text>
              <Text style={styles.statusClaimed}>Asignada</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ) : (
          <View style={styles.tagInfo}>
            <View style={styles.pendingIcon}>
              <Ionicons name="qr-code-outline" size={18} color={colors.secondary} />
            </View>
            <Text style={styles.statusFree}>Disponible, sin asignar</Text>
          </View>
        )}

        <Pressable style={styles.rowIconBtn} onPress={() => copyLink(item.code)} hitSlop={8}>
          <Ionicons name="copy-outline" size={18} color={colors.text} />
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={tags}
        keyExtractor={(t) => String(t.code)}
        renderItem={renderTag}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Chapitas QR</Text>
            <Text style={styles.headerSub}>
              Genera un link único, conviértelo en código QR e imprímelo en una chapita física. La
              primera persona que la escanee podrá registrar la mascota; después, cada escaneo lleva
              directo a su perfil.
            </Text>

            <Text style={styles.codeLabel}>Código QR</Text>
            <TextInput
              style={styles.codeInput}
              value={draftCode}
              onChangeText={(t) => setDraftCode(t.replace(/\s+/g, ''))}
              placeholder="AAA123"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
            />

            <Pressable style={styles.generateBtn} onPress={generate} disabled={generating}>
              {generating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="add-circle" size={18} color="#fff" />
                  <Text style={styles.generateBtnText}>Generar nuevo link</Text>
                </>
              )}
            </Pressable>

            {newCode != null && (
              <View style={styles.newTagCard}>
                <Text style={styles.successTitle}>✅ Link generado correctamente</Text>
                <Image source={{ uri: qrImageUrl(buildTagUrl(newCode)) }} style={styles.qrImage} />
                <Text style={styles.newTagUrl} selectable numberOfLines={2}>
                  {buildTagUrl(newCode)}
                </Text>
                <View style={styles.newTagActions}>
                  <Pressable style={styles.secondaryBtn} onPress={() => copyLink(newCode)}>
                    <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={colors.text} />
                    <Text style={styles.secondaryBtnText}>{copied ? 'Copiado' : 'Copiar link'}</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryBtn} onPress={() => shareLink(newCode)}>
                    <Ionicons name="share-social-outline" size={16} color={colors.text} />
                    <Text style={styles.secondaryBtnText}>Compartir</Text>
                  </Pressable>
                </View>
              </View>
            )}

            <Text style={styles.listTitle}>
              Todas las chapitas {tags.length > 0 ? `(${tags.length})` : ''}
            </Text>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <Text style={styles.emptyText}>Aún no has generado ninguna chapita.</Text>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl },
  restrictedTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  restrictedText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  list: { padding: spacing.lg, paddingBottom: 60 },
  header: { marginBottom: spacing.md },
  headerTitle: { fontSize: 22, fontWeight: '900', color: colors.text },
  headerSub: { fontSize: 13, color: colors.textMuted, marginTop: 6, lineHeight: 19 },
  codeLabel: { fontWeight: '700', fontSize: 14, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  codeInput: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.text,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    marginTop: spacing.lg,
    ...shadow.card,
  },
  generateBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  newTagCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  qrImage: { width: 180, height: 180, borderRadius: radius.sm },
  successTitle: { fontSize: 16, fontWeight: '800', color: colors.text, textAlign: 'center' },
  newTagUrl: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  newTagActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bg,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '700', color: colors.text },
  listTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm },
  emptyText: { textAlign: 'center', color: colors.textMuted, marginTop: 40, fontSize: 14 },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    minWidth: 48,
    alignItems: 'center',
  },
  codeBadgeFree: { backgroundColor: colors.secondarySoft },
  codeBadgeClaimed: { backgroundColor: colors.primarysoft },
  codeBadgeText: { fontWeight: '800', fontSize: 12, color: colors.text },
  tagInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  petAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.border },
  petName: { fontSize: 14, fontWeight: '700', color: colors.text },
  statusClaimed: { fontSize: 12, color: colors.secondary, fontWeight: '600', marginTop: 1 },
  statusFree: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  pendingIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.secondarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconBtn: { padding: 6 },
});
