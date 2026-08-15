import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from '../../lib/store';
import type { ProfileType, PublicProfile } from './profileTypes';
import { countByType, limitMessage } from './profileTypes';
import { createSecondaryProfile, fetchMyProfiles } from './profileService';

const ACTIVE_KEY = 'animaldex-active-profile-id';

interface ProfileState {
  profiles: PublicProfile[];
  activeProfileId: string | null;
  activeProfile: PublicProfile | null;
  ready: boolean;
  setActiveProfileId: (id: string) => void;
  refreshProfiles: () => Promise<void>;
  createProfile: (input: {
    type: Exclude<ProfileType, 'personal'>;
    name: string;
    username: string;
    bio?: string;
    avatar?: string | null;
  }) => Promise<PublicProfile>;
  canCreate: (type: Exclude<ProfileType, 'personal'>) => boolean;
}

const ProfileContext = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useStore();
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [activeProfileId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const persist = useCallback((id: string | null) => {
    setActiveId(id);
    if (!id) AsyncStorage.removeItem(ACTIVE_KEY).catch(() => {});
    else AsyncStorage.setItem(ACTIVE_KEY, id).catch(() => {});
  }, []);

  const refreshProfiles = useCallback(async () => {
    if (!user) {
      setProfiles([]);
      persist(null);
      setReady(true);
      return;
    }
    try {
      const list = await fetchMyProfiles();
      setProfiles(list);
      const saved = await AsyncStorage.getItem(ACTIVE_KEY);
      const stillMine = list.find((p) => p.id === saved);
      const personal = list.find((p) => p.type === 'personal');
      persist(stillMine?.id ?? personal?.id ?? list[0]?.id ?? null);
    } catch {
      setProfiles([]);
    } finally {
      setReady(true);
    }
  }, [user, persist]);

  useEffect(() => {
    refreshProfiles();
  }, [refreshProfiles]);

  const setActiveProfileId = useCallback(
    (id: string) => {
      if (profiles.some((p) => p.id === id)) persist(id);
    },
    [profiles, persist]
  );

  const createProfile = useCallback(
    async (input: {
      type: Exclude<ProfileType, 'personal'>;
      name: string;
      username: string;
      bio?: string;
      avatar?: string | null;
    }) => {
      if (countByType(profiles, input.type) >= 2) {
        throw new Error(limitMessage(input.type));
      }
      const created = await createSecondaryProfile(input);
      await refreshProfiles();
      persist(created.id);
      return created;
    },
    [profiles, refreshProfiles, persist]
  );

  const canCreate = useCallback(
    (type: Exclude<ProfileType, 'personal'>) => countByType(profiles, type) < 2,
    [profiles]
  );

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? null,
    [profiles, activeProfileId]
  );

  const value = useMemo(
    () => ({
      profiles,
      activeProfileId,
      activeProfile,
      ready,
      setActiveProfileId,
      refreshProfiles,
      createProfile,
      canCreate,
    }),
    [profiles, activeProfileId, activeProfile, ready, setActiveProfileId, refreshProfiles, createProfile, canCreate]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfiles(): ProfileState {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    return {
      profiles: [],
      activeProfileId: null,
      activeProfile: null,
      ready: true,
      setActiveProfileId: () => {},
      refreshProfiles: async () => {},
      createProfile: async () => {
        throw new Error('ProfileProvider no está montado');
      },
      canCreate: () => false,
    };
  }
  return ctx;
}
