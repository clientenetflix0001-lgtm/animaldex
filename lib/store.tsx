import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Post, Comment, CURRENT_USER_ID } from './data';
import { auth, db, setToken, loadToken, ApiUser, ApiPet, ApiPost, timeAgoMinutes } from './db';
import { unregisterThen } from './push';

// Convierte un post de la API al formato interno de la app
export function apiPostToPost(p: ApiPost): Post {
  return {
    id: p.id,
    petId: p.petId,
    image: p.image,
    imageWidth: p.imageWidth ?? undefined,
    imageHeight: p.imageHeight ?? undefined,
    caption: p.caption,
    backgroundId: p.backgroundId ?? null,
    likes: p.likeCount,
    minutesAgo: timeAgoMinutes(p.createdAt),
    comments: [],
    real: true,
    authorUserId: p.userId,
    petName: p.petName ?? 'Mascota',
    petEmoji: p.petEmoji ?? '🐾',
    petSpecies: p.petSpecies ?? 'perro',
    petAvatarUrl: p.petAvatar,
    petUsername: p.petUsername ?? undefined,
    username: p.username ?? 'usuario',
    commentCount: p.commentCount,
    authorProfileId: p.authorProfileId ?? undefined,
    authorProfileType: p.authorProfileType ?? undefined,
    authorProfileName: p.authorProfileName ?? undefined,
    authorProfileUsername: p.authorProfileUsername ?? undefined,
    authorProfileAvatar: p.authorProfileAvatar ?? undefined,
  };
}

interface StoreState {
  // Sesión
  user: ApiUser | null;
  authReady: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (username: string, name: string, password: string) => Promise<void>;
  registerEmail: (email: string, password: string, username: string) => Promise<void>;
  registerPhone: (phone: string, password: string, username: string, ticket: string) => Promise<void>;
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
  setVerifiedPhone: (phone: string | null, ticket?: string) => void;
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
  // Chapita QR pendiente: código detectado al abrir un link ?qr=xx antes
  // de saber si el usuario ya está autenticado. Persiste en disco para
  // sobrevivir al flujo de registro/login (incluso si la app se recarga).
  pendingTagCode: string | null;
  setPendingTagCode: (code: string | null) => void;
}

const StoreContext = createContext<StoreState | null>(null);

const LEGACY_KEY = 'petgram-store-v1';
const PENDING_TAG_KEY = 'animaldex-pending-tag-code';

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
  const [pendingTagCode, setPendingTagCodeState] = useState<string | null>(null);

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
      // Restaurar chapita QR pendiente (por si el usuario cerró la app
      // a mitad del registro después de escanear una chapita).
      try {
        const saved = await AsyncStorage.getItem(PENDING_TAG_KEY);
        if (saved) setPendingTagCodeState(saved);
      } catch {}
      // limpiar almacenamiento legado
      AsyncStorage.removeItem(LEGACY_KEY).catch(() => {});
      setAuthReady(true);
      setReady(true);
    })();
  }, [loadMyState]);

  const setPendingTagCode = useCallback((code: string | null) => {
    setPendingTagCodeState(code);
    if (code == null) AsyncStorage.removeItem(PENDING_TAG_KEY).catch(() => {});
    else AsyncStorage.setItem(PENDING_TAG_KEY, String(code)).catch(() => {});
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await auth.login(identifier, password);
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

  const applyNewSession = useCallback(async (res: { token: string; user: ApiUser }) => {
    await setToken(res.token);
    setUser(res.user);
    setVerifiedPhoneState(res.user.verifiedPhone);
    setMyPets([]);
    setLikedPosts([]);
    setSavedPosts([]);
    setFollowedPets([]);
    setFollowedUsers([]);
  }, []);

  const registerEmail = useCallback(async (email: string, password: string, username: string) => {
    const res = await auth.registerEmail(email, password, username);
    await applyNewSession(res);
  }, [applyNewSession]);

  const registerPhone = useCallback(async (phone: string, password: string, username: string, ticket: string) => {
    const res = await auth.registerPhone(phone, password, username, ticket);
    await applyNewSession(res);
  }, [applyNewSession]);

  const logout = useCallback(async () => {
    await unregisterThen(async () => {
      try {
        await auth.logout();
      } catch {}
    });
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

  const setVerifiedPhone = useCallback((phone: string | null, ticket?: string) => {
    setVerifiedPhoneState(phone);
    db.setPhone(phone, ticket).catch(() => {});
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

  // El valor del contexto se memoiza: como objeto literal se recreaba en
  // cada render del provider y despertaba a todos los consumidores aunque
  // ningún dato hubiera cambiado.
  const value = useMemo<StoreState>(
    () => ({
      user,
      authReady,
      login,
      register,
      registerEmail,
      registerPhone,
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
      pendingTagCode,
      setPendingTagCode,
    }),
    [
      user,
      authReady,
      login,
      register,
      registerEmail,
      registerPhone,
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
      pendingTagCode,
      setPendingTagCode,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreState {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
