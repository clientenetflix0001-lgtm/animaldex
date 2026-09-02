// ============================================================
// Cliente de la API (auth + datos en Cloudflare D1)
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';

// Backend real: Cloudflare Worker con acceso nativo a D1 (rápido y confiable).
// Las funciones serverless de Vercel no se desplegaban de forma consistente,
// por eso el backend vive aquí, en la misma red que la base de datos y las imágenes.
export const API_ORIGIN = 'https://animaldex-api.animaldex-api.workers.dev';

const TOKEN_KEY = 'animaldex-session-token';

let sessionToken: string | null = null;
let tokenLoaded = false;

export async function loadToken(): Promise<string | null> {
  if (tokenLoaded) return sessionToken;
  tokenLoaded = true;
  try {
    sessionToken = await AsyncStorage.getItem(TOKEN_KEY);
  } catch {}
  return sessionToken;
}

export async function setToken(token: string | null): Promise<void> {
  sessionToken = token;
  tokenLoaded = true;
  try {
    if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
    else await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export function getToken(): string | null {
  return sessionToken;
}

async function call(path: string, body: object): Promise<any> {
  await loadToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  const res = await fetch(`${API_ORIGIN}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const raw = json?.error ?? json?.message;
    const extracted =
      typeof raw === 'string' && raw.trim() && raw !== '[object Object]'
        ? raw.trim()
        : raw && typeof raw === 'object'
          ? String((raw as { message?: string; error?: string }).message || (raw as { error?: string }).error || '').trim()
          : '';
    const err: any = new Error(extracted && extracted !== '[object Object]' ? extracted : `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// ---------- Tipos ----------

export interface ApiUser {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  bio: string;
  location: string;
  verifiedPhone: string | null;
  email?: string | null;
  emailVerified?: boolean;
}

export interface ApiPet {
  id: string;
  userId: string;
  name: string;
  username?: string | null;
  species: string;
  breed: string;
  age: string;
  bio: string;
  emoji: string;
  avatarUrl: string | null;
  createdAt: number;
  profileId?: string | null;
  careStatus?: 'en_adopcion' | 'en_recuperacion' | 'en_casa' | 'perdido' | 'adoptado' | null;
  sex?: string | null;
  birthDate?: string | null;
  size?: 'pequeno' | 'mediano' | 'grande' | null;
  neutered?: boolean | null;
  adoptionStartedAt?: number | null;
  archivedAt?: number | null;
}

export interface ApiPost {
  id: string;
  userId: string;
  petId: string;
  image: string;
  imageWidth?: number | null;
  imageHeight?: number | null;
  caption: string;
  backgroundId?: string | null;
  createdAt: number;
  likeCount: number;
  commentCount: number;
  petName: string | null;
  petEmoji: string | null;
  petAvatar: string | null;
  petSpecies: string | null;
  petUsername?: string | null;
  username: string | null;
  userName: string | null;
  authorProfileId?: string | null;
  authorProfileType?: 'personal' | 'business' | 'protector' | null;
  authorProfileName?: string | null;
  authorProfileUsername?: string | null;
  authorProfileAvatar?: string | null;
}

export interface ApiReel {
  id: string;
  userId: string;
  petId: string | null;
  caption: string;
  status: string;
  moderation?: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  createdAt: number;
  readyAt: number | null;
  likeCount: number;
  commentCount: number;
  isLiked?: boolean;
  petName: string | null;
  petEmoji: string | null;
  petAvatar: string | null;
  petSpecies: string | null;
  petUsername?: string | null;
  username: string | null;
  userName: string | null;
  authorProfileId?: string | null;
  authorProfileType?: 'personal' | 'business' | 'protector' | null;
  authorProfileName?: string | null;
  authorProfileUsername?: string | null;
  authorProfileAvatar?: string | null;
  playbackId: string | null;
  hlsUrl: string | null;
  thumbnailUrl: string | null;
  overlays?: import('./reelOverlays').ReelTextOverlay[];
}

export interface ApiComment {
  id: string;
  userId: string;
  username: string;
  userName: string;
  avatarUrl: string | null;
  text: string;
  createdAt: number;
}

export interface ApiAlert {
  id: string;
  userId: string;
  type: 'lost' | 'sighting' | 'found' | 'adoption';
  status: 'active' | 'resolved';
  petName: string | null;
  species: string;
  breed: string;
  description: string;
  image: string;
  locality: string;
  province: string;
  country: string;
  lat: number | null;
  lon: number | null;
  eventDate: number | null;
  createdAt: number;
  renewedAt?: number | null;
  bumpedAt?: number | null;
  resolvedAt?: number | null;
  resolutionType?: 'found' | 'reunited' | 'adopted' | null;
  sex?: 'macho' | 'hembra' | null;
  authorProfileId?: string | null;
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  username: string | null;
  userName: string | null;
  userAvatar: string | null;
}

export interface ApiListing {
  id: string;
  userId: string;
  kind: 'product' | 'service';
  title: string;
  category: string;
  description: string;
  pricePatitas: number;
  priceArs: number | null;
  stock: number | null;
  deliveryMethod: string | null;
  modality: string | null;
  availability: string | null;
  images: string[];
  locality: string;
  province: string;
  country: string;
  lat: number | null;
  lon: number | null;
  status: 'active' | 'removed';
  featured: boolean;
  viewsCount: number;
  createdAt: number;
  favoriteCount: number;
  commentCount: number;
  isFavorited: boolean;
  username: string | null;
  userName: string | null;
  userAvatar: string | null;
  sellerRating: number | null;
  sellerReviewCount: number;
}

export interface ApiSeller {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  bio: string;
  location: string;
}

export interface ApiSellerStats {
  products: number;
  services: number;
  rating: number | null;
  reviewCount: number;
  followers: number;
}

export interface ApiSellerReview {
  id: string;
  rating: number;
  text: string;
  createdAt: number;
  username: string;
  userName: string;
  avatarUrl: string | null;
}

export interface ApiTag {
  code: number;
  status: 'unclaimed' | 'claimed';
  petId: string | null;
  petName: string | null;
  petEmoji: string | null;
  petAvatar: string | null;
  createdAt: number;
  claimedAt: number | null;
}

export interface ApiNotification {
  id: string;
  type: 'like' | 'comment' | 'follow_user' | 'follow_pet' | 'location' | 'birthday' | 'reel_like' | 'reel_comment';
  actorId: string | null;
  actorName: string;
  actorUsername: string;
  actorAvatar: string | null;
  postId?: string;
  reelId?: string;
  postImage?: string | null;
  petId?: string;
  petUsername?: string | null;
  petName?: string;
  petEmoji?: string;
  title?: string;
  text?: string;
  years?: number | null;
  lat?: number;
  lon?: number;
  accuracy?: number | null;
  smsStatus?: string;
  createdAt: number;
}

// ---------- Auth ----------

export const auth = {
  register: (username: string, name: string, password: string) =>
    call('/auth', { action: 'register', username, name, password }),
  registerEmail: (email: string, password: string, username: string) =>
    call('/auth', { action: 'registerEmail', email, password, username }),
  registerPhone: (phone: string, password: string, username: string, ticket: string) =>
    call('/auth', { action: 'registerPhone', phone, password, username, ticket }),
  login: (identifier: string, password: string) =>
    call('/auth', { action: 'login', identifier, password }),
  checkEmail: (email: string): Promise<{ ok: boolean; available: boolean; reason?: string }> =>
    call('/auth', { action: 'checkEmail', email }),
  me: () => call('/auth', { action: 'me' }),
  logout: () => call('/auth', { action: 'logout' }),
  updateProfile: (fields: { name?: string; bio?: string; location?: string; avatarUrl?: string; username?: string }) =>
    call('/auth', { action: 'updateProfile', ...fields }),
};

// ---------- Datos ----------

export const db = {
  feed: (before?: number, limit = 10): Promise<{ posts: ApiPost[] }> =>
    call('/db', { action: 'feed', before, limit }),
  petPosts: (petId: string): Promise<{ posts: ApiPost[] }> =>
    call('/db', { action: 'petPosts', petId }),
  userPosts: (targetUserId: string): Promise<{ posts: ApiPost[] }> =>
    call('/db', { action: 'userPosts', targetUserId }),
  postDetail: (postId: string): Promise<{ post: ApiPost; comments: ApiComment[] }> =>
    call('/db', { action: 'postDetail', postId }),
  userProfile: (targetUserId: string): Promise<{ user: ApiUser; pets: ApiPet[]; profiles?: import('../features/profiles/profileTypes').PublicProfile[]; stats: { posts: number; followers: number } }> =>
    call('/db', { action: 'userProfile', targetUserId }),
  petProfile: (petId: string): Promise<{ pet: ApiPet; owner: { id: string; username: string; name: string; avatarUrl: string | null } | null; shelter?: import('../features/profiles/profileTypes').PublicProfile | null; stats: { posts: number; followers: number } }> =>
    call('/db', { action: 'petProfile', petId }),
  search: (q: string): Promise<{ pets: ApiPet[]; users: Array<{ id: string; username: string; name: string; avatarUrl: string | null }> }> =>
    call('/db', { action: 'search', q }),
  featuredPets: (): Promise<{ pets: ApiPet[] }> =>
    call('/db', { action: 'featuredPets' }),
  adoptionFeed: (params: {
    locality?: string;
    species?: string;
    size?: string;
    sex?: string;
    before?: number;
    limit?: number;
  }): Promise<{
    items: Array<
      ApiPet & {
        source?: 'protector_pet';
        shelterId?: string | null;
        shelterName?: string | null;
        shelterUsername?: string | null;
        shelterAvatar?: string | null;
        shelterLocation?: string | null;
      }
    >;
    hasMore: boolean;
  }> => call('/db', { action: 'adoptionFeed', ...params }),
  adoptionContact: (petId: string): Promise<{
    petId: string;
    petName: string;
    petUsername: string | null;
    shelterProfileId: string;
    adoptionWhatsapp: string | null;
    adoptionPhone: string | null;
  }> => call('/db', { action: 'adoptionContact', petId }),
  comments: (postId: string): Promise<{ comments: ApiComment[] }> =>
    call('/db', { action: 'comments', postId }),
  myState: (): Promise<{ state: { likedPosts: string[]; savedPosts: string[]; followedPets: string[]; followedUsers: string[]; myPets: ApiPet[] } }> =>
    call('/db', { action: 'myState' }),
  like: (postId: string, value: boolean): Promise<{ likeCount: number }> =>
    call('/db', { action: 'like', postId, value }),
  save: (postId: string, value: boolean) => call('/db', { action: 'save', postId, value }),
  savedPosts: (): Promise<{ posts: ApiPost[] }> => call('/db', { action: 'savedPosts' }),
  follow: (targetType: 'pet' | 'user' | 'profile', targetId: string, value: boolean) =>
    call('/db', { action: 'follow', targetType, targetId, value }),
  publicProfile: (idOrUsername: { profileId?: string; username?: string }): Promise<{
    kind?: 'profile' | 'pet';
    pet?: ApiPet;
    profile?: import('../features/profiles/profileTypes').PublicProfile;
    pets: ApiPet[];
    stats: { pets: number; adoption: number; adopted: number; recovering: number; followers: number };
    transferredPets?: ApiPet[];
    isOwner: boolean;
    isFollowing: boolean;
  }> => call('/db', { action: 'publicProfile', ...idOrUsername }),
  profilePosts: (profileId: string): Promise<{ posts: ApiPost[] }> =>
    call('/db', { action: 'profilePosts', profileId }),
  comment: (postId: string, text: string): Promise<{ id: string; createdAt: number }> =>
    call('/db', { action: 'comment', postId, text }),
  createPost: (
    petId: string,
    image: string,
    caption: string,
    authorProfileId?: string | null,
    imageWidth?: number | null,
    imageHeight?: number | null,
    backgroundId?: string | null
  ): Promise<{ post: ApiPost }> =>
    call('/db', {
      action: 'createPost',
      petId,
      image,
      caption,
      authorProfileId: authorProfileId ?? null,
      imageWidth: imageWidth ?? null,
      imageHeight: imageHeight ?? null,
      backgroundId: backgroundId ?? null,
    }),
  listProfiles: (): Promise<{ profiles: import('../features/profiles/profileTypes').PublicProfile[] }> =>
    call('/db', { action: 'listProfiles' }),
  createProfile: (input: {
    type: 'business' | 'protector';
    name: string;
    username: string;
    bio?: string;
    avatar?: string | null;
    adoptionWhatsapp?: string | null;
    adoptionPhone?: string | null;
  }): Promise<{ profile: import('../features/profiles/profileTypes').PublicProfile }> =>
    call('/db', { action: 'createProfile', ...input }),
  checkProfileUsername: (username: string): Promise<{ ok: boolean; available: boolean; reason?: string }> =>
    call('/db', { action: 'checkProfileUsername', username }),
  updatePublicProfile: (input: {
    profileId: string;
    name: string;
    username: string;
    bio?: string;
    location?: string;
    locality?: string | null;
    phone?: string;
    avatar?: string | null;
    adoptionWhatsapp?: string | null;
    adoptionPhone?: string | null;
  }): Promise<{ profile: import('../features/profiles/profileTypes').PublicProfile }> =>
    call('/db', { action: 'updatePublicProfile', ...input }),
  updatePost: (postId: string, caption: string): Promise<{ caption: string }> =>
    call('/db', { action: 'updatePost', postId, caption }),
  deletePost: (postId: string): Promise<{ imageDeleted: boolean }> =>
    call('/db', { action: 'deletePost', postId }),
  createPet: (pet: {
    name: string;
    username?: string;
    species: string;
    breed?: string;
    bio?: string;
    emoji?: string;
    avatarUrl?: string;
    profileId?: string | null;
    careStatus?: ApiPet['careStatus'];
    birthDate?: string | null;
    size?: ApiPet['size'];
    sex?: 'macho' | 'hembra' | null;
    neutered?: boolean | null;
  }): Promise<{ pet: ApiPet }> => call('/db', { action: 'createPet', ...pet }),
  checkPetUsername: (
    username: string,
    excludePetId?: string
  ): Promise<{ ok: boolean; available: boolean; reason?: string; suggestion?: string | null }> =>
    call('/db', { action: 'checkPetUsername', username, excludePetId }),
  updatePet: (petId: string, fields: Partial<ApiPet>) =>
    call('/db', { action: 'updatePet', petId, ...fields }),
  archivePet: (petId: string): Promise<{ ok: boolean }> => call('/db', { action: 'archivePet', petId }),
  deletePet: (petId: string): Promise<{ ok: boolean }> => call('/db', { action: 'deletePet', petId }),
  setPhone: (phone: string | null, ticket?: string) =>
    call('/db', { action: 'setPhone', phone, ticket: ticket || undefined }),
  registerImage: (url: string, cfId?: string, kind?: string) =>
    call('/db', { action: 'registerImage', url, cfId, kind }),
  // ---------- Tiempo real (actualizaciones incrementales) ----------
  updates: (since: number, excludeUserId?: string): Promise<{ newPosts: number; latest: number }> =>
    call('/db', { action: 'updates', since, excludeUserId: excludeUserId ?? '' }),
  feedSince: (since: number, excludeUserId?: string): Promise<{ posts: ApiPost[] }> =>
    call('/db', { action: 'feedSince', since, excludeUserId: excludeUserId ?? '' }),
  postUpdates: (
    postId: string,
    since: number
  ): Promise<{ likeCount: number; commentCount: number; newComments: ApiComment[] }> =>
    call('/db', { action: 'postUpdates', postId, since }),
  counts: (postIds: string[]): Promise<{ counts: Record<string, { likes: number; comments: number }> }> =>
    call('/db', { action: 'counts', postIds }),
  notifications: (): Promise<{ notifications: ApiNotification[] }> =>
    call('/db', { action: 'notifications' }),
  registerPushToken: (
    expoPushToken: string,
    platform: string,
    deviceId?: string | null
  ): Promise<{ ok: boolean }> =>
    call('/db', { action: 'registerPushToken', expoPushToken, platform, deviceId }),
  unregisterPushToken: (expoPushToken: string): Promise<{ ok: boolean }> =>
    call('/db', { action: 'unregisterPushToken', expoPushToken }),
  // Ubicación GPS compartida con consentimiento visible del visitante,
  // enviada por SMS al dueño de la mascota (requiere que tenga tel. verificado).
  shareLocation: (
    petId: string,
    lat: number,
    lon: number,
    accuracy?: number
  ): Promise<{ status: string; notified: boolean }> =>
    call('/db', { action: 'shareLocation', petId, lat, lon, accuracy }),

  // ---------- Chapitas QR (links de invitación) ----------
  // Público: no requiere sesión (se llama antes de que el usuario se registre).
  tagStatus: (
    code: number
  ): Promise<{ ok: boolean; exists: boolean; status?: 'unclaimed' | 'claimed'; pet?: ApiPet | null }> =>
    call('/db', { action: 'tagStatus', code }),
  // Requiere sesión: vincula la chapita a una mascota recién creada.
  claimTag: (code: number, petId: string): Promise<{ ok: boolean }> =>
    call('/db', { action: 'claimTag', code, petId }),
  // Solo admin (lucasfuentes): genera un nuevo código y lista todos los existentes.
  createTag: (): Promise<{ ok: boolean; code: number }> => call('/db', { action: 'createTag' }),
  listTags: (): Promise<{ ok: boolean; tags: ApiTag[] }> => call('/db', { action: 'listTags' }),

  // ---------- Alertas (animales perdidos/encontrados) ----------
  alertsFeed: (locality: string, before?: number, limit = 10): Promise<{ alerts: ApiAlert[]; hasMore: boolean }> =>
    call('/db', { action: 'alertsFeed', locality, before, limit }),
  alertDetail: (alertId: string): Promise<{ alert: ApiAlert }> => call('/db', { action: 'alertDetail', alertId }),
  alertComments: (alertId: string): Promise<{ comments: ApiComment[] }> =>
    call('/db', { action: 'alertComments', alertId }),
  createAlert: (alert: {
    type: 'lost' | 'sighting' | 'found' | 'adoption';
    petName?: string;
    species: string;
    breed?: string;
    description: string;
    image: string;
    locality: string;
    province?: string;
    lat?: number | null;
    lon?: number | null;
    eventDate?: number;
    sex?: 'macho' | 'hembra' | null;
    authorProfileId?: string | null;
    contactWhatsapp?: string | null;
    contactPhone?: string | null;
  }): Promise<{ alert: ApiAlert }> => call('/db', { action: 'createAlert', ...alert }),
  myAlerts: (tab: 'active' | 'resolved', before?: number, limit = 20): Promise<{ alerts: ApiAlert[]; hasMore: boolean }> =>
    call('/db', { action: 'myAlerts', tab, before, limit }),
  resolveAlert: (alertId: string, resolutionType?: string): Promise<{ alert: ApiAlert }> =>
    call('/db', { action: 'resolveAlert', alertId, resolutionType }),
  renewAlert: (alertId: string): Promise<{ alert: ApiAlert }> =>
    call('/db', { action: 'renewAlert', alertId }),
  deleteAlert: (alertId: string): Promise<{ ok: boolean }> =>
    call('/db', { action: 'deleteAlert', alertId }),
  alertLike: (alertId: string, value: boolean): Promise<{ likeCount: number }> =>
    call('/db', { action: 'alertLike', alertId, value }),
  alertComment: (alertId: string, text: string): Promise<{ id: string; createdAt: number }> =>
    call('/db', { action: 'alertComment', alertId, text }),
  alertAdoptionContact: (alertId: string): Promise<{
    alertId: string;
    petName: string | null;
    shelterProfileId: string | null;
    adoptionWhatsapp: string | null;
    adoptionPhone: string | null;
  }> => call('/db', { action: 'alertAdoptionContact', alertId }),

  // ---------- Mercado (productos y servicios) ----------
  listingsFeed: (params: {
    kind: 'product' | 'service';
    locality?: string;
    category?: string;
    section?: 'featured' | 'nearby' | 'top_rated' | 'recent';
    q?: string;
    before?: number;
    limit?: number;
  }): Promise<{ listings: ApiListing[]; hasMore: boolean }> => call('/db', { action: 'listingsFeed', ...params }),
  listingDetail: (listingId: string): Promise<{ listing: ApiListing }> =>
    call('/db', { action: 'listingDetail', listingId }),
  listingComments: (listingId: string): Promise<{ comments: ApiComment[] }> =>
    call('/db', { action: 'listingComments', listingId }),
  listingView: (listingId: string): Promise<{ ok: boolean }> => call('/db', { action: 'listingView', listingId }),
  createListing: (listing: {
    kind: 'product' | 'service';
    title: string;
    category: string;
    description: string;
    pricePatitas: number;
    priceArs?: number;
    stock?: number;
    deliveryMethod?: string;
    modality?: string;
    availability?: string;
    images: string[];
    locality: string;
    province?: string;
    lat?: number | null;
    lon?: number | null;
  }): Promise<{ listing: ApiListing }> => call('/db', { action: 'createListing', ...listing }),
  deleteListing: (listingId: string): Promise<{ ok: boolean }> => call('/db', { action: 'deleteListing', listingId }),
  listingFavorite: (listingId: string, value: boolean): Promise<{ favoriteCount: number }> =>
    call('/db', { action: 'listingFavorite', listingId, value }),
  myFavoriteListings: (): Promise<{ listings: ApiListing[] }> => call('/db', { action: 'myFavoriteListings' }),
  listingComment: (listingId: string, text: string): Promise<{ id: string; createdAt: number }> =>
    call('/db', { action: 'listingComment', listingId, text }),
  sellerProfile: (targetUserId: string): Promise<{ seller: ApiSeller; stats: ApiSellerStats }> =>
    call('/db', { action: 'sellerProfile', targetUserId }),
  sellerListings: (targetUserId: string, kind: 'product' | 'service'): Promise<{ listings: ApiListing[] }> =>
    call('/db', { action: 'sellerListings', targetUserId, kind }),
  sellerReviews: (targetUserId: string): Promise<{ reviews: ApiSellerReview[] }> =>
    call('/db', { action: 'sellerReviews', targetUserId }),
  sellerReview: (targetUserId: string, rating: number, text?: string): Promise<{ ok: boolean }> =>
    call('/db', { action: 'sellerReview', targetUserId, rating, text }),

  reelsFeed: (before?: number, limit = 10): Promise<{ reels: ApiReel[]; hasMore: boolean }> =>
    call('/db', { action: 'reelsFeed', before, limit }),
  profileReels: (profileId: string, before?: number, limit = 12): Promise<{ reels: ApiReel[]; hasMore: boolean }> =>
    call('/db', { action: 'profileReels', profileId, before, limit }),
  petReels: (petId: string, before?: number, limit = 12): Promise<{ reels: ApiReel[]; hasMore: boolean }> =>
    call('/db', { action: 'petReels', petId, before, limit }),
  userReels: (userId: string, before?: number, limit = 12): Promise<{ reels: ApiReel[]; hasMore: boolean }> =>
    call('/db', { action: 'userReels', userId, before, limit }),
  reelDetail: (reelId: string): Promise<{ reel: ApiReel; comments: ApiComment[] }> =>
    call('/db', { action: 'reelDetail', reelId }),
  reelComments: (reelId: string): Promise<{ comments: ApiComment[] }> =>
    call('/db', { action: 'reelComments', reelId }),
  createReelUpload: (input: {
    mime: string;
    byteSize?: number | null;
    durationMs?: number | null;
    caption?: string;
    petId?: string | null;
    authorProfileId?: string | null;
    overlays?: import('./reelOverlays').ReelTextOverlay[];
  }): Promise<{ reelId: string; uploadUrl: string; timeoutSec: number }> =>
    call('/db', { action: 'createReelUpload', ...input }),
  completeReelUpload: (reelId: string): Promise<{ status: string }> =>
    call('/db', { action: 'completeReelUpload', reelId }),
  cancelReelUpload: (reelId: string): Promise<{ ok: boolean }> =>
    call('/db', { action: 'cancelReelUpload', reelId }),
  myReel: (reelId: string): Promise<{ reel: ApiReel }> => call('/db', { action: 'myReel', reelId }),
  myReelState: (): Promise<{
    state: { likedReels: string[]; pendingReels?: ApiReel[]; failedReels?: ApiReel[] };
  }> => call('/db', { action: 'myReelState' }),
  reelLike: (reelId: string, value: boolean): Promise<{ likeCount: number }> =>
    call('/db', { action: 'reelLike', reelId, value }),
  reelComment: (reelId: string, text: string): Promise<{ id: string; createdAt: number }> =>
    call('/db', { action: 'reelComment', reelId, text }),
  deleteReel: (reelId: string): Promise<{ ok: boolean; muxDeleted?: boolean }> =>
    call('/db', { action: 'deleteReel', reelId }),
};

// ---------- Helpers ----------

export function timeAgoMinutes(createdAt: number): number {
  return Math.max(0, Math.floor((Date.now() - createdAt) / 60000));
}
