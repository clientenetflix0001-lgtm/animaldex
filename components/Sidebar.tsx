// Sidebar de navegación para escritorio (estilo Instagram).
// Se usa como tabBar del Tab.Navigator en pantallas grandes:
// - modo 'rail' (laptop): solo íconos, 76px
// - modo 'full' (desktop/wide): íconos + etiquetas, 244px
import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useStore } from '../lib/store';
import { useNotifications } from '../lib/realtime';
import { userFallbackAvatar, thumb } from '../lib/images';
import { colors, radius, spacing } from '../lib/theme';
import { SIDEBAR_FULL, SIDEBAR_RAIL } from '../lib/responsive';

export const TAB_ICONS: Record<string, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  Inicio: { on: 'home', off: 'home-outline' },
  Reels: { on: 'film', off: 'film-outline' },
  Alertas: { on: 'warning', off: 'warning-outline' },
  Explorar: { on: 'compass', off: 'compass-outline' },
  Crear: { on: 'add-circle', off: 'add-circle-outline' },
  Actividad: { on: 'heart', off: 'heart-outline' },
  Perfil: { on: 'person', off: 'person-outline' },
};

const LABELS: Record<string, string> = {
  Inicio: 'Inicio',
  Reels: 'Reels',
  Alertas: 'Alertas',
  Explorar: 'Explorar',
  Crear: 'Crear',
  Actividad: 'Actividad',
  Perfil: 'Perfil',
};

interface Props {
  state: any;
  navigation: any;
  mode: 'rail' | 'full';
}

export function Sidebar({ state, navigation, mode }: Props) {
  const { user, logout } = useStore();
  const { unread } = useNotifications();
  const full = mode === 'full';

  const confirmLogout = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('¿Cerrar sesión?')) logout();
    } else {
      logout();
    }
  };

  return (
    <View style={[styles.bar, { width: full ? SIDEBAR_FULL : SIDEBAR_RAIL }]}>
      {/* Logo */}
      <Pressable
        style={[styles.logoRow, !full && styles.logoRail]}
        onPress={() => navigation.navigate('Inicio')}
      >
        <Text style={styles.logoEmoji}>🐾</Text>
        {full && <Text style={styles.logoText}>Animaldex</Text>}
      </Pressable>

      {/* Navegación */}
      <View style={styles.nav}>
        {state.routes.map((route: any, idx: number) => {
          const active = state.index === idx;
          const icons = TAB_ICONS[route.name];
          if (!icons) return null;
          return (
            <Pressable
              key={route.key}
              onPress={() => navigation.navigate(route.name)}
              style={(st: any) => [
                styles.item,
                !full && styles.itemRail,
                (st.hovered || st.pressed) && styles.itemHover,
              ]}
            >
              <View>
                <Ionicons
                  name={active ? icons.on : icons.off}
                  size={26}
                  color={active ? colors.primary : colors.text}
                />
                {route.name === 'Actividad' && unread > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
                  </View>
                )}
              </View>
              {full && (
                <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>
                  {LABELS[route.name] ?? route.name}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={{ flex: 1 }} />

      {/* Panel de administrador (solo lucasfuentes) */}
      {user?.username === 'lucasfuentes' && (
        <Pressable
          style={(st: any) => [
            styles.item,
            !full && styles.itemRail,
            (st.hovered || st.pressed) && styles.itemHover,
          ]}
          onPress={() => navigation.navigate('AdminTags')}
        >
          <Ionicons name="qr-code-outline" size={24} color={colors.text} />
          {full && <Text style={styles.itemLabel}>Chapitas QR</Text>}
        </Pressable>
      )}

      {/* Usuario + salir */}
      <View style={[styles.userBlock, !full && styles.userBlockRail]}>
        <Pressable
          style={(st: any) => [
            styles.userRow,
            !full && styles.itemRail,
            (st.hovered || st.pressed) && styles.itemHover,
          ]}
          onPress={() => navigation.navigate('Perfil')}
        >
          <Image
            source={{ uri: thumb(user?.avatarUrl ?? userFallbackAvatar(user?.username ?? 'yo'), 80) }}
            style={styles.userAvatar}
            transition={200}
          />
          {full && (
            <View style={{ flex: 1 }}>
              <Text style={styles.userName} numberOfLines={1}>
                {user?.name ?? 'Mi perfil'}
              </Text>
              <Text style={styles.userHandle} numberOfLines={1}>
                @{user?.username ?? ''}
              </Text>
            </View>
          )}
        </Pressable>
        <Pressable
          style={(st: any) => [
            styles.item,
            !full && styles.itemRail,
            (st.hovered || st.pressed) && styles.itemHover,
          ]}
          onPress={confirmLogout}
        >
          <Ionicons name="log-out-outline" size={24} color={colors.textMuted} />
          {full && <Text style={styles.logoutLabel}>Cerrar sesión</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    zIndex: 100,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  logoRail: { justifyContent: 'center', paddingHorizontal: 0 },
  logoEmoji: { fontSize: 26 },
  logoText: { fontSize: 24, fontWeight: '900', color: colors.primary, letterSpacing: -0.5 },
  nav: { gap: 4 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  itemRail: { justifyContent: 'center', paddingHorizontal: 0 },
  itemHover: { backgroundColor: colors.bg },
  itemLabel: { fontSize: 16, color: colors.text, fontWeight: '500' },
  itemLabelActive: { fontWeight: '800', color: colors.text },
  userBlock: { gap: 4 },
  userBlockRail: { alignItems: 'stretch' },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  userAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.border },
  userName: { fontSize: 14, fontWeight: '700', color: colors.text },
  userHandle: { fontSize: 12, color: colors.textMuted },
  logoutLabel: { fontSize: 14, color: colors.textMuted, fontWeight: '500' },
  badge: {
    position: 'absolute',
    top: -5,
    right: -8,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: colors.heart,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.card,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
