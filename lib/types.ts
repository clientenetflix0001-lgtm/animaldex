export type RootStackParamList = {
  Auth: undefined;
  Tabs: undefined;
  Explorar: undefined;
  PetProfile: { petId: string };
  UserProfile: { userId: string };
  PostDetail: { postId: string; d?: string };
  VerifyPhone: undefined;
  AddPet: { tagCode?: number } | undefined;
  EditProfile: undefined;
  QRScanner: undefined;
  TagWelcome: { code: number };
  AdminTags: undefined;
  CreateAlert: undefined;
  AlertDetail: { alertId: string };
  CreateListing: undefined;
  ListingDetail: { listingId: string };
  SellerShop: { userId: string };
  MarketFavorites: undefined;
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
