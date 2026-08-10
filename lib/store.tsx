import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Post, Comment, CURRENT_USER_ID } from './data';
import { auth, db, setToken, loadToken, ApiUser, ApiPet, ApiPost, timeAgoMinutes } from './db';

// Convierte un post de la API al formato interno de la app
export function apiPostToPost(p: ApiPost): Post {
  return {
    id: p.id,
    petId: p.petId,
    image: p.image,
    caption: p.caption,
    likes: p.likeCount,
    minutesAgo: timeAgoMinutes(p.createdAt),
    comments: [],
    real: true,
    authorUserId: p.userId,
    petName: p.petName ?? 'Mascota',
    petEmoji: p.petEmoji ?? '🐾',
    petSpecies: p.petSpecies ?? 'perro',
    petAvatarUrl: p.petAvatar,
    username: p.username ?? 'usuario',
    commentCount: p.commentCount,
  };
}

interface StoreState {
  // Sesión
  user: ApiUser | null;
  authReady: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  // Datos del usuario
  myPets: ApiPet[];
  refreshMyPets: () => Promise<void>;
  likedPosts: string[];
  savedPosts: string[];
  followedPets: string[];
  followedUsers: string[];
  verifiedPhone: string | null;
  // Acciones (persisten en D1)
  toggleLike: (postId: string) => void;
  toggleSave: (postId: string) => void;
  toggleFollowPet: (petId: string) => void;
  toggleFollowUser: (userId: string) => void;
  addComment: (postId: string, text: string) => void;
  setVerifiedPhone: (phone: string | null) => void;
  // Comentarios optimistas locales (mientras la red confirma)
  myComments: Record<string, Comment[]>;
  ready: boolean;
  // Publicaciones recién creadas por mí (para inserción incremental en el feed)
  createdPosts: Post[];
  notifyPostCreated: (post: Post) => void;
  consumeCreatedPosts: () => void;
  // Ediciones y borrados propios (actualización incremental en toda la app)
  deletedPostIds: string[];
  editedCaptions: Record<string, string>;
  markPostDeleted: (postId: string) => void;
  markPostEdited: (postId: string, caption: string) => void;
}

const StoreContext = createContext<StoreState | null>(null);

