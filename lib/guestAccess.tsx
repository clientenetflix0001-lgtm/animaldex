import React, { useCallback, useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useStore } from './store';
import { GuestInviteBar } from '../components/GuestInviteBar';
import { colors } from './theme';
import { RootStackParamList } from './types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Acceso de invitado reutilizable para recursos públicos compartidos.
 * Un solo panel Únete a Animaldex (GuestInviteBar) en posts, perfiles y alertas.
 */
export function useGuestAccess(opts?: { headerClose?: boolean; treatAsExternal?: boolean }) {
  const navigation = useNavigation<Nav>();
  const { user } = useStore();
  const guest = !user;
  const cameFromLink = (opts?.treatAsExternal ?? true) && !navigation.canGoBack();
  const [inviteCollapsed, setInviteCollapsed] = useState(false);
  const requireLogin = useCallback(() => setInviteCollapsed(false), []);
  const goRegister = useCallback(() => navigation.navigate('Auth', { mode: 'register' }), [navigation]);
  const goLogin = useCallback(() => navigation.navigate('Auth', { mode: 'login' }), [navigation]);

  const closeExternal = useCallback(() => {
    if (user) navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
    else navigation.navigate('Auth');
  }, [navigation, user]);

  const goBackOrClose = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else closeExternal();
  }, [navigation, closeExternal]);

  useEffect(() => {
    if (!opts?.headerClose || guest || !cameFromLink) return;
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={closeExternal}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Cerrar y volver al inicio"
          style={{ paddingHorizontal: 4 }}
        >
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
      ),
    });
  }, [opts?.headerClose, guest, cameFromLink, navigation, closeExternal]);

  const inviteBar = guest ? (
    <GuestInviteBar
      collapsed={inviteCollapsed}
      onToggle={setInviteCollapsed}
      onLogin={goLogin}
      onRegister={goRegister}
    />
  ) : null;

  return {
    guest,
    user,
    cameFromLink,
    requireLogin,
    inviteBar,
    closeExternal,
    goBackOrClose,
  };
}

export function ExternalNavButton({
  guest,
  cameFromLink,
  showBack,
  onBack,
  onClose,
}: {
  guest: boolean;
  cameFromLink: boolean;
  showBack?: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  if (cameFromLink && !guest) {
    return (
      <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cerrar y volver al inicio">
        <Ionicons name="close" size={24} color={colors.text} />
      </Pressable>
    );
  }
  if (showBack || cameFromLink) {
    return (
      <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Atrás">
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
    );
  }
  return null;
}
