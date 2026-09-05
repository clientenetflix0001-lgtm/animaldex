import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabProfileStackParamList = {
  TabRoot: undefined;
  PetProfile: { petId: string; fromQr?: boolean };
  PetTransferRequest: { requestId: string };
  PublicProfile: { profileId?: string; username?: string };
  UserProfile: { userId: string };
  AdoptionDiscovery: undefined;
};

export type TabParamList = {
  Inicio: NavigatorScreenParams<TabProfileStackParamList> | undefined;
  Reels: NavigatorScreenParams<TabProfileStackParamList> | undefined;
  Alertas: NavigatorScreenParams<TabProfileStackParamList> | undefined;
  Mercado: NavigatorScreenParams<TabProfileStackParamList> | undefined;
  Crear: undefined;
  Mascotas: NavigatorScreenParams<TabProfileStackParamList> | undefined;
  Actividad: NavigatorScreenParams<TabProfileStackParamList> | undefined;
  Perfil: NavigatorScreenParams<TabProfileStackParamList> | undefined;
};

export type RootStackParamList = {
  Auth: { mode?: 'login' | 'register' } | undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Explorar: undefined;
  PetProfile: { petId: string; fromQr?: boolean };
  PetTransferRequest: { requestId: string };
  UserProfile: { userId: string };
  PostDetail: { postId: string; d?: string };
  VerifyPhone: undefined;
  AddPet: { tagCode?: string; petId?: string; profileId?: string } | undefined;
  EditProfile: undefined;
  EditPublicProfile: { profileId: string };
  QRScanner: undefined;
  TagWelcome: { code: string };
  AdminTags: undefined;
  CreateAlert: undefined;
  MyAlerts: undefined;
  AlertDetail: { alertId: string };
  CreateListing: undefined;
  ListingDetail: { listingId: string };
  SellerShop: { userId: string };
  MarketFavorites: undefined;
  PublicProfile: { profileId?: string; username?: string };
  AdoptionDiscovery: undefined;
  CreatePost: undefined;
  CreateReel: undefined;
  CreateStory: undefined;
  StoryViewer: {
    source: 'self' | 'identity' | 'breed';
    authorUserId?: string;
    authorProfileId?: string;
    authorProfileType?: string;
    authorPetId?: string;
    breedSpecies?: string;
    breedKey?: string;
    startStoryId?: string;
  };
  StoryMoreBreeds: undefined;
  ReelViewer: {
    reelId: string;
    scope?: 'profile' | 'pet' | 'user' | 'feed';
    scopeId?: string;
    initialReels?: import('./db').ApiReel[];
    initialIndex?: number;
  };
};