const LEGACY_KEY = 'petgram-store-v1';

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [myPets, setMyPets] = useState<ApiPet[]>([]);
  const [likedPosts, setLikedPosts] = useState<string[]>([]);
  const [savedPosts, setSavedPosts] = useState<string[]>([]);
  const [followedPets, setFollowedPets] = useState<string[]>([]);
  const [followedUsers, setFollowedUsers] = useState<string[]>([]);
  const [verifiedPhone, setVerifiedPhoneState] = useState<string | null>(null);
  const [myComments, setMyComments] = useState<Record<string, Comment[]>>({});
  const [ready, setReady] = useState(false);
  const [createdPosts, setCreatedPosts] = useState<Post[]>([]);
  const [deletedPostIds, setDeletedPostIds] = useState<string[]>([]);
  const [editedCaptions, setEditedCaptions] = useState<Record<string, string>>({});

  const loadMyState = useCallback(async () => {
    try {
      const { state } = await db.myState();
      setLikedPosts(state.likedPosts);
      setSavedPosts(state.savedPosts);
      setFollowedPets(state.followedPets);
      setFollowedUsers(state.followedUsers);
      setMyPets(state.myPets);
    } catch {}
  }, []);

  // Restaurar sesión al abrir
  useEffect(() => {
    (async () => {
      try {
        const token = await loadToken();
        if (token) {
          const { user: u } = await auth.me();
          setUser(u);
          setVerifiedPhoneState(u.verifiedPhone);
          await loadMyState();
        }
      } catch {
        await setToken(null);
      }
      // limpiar almacenamiento legado
      AsyncStorage.removeItem(LEGACY_KEY).catch(() => {});
      setAuthReady(true);
      setReady(true);
    })();
  }, [loadMyState]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await auth.login(username, password);
    await setToken(res.token);
    setUser(res.user);
    setVerifiedPhoneState(res.user.verifiedPhone);
    await loadMyState();
  }, [loadMyState]);

  const register = useCallback(async (username: string, name: string, password: string) => {
    const res = await auth.register(username, name, password);
    await setToken(res.token);
    setUser(res.user);
    setVerifiedPhoneState(res.user.verifiedPhone);
    setMyPets([]);
    setLikedPosts([]);
    setSavedPosts([]);
    setFollowedPets([]);
    setFollowedUsers([]);
  }, []);

  const logout = useCallback(async () => {
    try {
      await auth.logout();
    } catch {}
    await setToken(null);
    setUser(null);
    setMyPets([]);
    setLikedPosts([]);
    setSavedPosts([]);
    setFollowedPets([]);
    setFollowedUsers([]);
    setVerifiedPhoneState(null);
    setMyComments({});
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { user: u } = await auth.me();
      setUser(u);
      setVerifiedPhoneState(u.verifiedPhone);
    } catch {}
  }, []);

  const refreshMyPets = useCallback(async () => {
    await loadMyState();
  }, [loadMyState]);

  const toggleIn = (arr: string[], id: string) =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  const toggleLike = useCallback((id: string) => {
    setLikedPosts((a) => {
      const next = toggleIn(a, id);
      db.like(id, next.includes(id)).catch(() => {});
      return next;
    });
  }, []);

  const toggleSave = useCallback((id: string) => {
    setSavedPosts((a) => {
      const next = toggleIn(a, id);
      db.save(id, next.includes(id)).catch(() => {});
      return next;
    });
  }, []);

  const toggleFollowPet = useCallback((id: string) => {
    setFollowedPets((a) => {
      const next = toggleIn(a, id);
      db.follow('pet', id, next.includes(id)).catch(() => {});
      return next;
    });
  }, []);

  const toggleFollowUser = useCallback((id: string) => {
    setFollowedUsers((a) => {
      const next = toggleIn(a, id);
      db.follow('user', id, next.includes(id)).catch(() => {});
      return next;
    });
  }, []);

  const addComment = useCallback((postId: string, text: string) => {
    const comment: Comment = {
      id: `local-${Date.now()}`,
      userId: CURRENT_USER_ID,
      text,
      minutesAgo: 0,
    };
    setMyComments((m) => ({ ...m, [postId]: [...(m[postId] ?? []), comment] }));
    db.comment(postId, text).catch(() => {});
  }, []);

  const setVerifiedPhone = useCallback((phone: string | null) => {
    setVerifiedPhoneState(phone);
    db.setPhone(phone).catch(() => {});
  }, []);

  const notifyPostCreated = useCallback((post: Post) => {
    setCreatedPosts((p) => [post, ...p]);
  }, []);

  const consumeCreatedPosts = useCallback(() => {
    setCreatedPosts([]);
  }, []);

  const markPostDeleted = useCallback((postId: string) => {
    setDeletedPostIds((ids) => (ids.includes(postId) ? ids : [...ids, postId]));
  }, []);

  const markPostEdited = useCallback((postId: string, caption: string) => {
    setEditedCaptions((m) => ({ ...m, [postId]: caption }));
  }, []);

  return (
    <StoreContext.Provider
      value={{
        user,
        authReady,
        login,
        register,
        logout,
        refreshUser,
        myPets,
        refreshMyPets,
        likedPosts,
        savedPosts,
        followedPets,
        followedUsers,
        verifiedPhone,
        toggleLike,
        toggleSave,
        toggleFollowPet,
        toggleFollowUser,
        addComment,
        setVerifiedPhone,
        myComments,
        ready,
        createdPosts,
        notifyPostCreated,
        consumeCreatedPosts,
        deletedPostIds,
        editedCaptions,
        markPostDeleted,
        markPostEdited,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreState {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
