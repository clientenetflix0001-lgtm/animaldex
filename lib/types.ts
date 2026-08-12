export type RootStackParamList = {
  Auth: undefined;
  Tabs: undefined;
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
};

export type TabParamList = {
  Inicio: undefined;
  Reels: undefined;
  Alertas: undefined;
  Explorar: undefined;
  Crear: undefined;
  Actividad: undefined;
  Perfil: undefined;
};
