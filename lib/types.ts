export type RootStackParamList = {
  Auth: { mode?: 'login' | 'register' } | undefined;
  Tabs: undefined;
  Explorar: undefined;
  PetProfile: { petId: string };
  UserProfile: { userId: string };
  PostDetail: { postId: string; d?: string };
  VerifyPhone: undefined;
  AddPet: { tagCode?: number; petId?: string; profileId?: string } | undefined;
  EditProfile: undefined;
  EditPublicProfile: { profileId: string };
  QRScanner: undefined;
  TagWelcome: { code: number };
  AdminTags: undefined;
  CreateAlert: undefined;
  AlertDetail: { alertId: string };
  CreateListing: undefined;
  ListingDetail: { listingId: string };
  SellerShop: { userId: string };
  MarketFavorites: undefined;
  PublicProfile: { profileId?: string; username?: string };
};

export type TabParamList = {
  Inicio: undefined;
  Reels: undefined;
  Alertas: undefined;
  Mercado: undefined;
  Crear: undefined;
  Actividad: undefined;
  Perfil: undefined;
};
